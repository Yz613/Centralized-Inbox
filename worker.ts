import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database, Fetcher, ExecutionContext, ForwardableEmailMessage } from '@cloudflare/workers-types';
import { verifyMailConnection, fetchImapThreads, sendSmtpEmail } from './mailService';
import { GoogleGenAI } from '@google/genai';
import PostalMime from 'postal-mime';

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  ENVIRONMENT?: string;
  FORWARD_EMAIL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

// Health Check
app.get('/api/health', async (c) => {
  let dbStatus = 'ok';
  try {
    const check = await c.env.DB.prepare('SELECT 1 as val').first();
    if (!check) dbStatus = 'error';
  } catch (err: any) {
    dbStatus = err?.message || 'error';
  }

  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT || 'production',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    hasGeminiKey: Boolean(c.env.GEMINI_API_KEY),
  });
});

// PROJECTS CRUD
app.get('/api/projects', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, name, description, color, accent_color as accentColor, created_at as createdAt FROM projects ORDER BY created_at ASC'
    ).all();

    // Map each project to include inboxIds
    const inboxes = await c.env.DB.prepare('SELECT id, project_id FROM inboxes').all();
    const inboxMap = new Map<string, string[]>();
    for (const row of inboxes.results as any[]) {
      const list = inboxMap.get(row.project_id) || [];
      list.push(row.id);
      inboxMap.set(row.project_id, list);
    }

    const projects = (results || []).map((p: any) => ({
      ...p,
      inboxIds: inboxMap.get(p.id) || [],
    }));

    return c.json({ projects });
  } catch (err: any) {
    console.error('Error fetching projects:', err);
    return c.json({ error: 'Failed to fetch projects', details: err?.message }, 500);
  }
});

app.post('/api/projects', async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || `proj-${Date.now()}`;
    const createdAt = body.createdAt || new Date().toISOString();

    await c.env.DB.prepare(
      'INSERT OR REPLACE INTO projects (id, name, description, color, accent_color, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, body.name, body.description || '', body.color || '#2563EB', body.accentColor || '#DBEAFE', createdAt)
      .run();

    return c.json({
      project: {
        id,
        name: body.name,
        description: body.description || '',
        color: body.color || '#2563EB',
        accentColor: body.accentColor || '#DBEAFE',
        inboxIds: [],
        createdAt,
      },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to create project', details: err?.message }, 500);
  }
});

app.put('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    await c.env.DB.prepare(
      `UPDATE projects SET 
        name = COALESCE(?, name), 
        description = COALESCE(?, description), 
        color = COALESCE(?, color), 
        accent_color = COALESCE(?, accent_color) 
       WHERE id = ?`
    )
      .bind(body.name ?? null, body.description ?? null, body.color ?? null, body.accentColor ?? null, id)
      .run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to update project', details: err?.message }, 500);
  }
});

app.delete('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // Cascade cleanup: messages, threads, inboxes, and project
    await c.env.DB.prepare(
      'DELETE FROM messages WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ?)'
    ).bind(id).run();
    await c.env.DB.prepare('DELETE FROM threads WHERE project_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM inboxes WHERE project_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return c.json({ success: true, deletedId: id });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete project', details: err?.message }, 500);
  }
});

