import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database, Fetcher, ExecutionContext, ForwardableEmailMessage } from '@cloudflare/workers-types';
import { verifyMailConnection, fetchImapThreads, sendSmtpEmail } from './mailService';
import { GoogleGenAI } from '@google/genai';
import PostalMime from 'postal-mime';
import { createHash } from 'node:crypto';
import { assessSpam } from './src/utils/spam';
import { saveMailThreads } from './mailStore';
import { syncMailbox, syncSavedMailboxes } from './mailboxSync';
import { b64urlToBytes, notifyNewMail } from './pushNotify';

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  ENVIRONMENT?: string;
  FORWARD_EMAIL?: string;
  FORWARD_EMAIL_BY_DOMAIN?: string;
  GATE_PASSWORD?: string;
  SESSION_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  EMAIL?: {
    send(message: {
      to: string | string[];
      from: string | { email: string; name?: string };
      subject: string;
      text?: string;
      html?: string;
      cc?: string[];
      bcc?: string[];
      headers?: Record<string, string>;
      attachments?: { content: string; filename: string; type: string; disposition: 'attachment' }[];
    }): Promise<{ messageId: string }>;
  };
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

app.get('/api/push/public-key', (c) => {
  const publicKey = (c.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (c.env.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return c.json({ configured: false });
  try {
    const raw = b64urlToBytes(publicKey);
    if (raw.length !== 65 || raw[0] !== 4) return c.json({ configured: false });
  } catch {
    return c.json({ configured: false });
  }
  return c.json({ configured: true, publicKey });
});

app.post('/api/push/failure', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  console.error(JSON.stringify({ message: 'push subscribe failed', detail: String(body?.message || '').slice(0, 300) }));
  return c.json({ ok: true });
});

app.post('/api/push/subscribe', async (c) => {
  try {
    const body = await c.req.json();
    const endpoint = String(body?.endpoint || '');
    const p256dh = String(body?.keys?.p256dh || '');
    const auth = String(body?.keys?.auth || '');
    let url: URL;
    try { url = new URL(endpoint); } catch { return c.json({ error: 'Subscription endpoint is invalid.' }, 400); }
    if (url.protocol !== 'https:' || p256dh.length < 80 || auth.length < 16) {
      return c.json({ error: 'Subscription is incomplete.' }, 400);
    }
    const now = new Date().toISOString();
    const agent = (c.req.header('user-agent') || '').slice(0, 180);
    await c.env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, last_seen_at = excluded.last_seen_at`
    ).bind(endpoint, p256dh, auth, agent, now, now).run();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not save this phone.' }, 500);
  }
});

app.delete('/api/push/subscribe', async (c) => {
  try {
    const body = await c.req.json();
    const endpoint = String(body?.endpoint || '');
    if (endpoint) await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not remove this phone.' }, 500);
  }
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
              (app_password IS NOT NULL AND app_password != '') as hasAppPassword,
              auth_type as authType,
              zoho_region as zohoRegion, receiving_mode as receivingMode,
              last_received_at as lastReceivedAt, delivery_error as deliveryError,
              (SELECT error FROM mailbox_sync WHERE inbox_id = inboxes.id) as syncError,
              (SELECT pending FROM mailbox_sync WHERE inbox_id = inboxes.id) as syncPending,
              (SELECT last_attempt_at FROM mailbox_sync WHERE inbox_id = inboxes.id) as lastAttemptAt,
              (SELECT last_success_at FROM mailbox_sync WHERE inbox_id = inboxes.id) as lastMailboxSyncAt
       FROM inboxes ORDER BY created_at ASC`
    ).all();

    const inboxes = (results || []).map((i: any) => ({
      ...i,
      appPassword: undefined,
      unreadCount: 0,
      hasAppPassword: Boolean(i.hasAppPassword),
      isLiveConnected: Boolean(i.lastSyncedAt || i.lastReceivedAt),
      errorDetail: i.deliveryError || i.syncError || undefined,
      zohoAppPassword: undefined,
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
      `INSERT INTO inboxes
       (id, project_id, name, email, channel, role, badge_color, status, last_synced_at, imap_host, imap_port, smtp_host, smtp_port, app_password, auth_type, zoho_region, receiving_mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        b.receivingMode || (b.channel === 'cloudflare' ? 'routing' : 'mailbox'),
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
    // Refreshes must read the primary: a stale replica can hide mail already shown by a live sync.
    const readDb = c.env.DB.withSession?.('first-primary') ?? c.env.DB;
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

    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
    const cursor = c.req.query('cursor');
    if (cursor) {
      const [timestamp, id] = JSON.parse(cursor);
      query += ' AND (last_message_timestamp < ? OR (last_message_timestamp = ? AND id < ?))';
      params.push(timestamp, timestamp, id);
    }
    query += ' ORDER BY last_message_timestamp DESC, id DESC LIMIT ?';
    params.push(limit + 1);

    const stmt = readDb.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();

    if (!results || results.length === 0) {
      return c.json({ threads: [] });
    }

    const hasMore = results.length > limit;
    const page = results.slice(0, limit);
    const msgRows = await readDb.prepare(`SELECT * FROM messages WHERE thread_id IN (${page.map(() => '?').join(',')}) ORDER BY timestamp ASC`)
      .bind(...page.map((t:any) => t.id)).all<any>();
    const threadsWithMessages = (page as any[]).map((t) => {
        const messages = (msgRows.results || []).filter((m:any) => m.thread_id === t.id).map((m: any) => ({
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
          spamStatus: t.spam_status || undefined,
          spamReason: t.spam_reason || undefined,
          spamReviewedAt: t.spam_reviewed_at || undefined,
          messages,
        };
      });

    const last = page[page.length - 1] as any;
    return c.json({ threads: threadsWithMessages, nextCursor: hasMore ? JSON.stringify([last.last_message_timestamp, last.id]) : null });
  } catch (err: any) {
    console.error('Error fetching threads:', err);
    return c.json({ error: 'Failed to fetch threads', details: err?.message }, 500);
  }
});

app.get('/api/mail/revision', async (c) => {
  const readDb = c.env.DB.withSession?.('first-primary') ?? c.env.DB;
  const row = await readDb.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS updated FROM threads').first<{ n: number; updated: string | null }>();
  return c.json({ revision: `${row?.n ?? 0}:${row?.updated ?? ''}` });
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

app.post('/api/threads/:id/spam-review', async (c) => {
  try {
    const { spamStatus } = await c.req.json();
    if (!['suspected', 'not_spam'].includes(spamStatus)) return c.json({ error:'Invalid spam review.' },400);
    const id = c.req.param('id');
    const reviewedAt = new Date().toISOString();
    const result = await c.env.DB.prepare(`UPDATE threads SET spam_status = ?, spam_reviewed_at = ?,
      is_archived = CASE WHEN ? = 'not_spam' THEN 0 ELSE is_archived END, updated_at = ? WHERE id = ?`)
      .bind(spamStatus,reviewedAt,spamStatus,reviewedAt,id).run();
    if (!result.meta.changes) return c.json({ error:'Conversation not found.' },404);
    return c.json({ success:true,spamStatus,spamReviewedAt:reviewedAt });
  } catch {
    return c.json({ error:'Could not save the spam review. Please try again.' },500);
  }
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
  const { inboxId } = await c.req.json();
  const inbox = await c.env.DB.prepare('SELECT * FROM inboxes WHERE id = ?').bind(inboxId).first<any>();
  if (!inbox?.app_password) return c.json({ success: false, message: 'Save an App Password for this mailbox before syncing.' }, 400);
  const result = await syncMailbox(c.env.DB, inbox);
  await notifyNewMail(c.env, result.inserted, 'recent');
  const { inserted: _inserted, ...publicResult } = result;
  return c.json({ ...publicResult, message: 'error' in publicResult ? publicResult.error : undefined }, result.success ? 200 : 502);
});

// BATCH IMPORT THREADS & MESSAGES INTO D1
app.post('/api/import/batch', async (c) => {
  try {
    const { threads, notify } = await c.req.json();
    if (!Array.isArray(threads)) return c.json({ error: 'threads must be an array' }, 400);
    const inserted = await saveMailThreads(c.env.DB, threads);
    if (notify !== false) await notifyNewMail(c.env, inserted, 'recent');
    return c.json({ success:true,threadsImported:threads.length,messagesImported:threads.reduce((n,t) => n + t.messages.length,0) });
  } catch (error:any) {
    return c.json({ success:false,error:error?.message || 'Mail persistence failed' },500);
  }
});

function addressList(value: unknown): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item).trim()).filter((item) => item.includes('@'));
}

function emailServiceFailure(error: any, from: string): string {
  const domain = from.split('@')[1] || from;
  switch (error?.code) {
    case 'E_SENDER_DOMAIN_NOT_AVAILABLE':
    case 'E_SENDER_NOT_VERIFIED':
      return `${from} cannot send yet. Onboard ${domain} in Cloudflare under Email Service → Email Sending, then try again.`;
    case 'E_DAILY_LIMIT_EXCEEDED':
      return 'The daily sending limit is reached. Try again tomorrow.';
    case 'E_RATE_LIMIT_EXCEEDED':
      return 'Sending too quickly. Wait a moment and try again.';
    default:
      return error?.message || 'Failed to send email';
  }
}

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
      cc,
      bcc,
      attachments,
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

    if (!pwd) {
      const routingInbox = await c.env.DB.prepare(
        'SELECT id, channel FROM inboxes WHERE LOWER(email) = ?'
      ).bind(String(email).toLowerCase()).first<any>();
      if (routingInbox?.channel !== 'cloudflare') {
        return c.json({
          success: false,
          message: 'No SMTP password on file. Sign in with Gmail to send for free.',
        }, 400);
      }
      if (!c.env.EMAIL) {
        return c.json({ success: false, message: 'Email sending is not configured on this inbox yet.' }, 500);
      }
      const toList = addressList(to);
      const ccList = addressList(cc);
      const bccList = addressList(bcc);
      if (toList.length === 0) {
        return c.json({ success: false, message: 'Missing a recipient address.' }, 400);
      }
      const headers: Record<string, string> = {};
      if (inReplyTo) headers['In-Reply-To'] = String(inReplyTo);
      if (references) headers.References = Array.isArray(references) ? references.filter(Boolean).join(' ') : String(references);
      const files = (Array.isArray(attachments) ? attachments : [])
        .filter((file: any) => file?.contentBase64)
        .map((file: any) => ({
          content: String(file.contentBase64).replace(/\s+/g, ''),
          filename: String(file.name || file.filename || 'attachment').replace(/[\r\n"]/g, ''),
          type: file.type || 'application/octet-stream',
          disposition: 'attachment' as const,
        }));
      try {
        const sent = await c.env.EMAIL.send({
          from: senderName ? { email, name: senderName } : email,
          to: toList,
          ...(ccList.length ? { cc: ccList } : {}),
          ...(bccList.length ? { bcc: bccList } : {}),
          subject: subject || 'No Subject',
          text: text || body || '',
          ...(html ? { html } : {}),
          ...(Object.keys(headers).length ? { headers } : {}),
          ...(files.length ? { attachments: files } : {}),
        });
        sendResult = { success: true, messageId: sent.messageId };
      } catch (error: any) {
        return c.json({ success: false, message: emailServiceFailure(error, String(email)) }, 502);
      }
    }

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
          cc,
          bcc,
          subject: subject || 'No Subject',
          text: text || body || '',
          html,
          inReplyTo,
          references,
          attachments,
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
      to = json.to || to || 'inbox@example.com';

      if (json.raw) {
        const res = await processInboundEmail(json.raw, from, to, c.env);
        return c.json(res, res.success ? 200 : 500);
      }

      const syntheticMime = `From: ${from}\r\nTo: ${to}\r\nSubject: ${json.subject || 'Inbound Message'}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${json.body || json.text || ''}`;
      const res = await processInboundEmail(syntheticMime, from, to, c.env);
      return c.json(res, res.success ? 200 : 500);
    } else {
      const rawText = await c.req.text();
      const res = await processInboundEmail(rawText, from, to, c.env);
      return c.json(res, res.success ? 200 : 500);
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

/** Save every accepted email, using the SMTP envelope (including BCC/aliases). */
export async function processInboundEmail(rawEmailStream: any, envelopeFrom: string, envelopeTo: string, env: Bindings) {
  try {
    const raw = typeof rawEmailStream === 'string' ? rawEmailStream : await new Response(rawEmailStream).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    const recipient = (envelopeTo || parsed.to?.[0]?.address || '').trim().toLowerCase();
    if (!recipient.includes('@')) throw new Error('Missing delivery recipient');
    const now = new Date().toISOString();
    let inbox = await env.DB.prepare('SELECT * FROM inboxes WHERE LOWER(email) = ? ORDER BY created_at LIMIT 1').bind(recipient).first<any>();
    if (!inbox) {
      const domain = recipient.split('@')[1];
      // Unknown aliases get their own account; never assign them to an unrelated mailbox.
      const related = await env.DB.prepare('SELECT project_id FROM inboxes WHERE LOWER(email) LIKE ? ORDER BY created_at LIMIT 1').bind(`%@${domain}`).first<any>();
      const projectId = related?.project_id || `routing-${domain}`;
      const inboxId = `routing-${recipient}`;
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO projects (id,name,description,color,accent_color,created_at) VALUES (?,?,?,?,?,?)').bind(projectId,domain,'Incoming domain mail','#3B82F6','#E2E8F0',now),
        env.DB.prepare(`INSERT OR IGNORE INTO inboxes (id,project_id,name,email,channel,role,badge_color,status,receiving_mode,created_at)
          VALUES (?,?,?,?,'cloudflare','general','#3B82F6','connected','routing',?)`).bind(inboxId,projectId,recipient,recipient,now),
      ]);
      inbox = await env.DB.prepare('SELECT * FROM inboxes WHERE id = ?').bind(inboxId).first<any>();
    }
    const from = { name: parsed.from?.name || parsed.from?.address || envelopeFrom, address: parsed.from?.address || envelopeFrom };
    const to = (parsed.to || []).map((t: any) => ({ name: t.name || t.address, address: t.address }));
    if (!to.some(t => t.address?.toLowerCase() === recipient)) to.push({ name: recipient, address: recipient });
    const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
    const identity = parsed.messageId || digest(typeof raw === 'string' ? raw : new Uint8Array(raw));
    const references = typeof parsed.references === 'string' ? parsed.references.match(/<[^>]+>/g) || [] : [];
    const threadId = `inbound-thread-${digest(`${inbox.id}:${references[0] || parsed.inReplyTo || identity}`)}`;
    const id = `inbound-msg-${digest(`${inbox.id}:${identity}`)}`;
    const parsedDate = parsed.date ? Date.parse(parsed.date) : NaN;
    const timestamp = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : now;
    const body = parsed.text || (parsed.html || '').replace(/<[^>]+>/g, ' ');
    const message = { id,threadId,inboxId:inbox.id,projectId:inbox.project_id,channel:inbox.channel,inboxRole:inbox.role,
      from,to,cc:parsed.cc?.map((x:any) => x.address),subject:parsed.subject || '(No Subject)',bodyText:body,
      bodyHtml:parsed.html,timestamp,isOutgoing:false,messageId:parsed.messageId,inReplyTo:parsed.inReplyTo,references,
      attachments:(parsed.attachments || []).map((att:any) => ({ name:att.filename || 'attachment',
        size:`${att.content?.byteLength || 0} B`,type:att.mimeType,contentBase64:Buffer.from(att.content).toString('base64') })) };
    const inserted = await saveMailThreads(env.DB, [{ id:threadId,projectId:inbox.project_id,inboxId:inbox.id,channel:inbox.channel,inboxRole:inbox.role,
      subject:message.subject,snippet:body.slice(0,100),participants:[from,...to],lastMessageTimestamp:timestamp,messageCount:1,
      isRead:false,isStarred:false,isArchived:false,tags:['INBOUND'],messages:[message],
      ...assessSpam({ headers:parsed.headers,subject:parsed.subject }) }],
      env.DB.prepare("UPDATE inboxes SET last_received_at = ?, receiving_mode = 'routing' WHERE id = ?").bind(now,inbox.id));
    await notifyNewMail(env, inserted, 'live');
    return { success:true,threadId,messageId:id };
  } catch (error:any) {
    return { success:false,error:error?.message || 'Failed to store incoming mail' };
  }
}

const COOKIE_NAME = '__inbox_auth';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const MAX_ATTEMPTS_PER_MIN = 8;

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

async function signSession(secret: string, expiry: number): Promise<string> {
  const data = new TextEncoder().encode(`v1.${expiry}`);
  const key = await hmacKey(secret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return `v1.${expiry}.${b64urlEncode(new Uint8Array(sig))}`;
}

async function verifySession(secret: string, cookieValue: string): Promise<boolean> {
  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return false;
    const expiry = Number(parts[1]);
    if (!Number.isFinite(expiry) || expiry * 1000 < Date.now()) return false;
    const key = await hmacKey(secret, ['verify']);
    const data = new TextEncoder().encode(`v1.${parts[1]}`);
    return await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]) as unknown as BufferSource, data);
  } catch {
    return false;
  }
}

function passwordsEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let rec = attempts.get(ip);
  if (!rec || now >= rec.resetAt) {
    if (attempts.size > 5000) attempts.clear();
    rec = { count: 0, resetAt: now + 60_000 };
    attempts.set(ip, rec);
  }
  return rec.count >= MAX_ATTEMPTS_PER_MIN;
}

function esc(s: any): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function safeNext(raw: any): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

function getCookie(request: Request): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function loginPage(error: boolean, next: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Sign in — ProjectInbox</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e14;color:#e6e9f0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:340px;padding:32px 28px;background:#131722;border:1px solid #232a3a;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45)}h1{margin:0 0 6px;font-size:20px}p{margin:0 0 20px;font-size:13px;color:#9aa3b5}label{display:block;font-size:12px;color:#9aa3b5;margin-bottom:6px}input{width:100%;padding:10px 12px;font-size:15px;color:#e6e9f0;background:#0b0e14;border:1px solid #2b3347;border-radius:8px;outline:none}input:focus{border-color:#4f7cff}button{width:100%;margin-top:14px;padding:11px;font-size:15px;font-weight:600;color:#fff;background:#2f6bff;border:0;border-radius:8px;cursor:pointer}button:hover{background:#245ae0}.err{margin-bottom:14px;padding:9px 11px;font-size:13px;color:#ffb4b4;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.25);border-radius:8px}</style></head><body><form class="card" method="post" action="/login"><h1>ProjectInbox</h1><p>Enter the password to open the inbox.</p>${error ? `<div class="err">Wrong password. Try again.</div>` : ''}<input type="hidden" name="next" value="${esc(next)}" /><label for="pw">Password</label><input id="pw" type="password" name="password" autocomplete="current-password" autofocus required /><button type="submit">Sign in</button></form></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

function setupPage(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Setup Required — ProjectInbox</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0e14;color:#e6e9f0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:460px;max-width:92vw;padding:32px 28px;background:#131722;border:1px solid #232a3a;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.45)}h1{margin:0 0 8px;font-size:20px;color:#fff}p{margin:0 0 16px;font-size:13px;color:#9aa3b5;line-height:1.5}.step{background:#0b0e14;border:1px solid #2b3347;border-radius:8px;padding:12px;margin-bottom:12px}code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;color:#60a5fa;display:block;word-break:break-all;user-select:all}.num{font-size:11px;font-weight:700;color:#9aa3b5;text-transform:uppercase;margin-bottom:4px}</style></head><body><div class="card"><h1>⚡ Set Up Your Password Gate</h1><p>Welcome to your personal ProjectInbox! Before opening the app, create your gate password and session secret using Wrangler in your terminal:</p><div class="step"><div class="num">Step 1: Set your password</div><code>npx wrangler secret put GATE_PASSWORD</code></div><div class="step"><div class="num">Step 2: Set your session encryption key</div><code>npx wrangler secret put SESSION_SECRET</code></div><p style="margin-top:16px;font-size:12px">Once configured, refresh this page to sign in.</p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function authGuard(request: Request, env: Bindings): Promise<Response | null> {
  if (!env.GATE_PASSWORD || !env.SESSION_SECRET) {
    return setupPage();
  }
  const url = new URL(request.url);
  if (url.pathname === '/login') {
    if (request.method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      if (isRateLimited(ip)) return new Response('Too many attempts. Wait a minute and try again.', { status: 429 });
      let form: any;
      try { form = await request.formData(); } catch { form = new Map(); }
      const password = form.get ? String(form.get('password') ?? '') : '';
      const next = safeNext(form.get ? String(form.get('next') ?? '/') : '/');
      if (passwordsEqual(password, env.GATE_PASSWORD)) {
        attempts.delete(ip);
        const expiry = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
        const token = await signSession(env.SESSION_SECRET, expiry);
        return new Response(null, { status: 302, headers: { Location: next, 'Set-Cookie': sessionCookie(token, SESSION_MAX_AGE), 'Cache-Control': 'no-store' } });
      }
      const rec = attempts.get(ip);
      if (rec) rec.count++;
      const q = new URLSearchParams({ error: '1', next });
      return Response.redirect(`${url.origin}/login?${q}`, 302);
    }
    const next = safeNext(url.searchParams.get('next') ?? '/');
    return loginPage(url.searchParams.get('error') === '1', next);
  }
  if (url.pathname === '/logout') {
    return new Response(null, { status: 302, headers: { Location: '/login', 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' } });
  }
  // Chrome fetches this script without the session cookie and rejects any redirect.
  // The VAPID public key is not a secret; the phone must be able to read it while signing in.
  if (url.pathname === '/sw.js') return null;
  if (url.pathname === '/api/push/public-key' && request.method === 'GET') return null;
  const token = getCookie(request);
  if (token && (await verifySession(env.SESSION_SECRET, token))) return null;
  const next = encodeURIComponent(url.pathname + url.search);
  return Response.redirect(`${url.origin}/login?next=${next}`, 302);
}

// Export both HTTP fetch handler and Cloudflare Email Worker handler
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    const gate = await authGuard(request, env);
    if (gate) return gate;
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      // DOM and Workers expose different TypeScript Request types for the same runtime object.
      const asset = await env.ASSETS.fetch(request as unknown as Parameters<Fetcher['fetch']>[0]);
      if (pathname === '/sw.js' || asset.headers.get('content-type')?.includes('text/html') || pathname === '/') {
        const headers = new Headers(asset.headers);
        headers.set('Cache-Control', 'no-cache');
        if (pathname === '/sw.js') headers.set('Service-Worker-Allowed', '/');
        return new Response(asset.body as unknown as BodyInit, { status: asset.status, headers });
      }
      return asset;
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event: unknown, env: Bindings, ctx: ExecutionContext) {
    const runs = await syncSavedMailboxes(env.DB);
    ctx.waitUntil(notifyNewMail(env, runs.flatMap((run) => run.inserted), 'recent'));
  },
  async email(message: ForwardableEmailMessage, env: Bindings, _ctx: ExecutionContext) {
    const result = await processInboundEmail(message.raw, message.from, message.to, env);
    const recipient = message.to.toLowerCase();
    let forwardError: string | null = null;
    try {
      const overrides = JSON.parse(env.FORWARD_EMAIL_BY_DOMAIN || '{}');
      const forwardTarget = overrides[recipient.split('@')[1]] || env.FORWARD_EMAIL;
      if (forwardTarget && forwardTarget.toLowerCase() !== recipient) {
        await message.forward(forwardTarget, new Headers({ 'X-ProjectInbox-Recipient': recipient }) as any);
      }
    } catch (error:any) { forwardError = error?.message || 'Backup forwarding failed'; }
    const error = !result.success ? result.error : forwardError;
    await env.DB.prepare('UPDATE inboxes SET delivery_error = ? WHERE LOWER(email) = ?').bind(error || null,recipient).run();
    // Returning normally used to silently acknowledge failed deliveries. Surface the failure.
    if (error) throw new Error(error);
  },
};
