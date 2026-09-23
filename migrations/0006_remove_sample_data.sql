-- Retire the built-in demo workspaces from databases initialized with the old seed.
DELETE FROM messages WHERE project_id IN ('proj-apex', 'proj-nordic', 'proj-zenith');
DELETE FROM threads WHERE project_id IN ('proj-apex', 'proj-nordic', 'proj-zenith');
DELETE FROM mailbox_sync WHERE inbox_id IN (
  SELECT id FROM inboxes WHERE project_id IN ('proj-apex', 'proj-nordic', 'proj-zenith')
);
DELETE FROM inboxes WHERE project_id IN ('proj-apex', 'proj-nordic', 'proj-zenith');
DELETE FROM projects WHERE id IN ('proj-apex', 'proj-nordic', 'proj-zenith');
