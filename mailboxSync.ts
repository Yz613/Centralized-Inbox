import type { D1Database } from '@cloudflare/workers-types';
import { fetchImapPage } from './mailService';
import { saveMailThreads, type IncomingAlert } from './mailStore';

/** Errors that will not fix themselves on the next attempt: the account must change settings or credentials. */
const PERMANENT_IMAP_ERROR = /enable IMAP|IMAP (access )?(is )?disabled|AUTHENTICATIONFAILED|authentication failed|invalid credentials|LOGIN failed|application-specific password|web login required/i;
export const PERMANENT_FAILURE_BACKOFF_MS = 30 * 60_000;
export const TRANSIENT_FAILURE_BACKOFF_MS = 2 * 60_000;

/** How long to leave a mailbox alone after a failed sync, so pollers do not hammer a server that keeps refusing us. */
export function failureBackoffMs(message: string): number {
  return PERMANENT_IMAP_ERROR.test(message) ? PERMANENT_FAILURE_BACKOFF_MS : TRANSIENT_FAILURE_BACKOFF_MS;
}

export async function syncMailbox(db: D1Database, inbox: any, skipTags: string[] = [], makeClient?: Parameters<typeof fetchImapPage>[1]) {
  const now = new Date().toISOString();
  await db.prepare('INSERT OR IGNORE INTO mailbox_sync (inbox_id) VALUES (?)').bind(inbox.id).run();
  // lease_until doubles as "not before": a running sync holds it for 2 minutes, a failed one pushes it out by the backoff.
  const lease = await db.prepare('UPDATE mailbox_sync SET lease_until = ?, last_attempt_at = ? WHERE inbox_id = ? AND lease_until < ?')
    .bind(Date.now() + 120000, now, inbox.id, Date.now()).run();
  if (!lease.meta.changes) {
    const held = await db.prepare('SELECT error, lease_until FROM mailbox_sync WHERE inbox_id = ?').bind(inbox.id).first<any>();
    if (held?.error) {
      // Still backing off from the last failure: report it without contacting the mail server again.
      return { success: false, deferred: true, error: String(held.error), retryAt: new Date(Number(held.lease_until)).toISOString(), skipped: 0, inserted: [] as IncomingAlert[] };
    }
    return { success: true, busy: true, pending: true, skipped: 0, inserted: [] as IncomingAlert[] };
  }
  try {
    const state = await db.prepare('SELECT cursor_json FROM mailbox_sync WHERE inbox_id = ?').bind(inbox.id).first<any>();
    const result = await fetchImapPage({
      config: { email: inbox.email, password: inbox.app_password, imapHost: inbox.imap_host || (inbox.channel === 'zoho' ? 'imap.zoho.com' : 'imap.gmail.com'),
        imapPort: inbox.imap_port || 993, smtpHost: '' },
      inboxId: inbox.id, projectId: inbox.project_id, role: inbox.role, channel: inbox.channel,
      limit: 25, cursor: JSON.parse(state?.cursor_json || '{}'), skipTags,
    }, makeClient);
    const inserted = await saveMailThreads(db, result.threads, db.prepare(`UPDATE mailbox_sync SET cursor_json = ?, last_success_at = ?, error = NULL, pending = ?, lease_until = 0 WHERE inbox_id = ?`)
      .bind(JSON.stringify(result.cursor), now, result.pending ? 1 : 0, inbox.id));
    await db.prepare('UPDATE inboxes SET last_synced_at = ?, status = ? WHERE id = ?').bind(now, 'connected', inbox.id).run();
    if (result.skipped) console.log(JSON.stringify({ message: 'skipped warmup mail', inboxId: inbox.id, folder: result.folder, skipped: result.skipped }));
    return { success: true, pending: result.pending, fetched: result.fetched, skipped: result.skipped, folder: result.folder, inserted };
  } catch (error: any) {
    const message = error?.responseText || error?.message || 'Mailbox sync failed';
    await db.prepare('UPDATE mailbox_sync SET error = ?, lease_until = ? WHERE inbox_id = ?').bind(message, Date.now() + failureBackoffMs(message), inbox.id).run();
    if (inbox.receiving_mode !== 'routing') await db.prepare("UPDATE inboxes SET status = 'error' WHERE id = ?").bind(inbox.id).run();
    return { success: false, error: message, skipped: 0, inserted: [] as IncomingAlert[] };
  }
}

export async function syncSavedMailboxes(db: D1Database, skipTags: string[] = [], makeClient?: Parameters<typeof fetchImapPage>[1]) {
  const { results } = await db.prepare("SELECT * FROM inboxes WHERE app_password IS NOT NULL AND app_password != '' ORDER BY id").all();
  // Bound socket concurrency; each account has its own durable checkpoint and lease.
  const resultsOut = [];
  for (let i = 0; i < results.length; i += 2) {
    resultsOut.push(...await Promise.all(results.slice(i, i + 2).map(inbox => syncMailbox(db, inbox, skipTags, makeClient))));
  }
  return resultsOut;
}
