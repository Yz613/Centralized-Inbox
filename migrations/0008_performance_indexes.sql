-- Migration 0008: Composite Performance Indexes for Fast Multi-Account Queries
CREATE INDEX IF NOT EXISTS idx_threads_project_time ON threads(project_id, last_message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_threads_inbox_time ON threads(inbox_id, last_message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_threads_archived_time ON threads(is_archived, last_message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_time ON messages(thread_id, timestamp ASC);
