import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { UnifiedThread } from './mailService';

/** Commit complete messages and their checkpoint together. A failed write is retryable. */
export async function saveMailThreads(db: D1Database, threads: UnifiedThread[], checkpoint?: D1PreparedStatement) {
  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();
  const known = new Map<string, string>();
  for (const inboxId of new Set(threads.map(t => t.inboxId))) {
    const rows = await db.prepare('SELECT id, message_id, thread_id FROM messages WHERE inbox_id = ?').bind(inboxId).all<any>();
    for (const row of rows.results) {
      known.set(`${inboxId}:${row.id}`, row.thread_id);
      if (row.message_id) known.set(`${inboxId}:${row.message_id}`, row.thread_id);
    }
  }
  for (const thread of threads) {
    const key = (id: string) => `${thread.inboxId}:${id}`;
    // Reuse imported conversations and RFC references, always within this account.
    const candidates = thread.messages.flatMap(m => [m.id, m.messageId, m.inReplyTo, ...(m.references || [])]).filter(Boolean) as string[];
    const threadId = candidates.map(id => known.get(key(id))).find(Boolean) || thread.id;
    const messages = thread.messages.filter(m => !known.has(key(m.id)) && !(m.messageId && known.has(key(m.messageId))));
    const spamUpdate = thread.spamStatus === 'suspected' || thread.tags.includes('SPAM')
      ? db.prepare("UPDATE threads SET spam_status = 'suspected', spam_reason = ?, updated_at = ? WHERE id = ? AND spam_reviewed_at IS NULL")
        .bind(thread.spamReason || 'Your mail provider flagged a message as possible spam.', now, threadId)
      : null;
    if (!messages.length) { if (spamUpdate) statements.push(spamUpdate); continue; }
    statements.push(db.prepare(`INSERT INTO threads
      (id,project_id,inbox_id,channel,inbox_role,subject,snippet,participants_json,last_message_timestamp,message_count,is_read,is_starred,is_archived,tags_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?,0,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(
      threadId, thread.projectId, thread.inboxId, thread.channel, thread.inboxRole, thread.subject,
      thread.snippet, JSON.stringify(thread.participants), thread.lastMessageTimestamp,
      thread.isRead ? 1 : 0, thread.isStarred ? 1 : 0, JSON.stringify(thread.tags), now, now));
    for (const m of messages) {
      statements.push(db.prepare(`INSERT INTO messages
        (id,thread_id,inbox_id,project_id,channel,inbox_role,from_json,to_json,cc_json,bcc_json,subject,body_text,body_html,timestamp,is_outgoing,message_id,in_reply_to,references_json,attachments_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(
        m.id,threadId,m.inboxId,m.projectId,m.channel,m.inboxRole,JSON.stringify(m.from),JSON.stringify(m.to),
        m.cc ? JSON.stringify(m.cc) : null,m.bcc ? JSON.stringify(m.bcc) : null,m.subject,m.bodyText,m.bodyHtml || null,
        m.timestamp,m.isOutgoing ? 1 : 0,m.messageId || null,m.inReplyTo || null,m.references ? JSON.stringify(m.references) : null,
        m.attachments ? JSON.stringify(m.attachments) : null,now));
      known.set(key(m.id),threadId);
      if (m.messageId) known.set(key(m.messageId),threadId);
    }
    const hasIncoming = messages.some(m => !m.isOutgoing);
    statements.push(db.prepare(`UPDATE threads SET
      snippet = CASE WHEN last_message_timestamp <= ? THEN ? ELSE snippet END,
      last_message_timestamp = MAX(last_message_timestamp, ?),
      message_count = (SELECT COUNT(*) FROM messages WHERE thread_id = ?),
      is_read = CASE WHEN ? = 1 AND last_message_timestamp <= ? THEN 0 ELSE is_read END,
      is_archived = CASE WHEN ? = 1 AND last_message_timestamp <= ? THEN 0 ELSE is_archived END,
      updated_at = ? WHERE id = ?`).bind(
      thread.lastMessageTimestamp,thread.snippet,thread.lastMessageTimestamp,threadId,
      hasIncoming && !thread.isRead ? 1 : 0,thread.lastMessageTimestamp,hasIncoming ? 1 : 0,thread.lastMessageTimestamp,now,threadId));
    if (spamUpdate) statements.push(spamUpdate);
  }
  if (checkpoint) statements.push(checkpoint);
  if (statements.length) await db.batch(statements);
}
