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
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  inReplyTo?: string;
  references?: string[] | string;
  threadId?: string;
  inboxId?: string;
  projectId?: string;
  senderName?: string;
  attachments?: { name: string; type?: string; contentBase64?: string }[];
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

/** Read every stored conversation; report a failed page instead of pretending the inbox is current. */
export async function fetchStoredThreads(): Promise<Thread[]> {
  const threads: Thread[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(`/api/threads?${params}`);
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(response.status === 401 ? 'Your session expired. Sign in again.' : 'Could not refresh stored mail. Displaying cached messages.');
    }
    const page = await response.json();
    if (!Array.isArray(page.threads)) throw new Error('Invalid mail response. Displaying cached messages.');
    threads.push(...page.threads);
    cursor = page.nextCursor || undefined;
  } while (cursor);
  return threads;
}

/** A multi-page read must not replace newer mail with a snapshot taken mid-delivery. */
export async function fetchStableStoredThreads(): Promise<{ threads: Thread[]; revision: string }> {
  const revision = async () => {
    const response = await fetch('/api/mail/revision');
    if (!response.ok) throw new Error('Could not verify the latest mail. Displaying cached messages.');
    const body = await response.json();
    if (typeof body.revision !== 'string') throw new Error('Invalid mail revision. Displaying cached messages.');
    return body.revision;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await revision();
    const threads = await fetchStoredThreads();
    const after = await revision();
    if (before === after) return { threads, revision: after };
  }
  throw new Error('Mail changed during refresh. Keeping visible messages until the next check.');
}

export async function saveGmailPage(threads: Thread[]) {
  const response = await fetch('/api/import/batch', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threads}),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Could not save Gmail messages. Sync will retry.');
}
