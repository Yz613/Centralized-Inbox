-- Seed Initial Projects
INSERT OR IGNORE INTO projects (id, name, description, color, accent_color, created_at) VALUES
('proj-apex', 'Apex SaaS Platform', 'B2B analytics cloud platform - customer operations & infrastructure', '#2563EB', '#DBEAFE', '2026-08-10T09:00:00Z'),
('proj-nordic', 'Nordic Living E-Commerce', 'Design decor store & international customer inquiries', '#0D9488', '#CCFBF1', '2026-08-15T10:30:00Z'),
('proj-zenith', 'Zenith Ventures', 'Advisory, investor communications & partnership deals', '#7C3AED', '#EDE9FE', '2026-09-01T14:00:00Z');

-- Seed Initial Inboxes
INSERT OR IGNORE INTO inboxes (id, project_id, name, email, channel, role, badge_color, status, last_synced_at, imap_host, imap_port, smtp_host, smtp_port, auth_type, created_at) VALUES
('inbox-apex-support', 'proj-apex', 'Apex Support Desk', 'support@apexanalytics.io', 'gmail', 'support', '#EF4444', 'connected', '2026-09-17T08:05:00Z', 'imap.gmail.com', 993, 'smtp.gmail.com', 465, 'app_password', '2026-08-10T09:00:00Z'),
('inbox-apex-admin', 'proj-apex', 'Apex Corporate Admin', 'admin@apexanalytics.io', 'zoho', 'admin', '#F59E0B', 'connected', '2026-09-17T08:08:00Z', 'imap.zoho.com', 993, 'smtp.zoho.com', 465, 'app_password', '2026-08-10T09:00:00Z'),
('inbox-apex-notif', 'proj-apex', 'Apex Cloud Alerts', 'notifications@apexanalytics.io', 'gmail', 'notifications', '#6366F1', 'connected', '2026-09-17T08:00:00Z', 'imap.gmail.com', 993, 'smtp.gmail.com', 465, 'app_password', '2026-08-10T09:00:00Z'),
('inbox-apex-wa', 'proj-apex', 'Apex VIP WhatsApp', '+1 (415) 890-1200', 'whatsapp', 'client', '#10B981', 'connected', '2026-09-17T08:10:00Z', NULL, NULL, NULL, NULL, 'oauth', '2026-08-10T09:00:00Z');