// INBOXES CRUD
app.get('/api/inboxes', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, project_id as projectId, name, email, channel, role, 
              badge_color as badgeColor, status, last_synced_at as lastSyncedAt, 
              imap_host as imapHost, imap_port as imapPort, 
              smtp_host as smtpHost, smtp_port as smtpPort, 
              app_password as appPassword, auth_type as authType, 
              zoho_region as zohoRegion 
       FROM inboxes ORDER BY created_at ASC`
    ).all();

    const inboxes = (results || []).map((i: any) => ({
      ...i,
      unreadCount: 0,
      isLiveConnected: Boolean(i.appPassword) || i.channel === 'gmail',
      zohoAppPassword: i.channel === 'zoho' ? i.appPassword : undefined,
    }));

    return c.json({ inboxes });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch inboxes', details: err?.message }, 500);
  }
});

app.post('/api/inboxes', async (c) => {
  try {
    const b = await c.req.json();
    const id = b.id || `inbox-${Date.now()}`;
    const createdAt = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO inboxes 
       (id, project_id, name, email, channel, role, badge_color, status, last_synced_at, imap_host, imap_port, smtp_host, smtp_port, app_password, auth_type, zoho_region, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        b.projectId,
        b.name,
        b.email,
        b.channel,
        b.role,
        b.badgeColor || '#4B5563',
        b.status || 'connected',
        b.lastSyncedAt || createdAt,
        b.imapHost || null,
        b.imapPort || 993,
        b.smtpHost || null,
        b.smtpPort || 465,
        b.appPassword || b.zohoAppPassword || null,
        b.authType || 'app_password',
        b.zohoRegion || null,
        createdAt
      )
      .run();

    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: 'Failed to save inbox', details: err?.message }, 500);
  }
});

app.delete('/api/inboxes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM inboxes WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete inbox', details: err?.message }, 500);
  }
});

app.put('/api/inboxes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    await c.env.DB.prepare(
      `UPDATE inboxes SET 
        name = COALESCE(?, name), 
        email = COALESCE(?, email), 
        role = COALESCE(?, role), 
        badge_color = COALESCE(?, badge_color),
        project_id = COALESCE(?, project_id)
       WHERE id = ?`
    )
      .bind(b.name ?? null, b.email ?? null, b.role ?? null, b.badgeColor ?? null, b.projectId ?? null, id)
      .run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to update inbox', details: err?.message }, 500);
  }
});

// THREADS & MESSAGES QUERY
app.get('/api/threads', async (c) => {
  try {
    const projectId = c.req.query('projectId');
    const inboxId = c.req.query('inboxId');

    let query = 'SELECT * FROM threads WHERE 1=1';
    const params: any[] = [];

    if (projectId && projectId !== 'all') {
      query += ' AND project_id = ?';
      params.push(projectId);
    }
    if (inboxId && inboxId !== 'all') {
      query += ' AND inbox_id = ?';
      params.push(inboxId);
    }

    query += ' ORDER BY last_message_timestamp DESC LIMIT 50';

    const stmt = c.env.DB.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

    if (!results || results.length === 0) {
      return c.json({ threads: [] });
    }

    // Fetch messages for all threads in parallel
    const threadsWithMessages = await Promise.all(
      (results as any[]).map(async (t) => {
        const msgRows = await c.env.DB.prepare(
          'SELECT * FROM messages WHERE thread_id = ? ORDER BY timestamp ASC'
        )
          .bind(t.id)
          .all();

        const messages = (msgRows.results || []).map((m: any) => ({
          id: m.id,
          threadId: m.thread_id,
          inboxId: m.inbox_id,
          projectId: m.project_id,
          channel: m.channel,
          inboxRole: m.inbox_role,
          from: JSON.parse(m.from_json || '{}'),
          to: JSON.parse(m.to_json || '[]'),
          cc: m.cc_json ? JSON.parse(m.cc_json) : undefined,
          bcc: m.bcc_json ? JSON.parse(m.bcc_json) : undefined,
          subject: m.subject,
          bodyText: m.body_text,
          bodyHtml: m.body_html || undefined,
          timestamp: m.timestamp,
          isOutgoing: Boolean(m.is_outgoing),
          messageId: m.message_id || undefined,
          inReplyTo: m.in_reply_to || undefined,
          references: m.references_json ? JSON.parse(m.references_json) : undefined,
          attachments: m.attachments_json ? JSON.parse(m.attachments_json) : undefined,
        }));

        return {
          id: t.id,
          projectId: t.project_id,
          inboxId: t.inbox_id,
          channel: t.channel,
          inboxRole: t.inbox_role,
          subject: t.subject,
          snippet: t.snippet,
          participants: JSON.parse(t.participants_json || '[]'),
          lastMessageTimestamp: t.last_message_timestamp,
          messageCount: t.message_count || messages.length || 1,
          isRead: Boolean(t.is_read),
          isStarred: Boolean(t.is_starred),
          isArchived: Boolean(t.is_archived),
          tags: JSON.parse(t.tags_json || '[]'),
          messages,
        };
      })
    );

    return c.json({ threads: threadsWithMessages });
  } catch (err: any) {
    console.error('Error fetching threads:', err);
    return c.json({ error: 'Failed to fetch threads', details: err?.message }, 500);
  }
});

// Thread Flag Updates in D1
app.post('/api/threads/:id/read', async (c) => {
  const id = c.req.param('id');
  const { isRead } = await c.req.json();
  await c.env.DB.prepare('UPDATE threads SET is_read = ?, updated_at = ? WHERE id = ?')
    .bind(isRead ? 1 : 0, new Date().toISOString(), id)
    .run();
  return c.json({ success: true });
});

app.post('/api/threads/:id/star', async (c) => {
  const id = c.req.param('id');
  const { isStarred } = await c.req.json();
  await c.env.DB.prepare('UPDATE threads SET is_starred = ?, updated_at = ? WHERE id = ?')
    .bind(isStarred ? 1 : 0, new Date().toISOString(), id)
    .run();
  return c.json({ success: true });
});

app.post('/api/threads/:id/archive', async (c) => {
  const id = c.req.param('id');
  const { isArchived } = await c.req.json();
  await c.env.DB.prepare('UPDATE threads SET is_archived = ?, updated_at = ? WHERE id = ?')
    .bind(isArchived ? 1 : 0, new Date().toISOString(), id)
    .run();
  return c.json({ success: true });
});

app.delete('/api/threads/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM threads WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM messages WHERE thread_id = ?').bind(id).run();
  return c.json({ success: true });
});

app.put('/api/threads/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const tagsJson = b.tags ? JSON.stringify(b.tags) : null;
    await c.env.DB.prepare(
      `UPDATE threads SET 
        subject = COALESCE(?, subject),
        tags_json = COALESCE(?, tags_json),
        updated_at = ?
       WHERE id = ?`
    )
      .bind(b.subject ?? null, tagsJson, new Date().toISOString(), id)
      .run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Failed to update thread', details: err?.message }, 500);
  }
});

app.post('/api/threads', async (c) => {
  try {
    const b = await c.req.json();
    const id = b.id || `thread-${Date.now()}`;
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO threads 
       (id, project_id, inbox_id, channel, inbox_role, subject, snippet, participants_json, last_message_timestamp, message_count, is_read, is_starred, is_archived, tags_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        b.projectId,
        b.inboxId,
        b.channel || 'gmail',
        b.role || b.inboxRole || 'support',
        b.subject || '(No Subject)',
        b.snippet || '',
        JSON.stringify(b.participants || []),
        b.lastMessageTimestamp || now,
        b.messageCount || 1,
        b.isRead ? 1 : 0,
        b.isStarred ? 1 : 0,
        b.isArchived ? 1 : 0,
        JSON.stringify(b.tags || []),
        b.createdAt || now,
        now
      )
      .run();
    return c.json({ success: true, id });
  } catch (err: any) {
    return c.json({ error: 'Failed to save thread', details: err?.message }, 500);
  }
});

// REAL MAIL API ENDPOINTS WITH D1 PERSISTENCE
app.post('/api/mail/verify', async (c) => {
  try {
    const { email, password, appPassword, imapHost, imapPort, smtpHost, smtpPort } = await c.req.json();
    const pwd = password || appPassword;
    if (!email || !pwd) {
      return c.json({ success: false, message: 'Email and App Password are required' }, 400);
    }

    const isZoho = email.toLowerCase().includes('zoho') || (imapHost && imapHost.includes('zoho'));
    const defaultImap = isZoho ? 'imap.zoho.com' : 'imap.gmail.com';
    const defaultSmtp = isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com';

    const result = await verifyMailConnection({
      email,
      password: pwd,
      imapHost: imapHost || defaultImap,
      imapPort: Number(imapPort) || 993,
      smtpHost: smtpHost || defaultSmtp,
      smtpPort: Number(smtpPort) || 465,
    });

    return c.json(result);
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'Verification process encountered an error' }, 500);
  }
});

app.post('/api/mail/fetch', async (c) => {
  try {
    const { email, password, appPassword, imapHost, imapPort, limit, projectId, inboxId, role, channel } =
      await c.req.json();
    const pwd = password || appPassword;
    if (!email || !pwd) {
      return c.json({ success: false, message: 'Email and App Password are required' }, 400);
    }

    const isZoho = channel === 'zoho' || email.toLowerCase().includes('zoho') || (imapHost && imapHost.includes('zoho'));
    const host = imapHost || (isZoho ? 'imap.zoho.com' : 'imap.gmail.com');

    const threads = await fetchImapThreads({
      config: {
        email,
        password: pwd,
        imapHost: host,
        imapPort: Number(imapPort) || 993,
        smtpHost: '',
      },
      limit: Number(limit) || 20,
      projectId,
      inboxId,
      role,
      channel: channel || (isZoho ? 'zoho' : 'gmail'),
    });

    // Automatically persist fetched threads and messages into Cloudflare D1
    const now = new Date().toISOString();
    for (const thread of threads) {
      try {
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO threads 
           (id, project_id, inbox_id, channel, inbox_role, subject, snippet, participants_json, last_message_timestamp, message_count, is_read, is_starred, is_archived, tags_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            thread.id,
            thread.projectId,
            thread.inboxId,
            thread.channel,
            thread.inboxRole,
            thread.subject,
            thread.snippet,
            JSON.stringify(thread.participants),
            thread.lastMessageTimestamp,
            thread.messageCount,
            thread.isRead ? 1 : 0,
            thread.isStarred ? 1 : 0,
            thread.isArchived ? 1 : 0,
            JSON.stringify(thread.tags),
            now,
            now
          )
          .run();

        for (const msg of thread.messages) {
          await c.env.DB.prepare(
            `INSERT OR REPLACE INTO messages
             (id, thread_id, inbox_id, project_id, channel, inbox_role, from_json, to_json, cc_json, bcc_json, subject, body_text, body_html, timestamp, is_outgoing, message_id, in_reply_to, references_json, attachments_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              msg.id,
              thread.id,
              msg.inboxId,
              msg.projectId,
              msg.channel,
              msg.inboxRole,
              JSON.stringify(msg.from),
              JSON.stringify(msg.to),
              msg.cc ? JSON.stringify(msg.cc) : null,
              msg.bcc ? JSON.stringify(msg.bcc) : null,
              msg.subject,
              msg.bodyText,
              msg.bodyHtml || null,
              msg.timestamp,
              msg.isOutgoing ? 1 : 0,
              msg.messageId || null,
              msg.inReplyTo || null,
              msg.references ? JSON.stringify(msg.references) : null,
              msg.attachments ? JSON.stringify(msg.attachments) : null,
              now
            )
            .run();
        }
      } catch (dbErr) {
        console.warn('Failed to insert thread into D1:', dbErr);
      }
    }

    return c.json({ success: true, threads });
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'Failed to fetch emails via IMAP' }, 500);
  }
});

