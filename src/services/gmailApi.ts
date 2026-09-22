import { Thread, Message, ChannelType, InboxRole } from '../types';
import { assessSpam } from '../utils/spam';
import { getAccessToken } from './googleAuth';

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType: string;
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailPart[];
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: {
    headers: GmailHeader[];
    mimeType: string;
    body?: {
      data?: string;
      size?: number;
    };
    parts?: GmailPart[];
  };
}

function decodeBase64Url(input: string): string {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.warn('Failed to decode base64url payload', e);
    return '';
  }
}

function extractBody(payload?: GmailMessageDetail['payload']): { text: string; html?: string } {
  if (!payload) return { text: '' };

  let text = '';
  let html = '';

  const walk = (part: GmailPart) => {
    if (part.mimeType === 'text/plain' && part.body?.data && !text) {
      text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      part.parts.forEach(walk);
    }
  };

  if (payload.body?.data) {
    if (payload.mimeType === 'text/html') {
      html = decodeBase64Url(payload.body.data);
    } else {
      text = decodeBase64Url(payload.body.data);
    }
  }

  if (payload.parts) {
    payload.parts.forEach(walk);
  }

  return { text: text || html.replace(/<[^>]*>?/gm, ' ').trim(), html: html || undefined };
}

function parseHeader(headers: GmailHeader[], name: string): string {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

function parseEmailAddress(raw: string): { name: string; address: string } {
  if (!raw) return { name: 'Unknown', address: '' };
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, '').trim() || match[2],
      address: match[2].trim(),
    };
  }
  return { name: raw.split('@')[0] || raw, address: raw.trim() };
}

export interface GmailFetchParams {
  projectId: string;
  inboxId: string;
  userEmail: string;
  inboxRole?: InboxRole;
  maxCount?: number;
  onPage?: (threads: Thread[]) => Promise<void>;
}

export async function fetchLiveGmailThreads(params: GmailFetchParams): Promise<Thread[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Reconnect your Google account to sync email.');
  return readGmailThreads(params, token);
}

export async function readGmailThreads(params: GmailFetchParams, token: string): Promise<Thread[]> {
  const request = async (path: string) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(response.status === 401 ? `Reconnect ${params.userEmail}: Google access expired.` : error?.error?.message || `Gmail returned HTTP ${response.status}`);
      }
      return response.json();
    }
  };
  const profile = await request('profile');
  if (profile.emailAddress?.toLowerCase() !== params.userEmail.toLowerCase()) {
    throw new Error(`Sign in to ${params.userEmail} to sync this account.`);
  }
  const syncKey = `gmail-sync-${params.inboxId}`;
  const startedAt = Date.now();
  const previous = Number(localStorage.getItem(syncKey) || 0);
  let pageToken = '';
  const allThreads: Thread[] = [];
  do {
    const query = new URLSearchParams({ maxResults: '25', includeSpamTrash: 'true' });
    if (pageToken) query.set('pageToken', pageToken);
    if (previous) query.set('q', `after:${Math.floor(previous / 1000) - 86400}`);
    const page = await request(`threads?${query}`);
    const threadMap = new Map<string, GmailMessageDetail[]>();
    const items = page.threads || [];
    for (let start = 0; start < items.length; start += 4) {
      const details = await Promise.all(items.slice(start, start + 4).map((item: any) => request(`threads/${item.id}?format=full`)));
      for (const detail of details) {
        if (detail.messages?.length) threadMap.set(detail.id, detail.messages);
      }
    }
  const convertedThreads: Thread[] = [];

  threadMap.forEach((msgs, gThreadId) => {
    // Sort chronological inside thread
    msgs.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));

    const latestMsg = msgs[msgs.length - 1];
    const headers = latestMsg.payload?.headers || [];
    const subject = parseHeader(headers, 'Subject') || '(No Subject)';
    const fromRaw = parseHeader(headers, 'From');
    const parsedFrom = parseEmailAddress(fromRaw);
    const toRaw = parseHeader(headers, 'To');
    const parsedTo = parseEmailAddress(toRaw);

    const isUnread = msgs.some(m => m.labelIds?.includes('UNREAD'));
    const isStarred = Boolean(latestMsg.labelIds?.includes('STARRED'));

    const internalMessages: Message[] = msgs.map((m) => {
      const mHeaders = m.payload?.headers || [];
      const mFrom = parseEmailAddress(parseHeader(mHeaders, 'From'));
      const mTo = parseEmailAddress(parseHeader(mHeaders, 'To'));
      const { text, html } = extractBody(m.payload);
      const isOutgoing = mFrom.address.toLowerCase() === params.userEmail.toLowerCase();

      return {
        id: `gmail-msg-${params.inboxId}-${m.id}`,
        threadId: `gmail-thread-${params.inboxId}:${gThreadId}`,
        inboxId: params.inboxId,
        projectId: params.projectId,
        channel: 'gmail' as ChannelType,
        inboxRole: params.inboxRole || 'general',
        from: {
          name: mFrom.name,
          address: mFrom.address,
          avatar: mFrom.name.slice(0, 2).toUpperCase(),
        },
        to: [{ name: mTo.name, address: mTo.address }],
        cc: parseHeader(mHeaders, 'Cc')
          ? parseHeader(mHeaders, 'Cc')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        subject: parseHeader(mHeaders, 'Subject') || subject,
        bodyText: text || m.snippet || '',
        bodyHtml: html,
        timestamp: new Date(Number(m.internalDate)).toISOString(),
        isOutgoing,
        messageId: parseHeader(mHeaders, 'Message-ID') || undefined,
        inReplyTo: parseHeader(mHeaders, 'In-Reply-To') || undefined,
        references: parseHeader(mHeaders, 'References').match(/<[^>]+>/g) || [],
      };
    });

    const threadObj: Thread = {
      id: `gmail-thread-${params.inboxId}:${gThreadId}`,
      projectId: params.projectId,
      inboxId: params.inboxId,
      channel: 'gmail',
      inboxRole: params.inboxRole || 'general',
      subject,
      snippet: latestMsg.snippet || internalMessages[internalMessages.length - 1]?.bodyText.slice(0, 90) || '',
      participants: [
        parsedFrom,
        ...(parsedTo.address ? [parsedTo] : []),
      ],
      lastMessageTimestamp: new Date(Number(latestMsg.internalDate)).toISOString(),
      messageCount: internalMessages.length,
      isRead: !isUnread,
      isStarred,
      isArchived: false,
      tags: ['GMAIL', 'LIVE', ...new Set(msgs.flatMap(m => m.labelIds || []).filter(label => ['SPAM', 'TRASH', 'SENT', 'DRAFT'].includes(label)))],
      messages: internalMessages,
      ...assessSpam({ labels:msgs.flatMap(m => m.labelIds || []), headers:msgs.flatMap(m => m.payload?.headers || []), subject }),
    };

    convertedThreads.push(threadObj);
  });

    if (params.onPage) await params.onPage(convertedThreads);
    allThreads.push(...convertedThreads);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  // Advance only after every page and its persistence succeeded.
  if (params.onPage) localStorage.setItem(syncKey, String(startedAt));
  return allThreads;
}

