-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  accent_color TEXT,
  created_at TEXT NOT NULL
);

-- Inboxes Table
CREATE TABLE IF NOT EXISTS inboxes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  channel TEXT NOT NULL,
  role TEXT NOT NULL,
  badge_color TEXT,
  status TEXT DEFAULT 'connected',
  last_synced_at TEXT,
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 465,
  app_password TEXT,
  auth_type TEXT DEFAULT 'app_password',
  zoho_region TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Threads Table
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  inbox_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  inbox_role TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT,
  participants_json TEXT,
  last_message_timestamp TEXT NOT NULL,
  message_count INTEGER DEFAULT 1,
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  inbox_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  inbox_role TEXT NOT NULL,
  from_json TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT,
  bcc_json TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  timestamp TEXT NOT NULL,
  is_outgoing INTEGER DEFAULT 0,
  message_id TEXT,
  in_reply_to TEXT,
  references_json TEXT,
  attachments_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id);
CREATE INDEX IF NOT EXISTS idx_threads_inbox ON threads(inbox_id);
CREATE INDEX IF NOT EXISTS idx_threads_timestamp ON threads(last_message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp ASC);