// BATCH IMPORT THREADS & MESSAGES INTO D1
app.post('/api/import/batch', async (c) => {
  try {
    const { threads } = await c.req.json();
    if (!Array.isArray(threads) || threads.length === 0) {
      return c.json({ success: true, threadsImported: 0, messagesImported: 0 });
    }

    const now = new Date().toISOString();
    let threadCount = 0;
    let messageCount = 0;

    for (const thread of threads) {
      try {
        await c.env.DB.prepare(
          `INSERT OR REPLACE INTO threads 
           (id, project_id, inbox_id, channel, inbox_role, subject, snippet, participants_json, last_message_timestamp, message_count, is_read, is_starred, is_archived, tags_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            thread.id,
            thread.projectId,
            thread.inboxId,
            thread.channel || 'gmail',
            thread.inboxRole || 'general',
            thread.subject || '(No Subject)',
            thread.snippet || '',
            JSON.stringify(thread.participants || []),
            thread.lastMessageTimestamp || now,
            thread.messageCount || 1,
            thread.isRead ? 1 : 0,
            thread.isStarred ? 1 : 0,
            thread.isArchived ? 1 : 0,
            JSON.stringify(thread.tags || ['ARCHIVE']),
            now,
            now
          )
          .run();

        threadCount++;

        if (Array.isArray(thread.messages)) {
          for (const msg of thread.messages) {
            await c.env.DB.prepare(
              `INSERT OR REPLACE INTO messages
               (id, thread_id, inbox_id, project_id, channel, inbox_role, from_json, to_json, cc_json, bcc_json, subject, body_text, body_html, timestamp, is_outgoing, message_id, in_reply_to, references_json, attachments_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                msg.id,
                thread.id,
                msg.inboxId || thread.inboxId,
                msg.projectId || thread.projectId,
                msg.channel || thread.channel || 'gmail',
                msg.inboxRole || thread.inboxRole || 'general',
                JSON.stringify(msg.from || {}),
                JSON.stringify(msg.to || []),
                msg.cc ? JSON.stringify(msg.cc) : null,
                msg.bcc ? JSON.stringify(msg.bcc) : null,
                msg.subject || '(No Subject)',
                msg.bodyText || '',
                msg.bodyHtml || null,
                msg.timestamp || now,
                msg.isOutgoing ? 1 : 0,
                msg.messageId || null,
                msg.inReplyTo || null,
                msg.references ? JSON.stringify(msg.references) : null,
                msg.attachments ? JSON.stringify(msg.attachments) : null,
                now
              )
              .run();

            messageCount++;
          }
        }
      } catch (itemErr) {
        console.warn('Failed to insert imported thread/message into D1:', itemErr);
      }
    }

    return c.json({ success: true, threadsImported: threadCount, messagesImported: messageCount });
  } catch (err: any) {
    console.error('Error importing batch into D1:', err);
    return c.json({ success: false, error: err?.message || 'Failed to import batch' }, 500);
  }
});

