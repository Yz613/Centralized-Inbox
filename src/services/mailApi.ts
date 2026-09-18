import { Thread, ChannelType, InboxRole } from '../types';

export interface MailVerifyResponse {
  success: boolean;
  imap: {
    success: boolean;
    message: string;
    latencyMs?: number;
    totalMessages?: number;
    unreadMessages?: number;
  };
  smtp: {
    success: boolean;
    message: string;
    latencyMs?: number;
  };
  message?: string;
}

export const ZOHO_REGIONS: { id: string; label: string; imap: string; smtp: string }[] = [
  { id: 'com', label: 'Global / US (.com)', imap: 'imap.zoho.com', smtp: 'smtp.zoho.com' },
  { id: 'eu', label: 'Europe (.eu)', imap: 'imap.zoho.eu', smtp: 'smtp.zoho.eu' },
  { id: 'in', label: 'India (.in)', imap: 'imap.zoho.in', smtp: 'smtp.zoho.in' },
  { id: 'com.au', label: 'Australia (.com.au)', imap: 'imap.zoho.com.au', smtp: 'smtp.zoho.com.au' },
  { id: 'com.cn', label: 'China (.com.cn)', imap: 'imap.zoho.com.cn', smtp: 'smtp.zoho.com.cn' },
];

export const GMAIL_PRESET = {
  imap: 'imap.gmail.com',
  smtp: 'smtp.gmail.com',
  imapPort: 993,
  smtpPort: 465,
};

export async function verifyLiveMailConnection(params: {
  email: string;
  appPassword?: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
}): Promise<MailVerifyResponse> {
  const res = await fetch('/api/mail/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Server returned HTTP ${res.status}`);
  }

  return await res.json();
}

export async function fetchLiveMailboxThreads(params: {
  email: string;
  appPassword?: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  projectId?: string;
  inboxId?: string;
  role?: InboxRole;
  channel?: ChannelType;
  limit?: number;
}): Promise<Thread[]> {
  const res = await fetch('/api/mail/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `IMAP fetch failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.threads || [];
}

export async function sendLiveMailMessage(params: {
  email: string;
  appPassword?: string;
  password?: string;
  smtpHost?: string;
  smtpPort?: number;
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  inReplyTo?: string;
  references?: string[] | string;
  threadId?: string;
  inboxId?: string;
  projectId?: string;
  senderName?: string;
}): Promise<{ success: boolean; messageId: string; threadId?: string }> {
  const res = await fetch('/api/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      text: params.body,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `SMTP send failed: HTTP ${res.status}`);
  }

  return await res.json();
}

export async function persistMessageToD1(msg: any): Promise<{ success: boolean; id?: string }> {
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}
