-- Receipt status is separate from source-mailbox history sync.
ALTER TABLE inboxes ADD COLUMN receiving_mode TEXT NOT NULL DEFAULT 'mailbox';
ALTER TABLE inboxes ADD COLUMN last_received_at TEXT;
ALTER TABLE inboxes ADD COLUMN delivery_error TEXT;
ALTER TABLE inboxes ADD COLUMN forward_email TEXT;
CREATE TABLE mailbox_sync (
  inbox_id TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  last_attempt_at TEXT,
  last_success_at TEXT,
  error TEXT,
  pending INTEGER NOT NULL DEFAULT 1,
  lease_until INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_inbox_message_id ON messages(inbox_id, message_id);
CREATE INDEX IF NOT EXISTS idx_threads_page ON threads(last_message_timestamp DESC, id DESC);
