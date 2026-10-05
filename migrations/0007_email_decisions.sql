-- Migration 0007: Cloudflare Clef Email Decision Triage & Probability Persistence

CREATE TABLE IF NOT EXISTS email_decisions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT,
  model TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  selected_choices_json TEXT NOT NULL,
  probability_distributions_json TEXT NOT NULL,
  latency_ms INTEGER DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'primary',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_decisions_thread ON email_decisions(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_decisions_message ON email_decisions(message_id);
CREATE INDEX IF NOT EXISTS idx_email_decisions_created ON email_decisions(created_at DESC);

CREATE TABLE IF NOT EXISTS email_decision_feedback (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  decision_id TEXT,
  event_type TEXT NOT NULL, -- 'user_replied', 'project_moved', 'snoozed', 'draft_used', 'urgency_overridden'
  event_data_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_feedback_thread ON email_decision_feedback(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_feedback_event ON email_decision_feedback(event_type);
