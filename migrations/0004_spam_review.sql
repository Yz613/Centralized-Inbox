ALTER TABLE threads ADD COLUMN spam_status TEXT CHECK (spam_status IN ('suspected', 'not_spam'));
ALTER TABLE threads ADD COLUMN spam_reason TEXT;
ALTER TABLE threads ADD COLUMN spam_reviewed_at TEXT;
-- Preserve provider flags already imported by Gmail OAuth.
UPDATE threads SET spam_status = 'suspected', spam_reason = 'Gmail placed a message in Spam.'
WHERE EXISTS (SELECT 1 FROM json_each(threads.tags_json) WHERE value = 'SPAM');
-- Revisit common Spam/Junk folders once so previously imported messages gain a warning.
-- Existing message IDs deduplicate; user reviews remain untouched.
UPDATE mailbox_sync SET cursor_json = json_remove(cursor_json,
  '$.folders.Spam', '$.folders.SPAM', '$.folders.Junk', '$.folders."Junk E-mail"',
  '$.folders."[Gmail]/Spam"', '$.folders."[Google Mail]/Spam"'), pending = 1
WHERE json_valid(cursor_json);
