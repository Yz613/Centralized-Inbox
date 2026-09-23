import type { D1Database } from '@cloudflare/workers-types';
import { fetchImapPage } from './mailService';
import { saveMailThreads, type IncomingAlert } from './mailStore';

export async function syncMailbox(db: D1Database, inbox: any) {
  const now = new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO mailbox_sync (inbox_id) VALUES (?)').bind(inbox.id).run();
  const lease = await db.prepare('UPDATE mailbox_sync SET lease_until = ?, last_attempt_at = ? WHERE inbox_id = ? AND lease_until < ?')
    .bind(Date.now() + 120000, now, inbox.id, Date.now()).run();
  if (!lease.meta.changes) return { success: true, busy: true, pending: true, inserted: [] as IncomingAlert[] };
  try {
    const state = await db.prepare('SELECT cursor_json FROM mailbox_sync WHERE inbox_id = ?').bind(inbox.id).first<any>();
    const result = await fetchImapPage({
      config: { email: inbox.email, password: inbox.app_password, imapHost: inbox.imap_host || (inbox.channel === 'zoho' ? 'imap.zoho.com' : 'imap.gmail.com'),
        imapPort: inbox.imap_port || 993, smtpHost: '' },
      inboxId: inbox.id, projectId: inbox.project_id, role: inbox.role, channel: inbox.channel,
      limit: 25, cursor: JSON.parse(state?.cursor_json || '{}'),
    });
    const inserted = await saveMailThreads(db, result.threads, db.prepare(`UPDATE mailbox_sync SET cursor_json = ?, last_success_at = ?, error = NULL, pending = ?, lease_until = 0 WHERE inbox_id = ?`)
      .bind(JSON.stringify(result.cursor), now, result.pending ? 1 : 0, inbox.id));
    await db.prepare('UPDATE inboxes SET last_synced_at = ?, status = ? WHERE id = ?').bind(now, 'connected', inbox.id).run();
    return { success: true, pending: result.pending, fetched: result.fetched, folder: result.folder, inserted };
  } catch (error: any) {
    const message = error?.responseText || error?.message || 'Mailbox sync failed';
    await db.prepare('UPDATE mailbox_sync SET error = ?, lease_until = 0 WHERE inbox_id = ?').bind(message, inbox.id).run();
    if (inbox.receiving_mode !== 'routing') await db.prepare("UPDATE inboxes SET status = 'error' WHERE id = ?").bind(inbox.id).run();
    return { success: false, error: message, inserted: [] as IncomingAlert[] };
  }
}

export async function syncSavedMailboxes(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM inboxes WHERE app_password IS NOT NULL AND app_password != '' ORDER BY id").all();
  // Bound socket concurrency; each account has its own durable checkpoint and lease.
  const resultsOut = [];
  for (let i = 0; i < results.length; i += 2) {
    resultsOut.push(...await Promise.all(results.slice(i, i + 2).map(inbox => syncMailbox(db, inbox))));
  }
  return resultsOut;
}