app.post('/api/mail/send', async (c) => {
  try {
    const {
      email,
      password,
      appPassword,
      smtpHost,
      smtpPort,
      to,
      subject,
      body,
      text,
      html,
      inReplyTo,
      references,
      threadId,
      inboxId,
      projectId,
      senderName,
    } = await c.req.json();

    let pwd = password || appPassword;
    let host = smtpHost;
    let port = Number(smtpPort) || 465;

    // If password not passed in payload, look up from stored inboxes in D1
    if (!pwd && email) {
      try {
        const inboxRow = await c.env.DB.prepare(
          'SELECT app_password, smtp_host, smtp_port FROM inboxes WHERE email = ? AND app_password IS NOT NULL'
        ).bind(email).first();
        if (inboxRow && inboxRow.app_password) {
          pwd = inboxRow.app_password as string;
          host = host || (inboxRow.smtp_host as string) || 'smtp.zoho.com';
          port = Number(inboxRow.smtp_port) || port;
        }
      } catch (dbLookupErr) {
        console.warn('Could not query inbox password from D1:', dbLookupErr);
      }
    }

    if (!email || !to) {
      return c.json({ success: false, message: 'Missing parameters (email, to)' }, 400);
    }

    let sendResult: any = { success: true, messageId: `msg-out-${Date.now()}` };

    // Dispatch via SMTP if password/appPassword is provided
    if (pwd) {
      const isZoho = email.toLowerCase().includes('zoho') || (host && host.includes('zoho'));
      host = host || (isZoho ? 'smtp.zoho.com' : 'smtp.gmail.com');
      port = port || 465;

      try {
        sendResult = await sendSmtpEmail({
          config: {
            email,
            password: pwd,
            imapHost: '',
            smtpHost: host,
            smtpPort: port,
          },
          to,
          subject: subject || 'No Subject',
          text: text || body || '',
          html,
          inReplyTo,
          references,
        });
      } catch (smtpErr: any) {
        return c.json({ success: false, message: smtpErr?.message || 'Failed to send email via SMTP' }, 500);
      }
    }

    // Persist sent email into Cloudflare D1
    const now = new Date().toISOString();
    const sentMsgId = `msg-out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const msgText = text || body || '';
    const toList = Array.isArray(to) ? to : [to];
    const toObjects = toList.map((addr: string) => ({ name: addr.split('@')[0], address: addr }));

    let targetProjId = projectId;
    let targetInboxId = inboxId;
    let targetRole = 'general';
    let targetChannel = email.includes('zoho') ? 'zoho' : email.includes('gmail') ? 'gmail' : 'cloudflare';

    if (targetInboxId) {
      try {
        const inboxRow = await c.env.DB.prepare('SELECT * FROM inboxes WHERE id = ?').bind(targetInboxId).first();
        if (inboxRow) {
          targetProjId = targetProjId || (inboxRow.project_id as string);
          targetRole = (inboxRow.role as string) || targetRole;
          targetChannel = (inboxRow.channel as string) || targetChannel;
        }
      } catch {}
    }

    if (!targetProjId) {
      try {
        const firstProj = await c.env.DB.prepare('SELECT id FROM projects LIMIT 1').first();
        targetProjId = (firstProj?.id as string) || `proj-${Date.now()}`;
      } catch {}
    }

    let activeThreadId = threadId;
    if (activeThreadId) {
      try {
        await c.env.DB.prepare(
          `UPDATE threads SET
            snippet = ?,
            last_message_timestamp = ?,
            message_count = message_count + 1,
            is_read = 1,
            updated_at = ?
           WHERE id = ?`
        ).bind(`You: ${msgText.slice(0, 80)}...`, now, now, activeThreadId).run();
      } catch (dbErr) {
        console.warn('Failed to update thread in D1:', dbErr);
      }
    } else {
      activeThreadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        await c.env.DB.prepare(
          `INSERT INTO threads
           (id, project_id, inbox_id, channel, inbox_role, subject, snippet, participants_json, last_message_timestamp, message_count, is_read, is_starred, is_archived, tags_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?, ?, ?)`
        ).bind(
          activeThreadId,
          targetProjId || 'proj-default',
          targetInboxId || 'inbox-default',
          targetChannel,
          targetRole,
          subject || 'No Subject',
          `You: ${msgText.slice(0, 80)}...`,
          JSON.stringify([
            { name: senderName || 'You', address: email },
            ...toObjects,
          ]),
          now,
          JSON.stringify(['SENT']),
          now,
          now
        ).run();
      } catch (dbErr) {
        console.warn('Failed to insert thread in D1:', dbErr);
      }
    }

    try {
      await c.env.DB.prepare(
        `INSERT INTO messages
         (id, thread_id, inbox_id, project_id, channel, inbox_role, from_json, to_json, cc_json, bcc_json, subject, body_text, body_html, timestamp, is_outgoing, message_id, in_reply_to, references_json, attachments_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
      ).bind(
        sentMsgId,
        activeThreadId,
        targetInboxId || 'inbox-default',
        targetProjId || 'proj-default',
        targetChannel,
        targetRole,
        JSON.stringify({ name: senderName || 'You', address: email }),
        JSON.stringify(toObjects),
        null,
        null,
        subject || 'No Subject',
        msgText,
        html || null,
        now,
        sendResult.messageId || sentMsgId,
        inReplyTo || null,
        references ? JSON.stringify(references) : null,
        null,
        now
      ).run();
    } catch (dbErr) {
      console.warn('Failed to insert message into D1:', dbErr);
    }

    return c.json({
      success: true,
      threadId: activeThreadId,
      messageId: sentMsgId,
      smtpResult: sendResult,
    });
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'Failed to send email via SMTP' }, 500);
  }
});