export interface GmailSendAsAlias {
  email: string;
  isDefault: boolean;
  verified: boolean;
}

export async function listGmailSendAs(): Promise<GmailSendAsAlias[]> {
  const token = await getAccessToken();
  if (!token) return [];
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return ((data.sendAs as any[]) || []).map((row) => ({
    email: String(row.sendAsEmail || '').toLowerCase(),
    isDefault: Boolean(row.isDefault),
    verified: row.verificationStatus === 'accepted' || Boolean(row.isDefault),
  })).filter((row) => row.email);
}

function utf8Base64(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

function encodeHeaderValue(value: string): string {
  return `=?utf-8?B?${utf8Base64(value)}?=`;
}

function toBase64Url(raw: string): string {
  return utf8Base64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function gmailRelayBody(bodyText: string, inboxEmail?: string, inboxName?: string): string {
  if (!inboxEmail) return bodyText;
  return `${bodyText}\n\n---\nSent for ${inboxName || inboxEmail} via ProjectInbox. Replies go to ${inboxEmail}.`;
}

export async function sendGmailEmail(params: {
  toAddress: string;
  subject: string;
  bodyText: string;
  fromEmail?: string;
  replyTo?: string;
  threadId?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: { name: string; type?: string; contentBase64?: string }[];
}): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Google authorization token expired or missing. Please sign in again.');
  }

  const realAttachments = (params.attachments || []).filter((a) => Boolean(a.contentBase64));
  const boundary = `inbox_${Date.now().toString(36)}`;
  const headers = [
    `To: ${params.toAddress}`,
    ...(params.fromEmail ? [`From: ${params.fromEmail}`] : []),
    ...(params.replyTo ? [`Reply-To: ${params.replyTo}`] : []),
    ...(params.cc?.length ? [`Cc: ${params.cc.join(', ')}`] : []),
    ...(params.bcc?.length ? [`Bcc: ${params.bcc.join(', ')}`] : []),
    `Subject: ${encodeHeaderValue(params.subject)}`,
    'MIME-Version: 1.0',
  ];

  let emailRaw: string;
  if (realAttachments.length === 0) {
    emailRaw = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      utf8Base64(params.bodyText),
    ].join('\r\n');
  } else {
    const parts = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      utf8Base64(params.bodyText),
    ];
    for (const att of realAttachments) {
      const filename = (att.name || 'attachment').replace(/[\r\n"]/g, '');
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.type || 'application/octet-stream'}; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        att.contentBase64!.replace(/\s+/g, '')
      );
    }
    parts.push(`--${boundary}--`);
    emailRaw = parts.join('\r\n');
  }

  const payload: { raw: string; threadId?: string } = { raw: toBase64Url(emailRaw) };
  if (params.threadId && params.threadId.startsWith('gmail-thread-')) {
    payload.threadId = params.threadId.replace('gmail-thread-', '').split(':').pop()!;
  }

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Failed to send email: HTTP ${res.status}`);
  }

  return await res.json();
}