// CREATE / PERSIST OUTGOING OR INCOMING MESSAGE DIRECTLY IN D1
app.post('/api/messages', async (c) => {
  try {
    const body = await c.req.json();
    const {
      threadId,
      inboxId,
      projectId,
      channel,
      inboxRole,
      from,
      to,
      cc,
      bcc,
      subject,
      bodyText,
      bodyHtml,
      timestamp,
      isOutgoing,
      messageId,
      inReplyTo,
      references,
      attachments,
    } = body;

    const msgId = body.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const msgTime = timestamp || now;

    // Check if thread exists
    const thread = await c.env.DB.prepare('SELECT * FROM threads WHERE id = ?').bind(threadId).first();
    if (!thread) {
      await c.env.DB.prepare(
        `INSERT INTO threads
         (id, project_id, inbox_id, channel, inbox_role, subject, snippet, participants_json, last_message_timestamp, message_count, is_read, is_starred, is_archived, tags_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 0, ?, ?, ?)`
      ).bind(
        threadId,
        projectId,
        inboxId,
        channel || 'cloudflare',
        inboxRole || 'general',
        subject || 'No Subject',
        `${isOutgoing ? 'You: ' : ''}${(bodyText || '').slice(0, 80)}...`,
        JSON.stringify([from || {}, ...(to || [])]),
        msgTime,
        JSON.stringify([isOutgoing ? 'SENT' : 'INBOX']),
        now,
        now
      ).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE threads SET
          snippet = ?,
          last_message_timestamp = ?,
          message_count = message_count + 1,
          updated_at = ?
         WHERE id = ?`
      ).bind(
        `${isOutgoing ? 'You: ' : ''}${(bodyText || '').slice(0, 80)}...`,
        msgTime,
        now,
        threadId
      ).run();
    }

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO messages
       (id, thread_id, inbox_id, project_id, channel, inbox_role, from_json, to_json, cc_json, bcc_json, subject, body_text, body_html, timestamp, is_outgoing, message_id, in_reply_to, references_json, attachments_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      msgId,
      threadId,
      inboxId,
      projectId,
      channel || 'cloudflare',
      inboxRole || 'general',
      JSON.stringify(from || {}),
      JSON.stringify(to || []),
      cc ? JSON.stringify(cc) : null,
      bcc ? JSON.stringify(bcc) : null,
      subject || 'No Subject',
      bodyText || '',
      bodyHtml || null,
      msgTime,
      isOutgoing ? 1 : 0,
      messageId || null,
      inReplyTo || null,
      references ? JSON.stringify(references) : null,
      attachments ? JSON.stringify(attachments) : null,
      now
    ).run();

    return c.json({ success: true, id: msgId });
  } catch (err: any) {
    return c.json({ error: 'Failed to create message', details: err?.message }, 500);
  }
});

// INBOUND WEBHOOK / SIMULATOR ENDPOINT (TESTING & THIRD-PARTY WEBHOOKS)
app.post('/api/mail/inbound-webhook', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    let from = c.req.header('x-envelope-from') || '';
    let to = c.req.header('x-envelope-to') || '';

    if (contentType.includes('application/json')) {
      const json = await c.req.json();
      from = json.from || from || 'test@example.com';
      to = json.to || to || 'shadchanim@aizer.app';

      if (json.raw) {
        const res = await processInboundEmail(json.raw, from, to, c.env);
        return c.json(res);
      }

      const syntheticMime = `From: ${from}\r\nTo: ${to}\r\nSubject: ${json.subject || 'Inbound Message'}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${json.body || json.text || ''}`;
      const res = await processInboundEmail(syntheticMime, from, to, c.env);
      return c.json(res);
    } else {
      const rawText = await c.req.text();
      const res = await processInboundEmail(rawText, from, to, c.env);
      return c.json(res);
    }
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || 'Inbound webhook error' }, 500);
  }
});

// AI SMART REPLY & BRIEFINGS
app.post('/api/ai/smart-reply', async (c) => {
  try {
    const { threadSubject, latestMessage, senderName, inboxEmail, inboxRole, channel, tone, userInstructions } =
      await c.req.json();

    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallbackReplies: Record<string, string> = {
        support: `Hello ${senderName || 'there'},\n\nThank you for reaching out to our support team. We have received your message regarding "${threadSubject || 'your inquiry'}" and are actively looking into it.\n\nCould you please confirm if this is still occurring on your end? We'll follow up shortly with a resolution.\n\nBest regards,\nSupport Team (${inboxEmail})`,
        admin: `Hi ${senderName || 'there'},\n\nThank you for the update. I have reviewed the details for "${threadSubject || 'this item'}" and approved the requested changes.\n\nPlease let me know if any further documentation or sign-off is needed from our side.\n\nRegards,\nOperations & Admin (${inboxEmail})`,
        notifications: `Acknowledged. The alert for "${threadSubject || 'System Alert'}" has been noted and assigned for verification.\n\n-- Automated acknowledgment from ${inboxEmail}`,
        general: `Hi ${senderName || 'there'},\n\nThanks for reaching out! Regarding "${threadSubject || 'your message'}", we've received your note and will get back to you with next steps shortly.\n\nBest,\n${inboxEmail}`,
      };

      return c.json({
        reply: fallbackReplies[inboxRole] || fallbackReplies.general,
        source: 'template_fallback',
        suggestions: [
          'Thanks for the update, will check immediately.',
          'Acknowledged, our team is on it.',
          'Could you provide additional logs/details?',
        ],
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are assisting an email user replying in a Unified Inbox.
Originating Inbox: ${inboxEmail} (${channel} - Role: ${inboxRole})
Thread Subject: ${threadSubject || 'No Subject'}
Sender: ${senderName || 'Sender'}
Tone Preference: ${tone || 'Professional and helpful'}
User Specific Guidance: ${userInstructions || 'Craft a professional response'}
Latest Message Body:
"""
${latestMessage || ''}
"""

Instructions:
1. Write an immediate, context-aware reply suitable to send directly to the customer or colleague.
2. Sign off appropriately matching the role (${inboxRole}).
3. Provide 3 quick 1-line followup suggestion chips.
Format your output as strict JSON:
{
  "reply": "string (the actual drafted reply body)",
  "suggestions": ["short suggestion 1", "short suggestion 2", "short suggestion 3"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return c.json({
      reply: parsed.reply || '',
      suggestions: parsed.suggestions || [],
      source: 'gemini',
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to generate smart reply', details: error?.message }, 500);
  }
});

// PROJECT AI EXECUTIVE BRIEFING
app.post('/api/ai/project-summary', async (c) => {
  try {
    const { projectName, inboxes, threads } = await c.req.json();
    const apiKey = c.env.GEMINI_API_KEY;

    if (!apiKey) {
      const unreadCount = (threads || []).filter((t: any) => !t.isRead).length;
      return c.json({
        summary: `Project "${projectName}" currently tracks ${(threads || []).length} conversations across ${(inboxes || []).length} connected communication inboxes (${unreadCount} unread).`,
        actionItems: ['Review recent unread messages', 'Check pending customer tickets'],
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const threadSnippets = (threads || [])
      .slice(0, 10)
      .map((t: any, idx: number) => `[${idx + 1}] Inbox: ${t.inboxEmail} | Subject: ${t.subject} | Status: ${t.isRead ? 'Read' : 'UNREAD'}`)
      .join('\n');

    const prompt = `You are a productivity executive assistant in a Unified Inbox Hub.
Project Name: "${projectName}"
Connected Inboxes: ${(inboxes || []).map((i: any) => `${i.name} (${i.email})`).join(', ')}
Recent Threads:
${threadSnippets}

Instructions:
Provide a concise executive briefing:
1. High-level summary (max 3 sentences).
2. 3-4 concrete Action Items.
Output strict JSON:
{
  "summary": "...",
  "actionItems": ["...", "..."],
  "urgentAlert": null
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    return c.json(parsed);
  } catch (error: any) {
    return c.json({ error: 'Failed to generate summary', details: error?.message }, 500);
  }
});

/**
 * Intelligent filter for promotional blasts, TikTok notifications, newsletters, and bots.
 * Only genuine customer/client communications pass through.
 */
function isPromotionalOrBotEmail(
  parsed: any,
  fromAddress: string,
  envelopeFrom: string
): { isSpam: boolean; reason?: string } {
  const from = (fromAddress || envelopeFrom || '').toLowerCase();
  const subject = (parsed.subject || '').toLowerCase();

  // 1. Social networks / TikTok / platforms
  const socialDomains = [
    'tiktok.com',
    'bytedance.com',
    'musical.ly',
    'facebookmail.com',
    'instagram.com',
    'meta.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'pinterest.com',
    'snapchat.com',
    'youtube.com',
    'tiktokmail.com',
  ];
  if (socialDomains.some((d) => from.includes(d))) {
    return { isSpam: true, reason: `Social media notification (${from})` };
  }

  // 2. Automated marketing / Bot / Newsletter senders
  const botSenders = [
    'no-reply@',
    'noreply@',
    'donotreply@',
    'mailer-daemon@',
    'bounce',
    'promo@',
    'promotions@',
    'marketing@',
    'newsletter@',
    'digest@',
    'offers@',
    'campaigns@',
  ];
  if (botSenders.some((b) => from.startsWith(b) || from.includes(b))) {
    return { isSpam: true, reason: `Automated marketing/no-reply sender (${from})` };
  }

  // 3. Marketing headers (RFC 2369 List-Unsubscribe, Precedence: bulk, etc.)
  const headers = Array.isArray(parsed.headers) ? parsed.headers : [];
  for (const h of headers) {
    const key = (h.key || '').toLowerCase();
    const val = (h.value || '').toLowerCase();
    if (key === 'list-unsubscribe') {
      return { isSpam: true, reason: 'Header contains List-Unsubscribe' };
    }
    if (key === 'precedence' && (val.includes('bulk') || val.includes('junk') || val.includes('list'))) {
      return { isSpam: true, reason: `Header Precedence: ${val}` };
    }
    if (key === 'auto-submitted' && (val.includes('auto-generated') || val.includes('auto-replied'))) {
      return { isSpam: true, reason: `Header Auto-Submitted: ${val}` };
    }
  }

  // 4. Promotional Subject triggers
  const promoSubjectPhrases = [
    'trending on tiktok',
    'weekly digest',
    'monthly digest',
    'newsletter',
    '% off',
    'sale ends',
    'special discount',
    'black friday',
    'cyber monday',
    'flash sale',
    'exclusive offer',
    'free shipping',
  ];
  if (promoSubjectPhrases.some((p) => subject.includes(p))) {
    return { isSpam: true, reason: `Promotional subject matched: "${subject}"` };
  }

  return { isSpam: false };
}

/**
 * Core parsing & D1 insertion engine for Cloudflare Email Workers and Inbound Webhooks
 */
async function processInboundEmail(
  rawEmailStream: any,
  envelopeFrom: string,
  envelopeTo: string,
  env: Bindings
): Promise<{ success: boolean; dropped?: boolean; threadId?: string; messageId?: string; error?: string }> {
  try {
    const parser = new PostalMime();
    const parsed = await parser.parse(rawEmailStream as any);

    const fromAddress = parsed.from?.address || envelopeFrom || 'unknown@sender.com';
    const fromName = parsed.from?.name || fromAddress.split('@')[0] || 'Sender';

    // 0. Filter out TikTok, promotional blasts, and automated bot emails
    const filterCheck = isPromotionalOrBotEmail(parsed, fromAddress, envelopeFrom);
    if (filterCheck.isSpam) {
      console.log(`[FILTERED OUT - NOT CUSTOMER] Dropping email: ${filterCheck.reason} | From: ${fromAddress} | Subject: ${parsed.subject}`);
      return { success: false, dropped: true, error: filterCheck.reason };
    }

    const toRecipients =
      parsed.to && parsed.to.length > 0
        ? parsed.to.map((t: any) => ({ name: t.name || t.address, address: t.address }))
        : [{ name: envelopeTo || 'Inbox', address: envelopeTo || 'inbox@centralized.app' }];

    const primaryToAddress = toRecipients[0]?.address || envelopeTo;
    const primaryToName = toRecipients[0]?.name || primaryToAddress;

    // 1. Resolve matching inbox in D1
    let matchedInbox: any = null;
    try {
      matchedInbox = await env.DB.prepare(
        'SELECT * FROM inboxes WHERE LOWER(email) = LOWER(?) LIMIT 1'
      ).bind(primaryToAddress).first();
    } catch {}

    // Fallback: match by domain
    if (!matchedInbox) {
      const domain = primaryToAddress.split('@')[1];
      if (domain) {
        try {
          matchedInbox = await env.DB.prepare(
            'SELECT * FROM inboxes WHERE email LIKE ? LIMIT 1'
          ).bind(`%@${domain}`).first();
        } catch {}
      }
    }

    // Fallback: pick first inbox or create default
    if (!matchedInbox) {
      try {
        const firstInbox = await env.DB.prepare('SELECT * FROM inboxes LIMIT 1').first();
        if (firstInbox) {
          matchedInbox = firstInbox;
        } else {
          const firstProj = await env.DB.prepare('SELECT id FROM projects LIMIT 1').first();
          const projId = (firstProj?.id as string) || `proj-${Date.now()}`;
          if (!firstProj) {
            await env.DB.prepare(
              'INSERT INTO projects (id, name, description, color, accent_color, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(projId, 'Main Inbox', 'Default project workspace', '#3B82F6', '#E2E8F0', new Date().toISOString()).run();
          }

          const newInboxId = `inbox-${Date.now()}`;
          await env.DB.prepare(
            `INSERT INTO inboxes (id, project_id, name, email, channel, role, badge_color, status, created_at)
             VALUES (?, ?, ?, ?, 'cloudflare', 'general', '#3B82F6', 'connected', ?)`
          ).bind(newInboxId, projId, 'Cloudflare Routing', primaryToAddress, new Date().toISOString()).run();

          matchedInbox = {
            id: newInboxId,
            project_id: projId,
            channel: 'cloudflare',
            role: 'general',
            name: 'Cloudflare Routing',
            email: primaryToAddress,
          };
        }
      } catch (e) {
        console.error('Failed to create fallback inbox in D1:', e);
      }
    }

    const projectId = (matchedInbox?.project_id as string) || 'proj-default';
    const inboxId = (matchedInbox?.id as string) || 'inbox-default';
    const inboxRole = (matchedInbox?.role as string) || 'general';
    const channel = (matchedInbox?.channel as string) || 'cloudflare';

    // 2. Thread Matching (Gmail-like threading!)
    const cleanSubject = (parsed.subject || '(No Subject)')
      .replace(/^(re:\s*|fwd:\s*|fw:\s*|\[external\]\s*)+/gi, '')
      .trim();

    let targetThreadId: string | null = null;
    let existingThread: any = null;

    // Check In-Reply-To or References
    const inReplyTo = parsed.inReplyTo || null;
    if (inReplyTo) {
      try {
        const msgMatch = await env.DB.prepare(
          'SELECT thread_id FROM messages WHERE message_id = ? LIMIT 1'
        ).bind(inReplyTo).first();
        if (msgMatch?.thread_id) {
          targetThreadId = msgMatch.thread_id as string;
        }
      } catch {}
    }

    // Match by clean subject in same project
    if (!targetThreadId && cleanSubject) {
      try {
        const subjectMatch = await env.DB.prepare(
          `SELECT * FROM threads WHERE project_id = ? AND 
           LOWER(TRIM(REPLACE(REPLACE(REPLACE(subject, 'Re: ', ''), 'Fwd: ', ''), 'RE: ', ''))) = LOWER(?)
           ORDER BY last_message_timestamp DESC LIMIT 1`
        ).bind(projectId, cleanSubject).first();
        if (subjectMatch) {
          targetThreadId = subjectMatch.id as string;
          existingThread = subjectMatch;
        }
      } catch {}
    }

    const now = new Date().toISOString();
    const msgTimestamp = parsed.date ? new Date(parsed.date).toISOString() : now;
    const snippet = (parsed.text || parsed.html || '')
      .replace(/<[^>]+>/g, '')
      .trim()
      .slice(0, 100) || '(Empty message)';

    const attachments = (parsed.attachments || []).map((att: any) => ({
      name: att.filename || 'attachment',
      size: `${Math.max(1, Math.round((att.content?.byteLength || 0) / 1024))} KB`,
      type: att.mimeType || 'application/octet-stream',
    }));

    const messageId = `msg-in-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (targetThreadId) {
      // Append to existing thread & unarchive / mark unread
      let participants: any[] = [];
      try {
        participants = JSON.parse((existingThread?.participants_json as string) || '[]');
      } catch {
        participants = [];
      }
      if (!participants.some((p: any) => p.address?.toLowerCase() === fromAddress.toLowerCase())) {
        participants.push({ name: fromName, address: fromAddress });
      }

      await env.DB.prepare(
        `UPDATE threads SET
          snippet = ?,
          participants_json = ?,
          last_message_timestamp = ?,
          message_count = message_count + 1,
          is_read = 0,
          is_archived = 0,
          updated_at = ?
         WHERE id = ?`
      ).bind(snippet, JSON.stringify(participants), msgTimestamp, now, targetThreadId).run();
    } else {
      // Create new thread
      targetThreadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const participants = [
        { name: fromName, address: fromAddress },
        { name: primaryToName, address: primaryToAddress },
      ];

      await env.DB.prepare(
        `INSERT INTO threads
         (id, project_id, inbox_id, channel, inbox_role, subject, snippet, participants_json, last_message_timestamp, message_count, is_read, is_starred, is_archived, tags_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, ?, ?, ?)`
      ).bind(
        targetThreadId,
        projectId,
        inboxId,
        channel,
        inboxRole,
        parsed.subject || '(No Subject)',
        snippet,
        JSON.stringify(participants),
        msgTimestamp,
        JSON.stringify(['INBOUND']),
        now,
        now
      ).run();
    }

    // Insert message into messages table
    await env.DB.prepare(
      `INSERT INTO messages
       (id, thread_id, inbox_id, project_id, channel, inbox_role, from_json, to_json, cc_json, bcc_json, subject, body_text, body_html, timestamp, is_outgoing, message_id, in_reply_to, references_json, attachments_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    ).bind(
      messageId,
      targetThreadId,
      inboxId,
      projectId,
      channel,
      inboxRole,
      JSON.stringify({ name: fromName, address: fromAddress }),
      JSON.stringify(toRecipients),
      parsed.cc && parsed.cc.length > 0 ? JSON.stringify(parsed.cc.map((c: any) => c.address)) : null,
      parsed.bcc && parsed.bcc.length > 0 ? JSON.stringify(parsed.bcc.map((b: any) => b.address)) : null,
      parsed.subject || '(No Subject)',
      parsed.text || '',
      parsed.html || null,
      msgTimestamp,
      parsed.messageId || null,
      parsed.inReplyTo || null,
      parsed.references ? JSON.stringify(parsed.references) : null,
      attachments.length > 0 ? JSON.stringify(attachments) : null,
      now
    ).run();

    return { success: true, threadId: targetThreadId, messageId };
  } catch (err: any) {
    console.error('Error processing inbound email in D1:', err);
    return { success: false, error: err?.message || 'Failed to process email' };
  }
}

// Export both HTTP fetch handler and Cloudflare Email Worker handler
export default {
  fetch: app.fetch,
  async email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    // 1. Process into Centralized Inbox D1 database
    const result = await processInboundEmail(message.raw, message.from, message.to, env);
    if (result.dropped) {
      console.log(`Cloudflare Email Worker dropped promotional email from ${message.from} (${result.error})`);
      return; // Do not save in inbox, do not forward promotional spam to Gmail!
    }
    if (!result.success) {
      console.error('Cloudflare Email Worker error:', result.error);
    }

    // 2. Forward clean copy to Gmail (customers only)
    const forwardTarget = env.FORWARD_EMAIL || 'aizerkenegdoapp@gmail.com';
    try {
      await message.forward(forwardTarget);
      console.log(`Forwarded incoming customer email copy to ${forwardTarget}`);
    } catch (fwdErr) {
      console.warn(`Forwarding to ${forwardTarget} note:`, fwdErr);
    }
  },
};
