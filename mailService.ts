import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import nodemailer from 'nodemailer';

export interface MailServerConfig {
  email: string;
  password: string;
  imapHost: string;
  imapPort?: number;
  smtpHost: string;
  smtpPort?: number;
  secure?: boolean;
}

export interface VerifyResult {
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
}

export interface UnifiedMessage {
  id: string;
  threadId: string;
  inboxId: string;
  projectId: string;
  channel: string;
  inboxRole: string;
  from: {
    name: string;
    address: string;
    avatar?: string;
  };
  to: {
    name: string;
    address: string;
  }[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  timestamp: string;
  isOutgoing: boolean;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: {
    name: string;
    size: string;
    type: string;
  }[];
}

export interface UnifiedThread {
  id: string;
  projectId: string;
  inboxId: string;
  channel: string;
  inboxRole: string;
  subject: string;
  snippet: string;
  participants: {
    name: string;
    address: string;
    avatar?: string;
  }[];
  lastMessageTimestamp: string;
  messageCount: number;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  tags: string[];
  messages: UnifiedMessage[];
}

function normalizeSubject(subject: string): string {
  if (!subject) return 'No Subject';
  return subject
    .replace(/^((re|fwd|fw|aw|antw|wg)\s*:\s*)+/i, '')
    .trim();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAddresses(addrObj?: AddressObject | AddressObject[]): { name: string; address: string }[] {
  if (!addrObj) return [];
  const list = Array.isArray(addrObj) ? addrObj : [addrObj];
  const results: { name: string; address: string }[] = [];
  for (const item of list) {
    if (item?.value) {
      for (const val of item.value) {
        if (val.address) {
          results.push({
            name: val.name || val.address.split('@')[0] || 'Unknown',
            address: val.address.toLowerCase(),
          });
        }
      }
    }
  }
  return results;
}

/**
 * Verifies both IMAP and SMTP connections in parallel.
 */
export async function verifyMailConnection(config: MailServerConfig): Promise<VerifyResult> {
  const imapPort = config.imapPort || 993;
  const smtpPort = config.smtpPort || 465;

  let imapResult = {
    success: false,
    message: '',
    latencyMs: 0,
    totalMessages: 0,
    unreadMessages: 0,
  };

  let smtpResult = {
    success: false,
    message: '',
    latencyMs: 0,
  };

  // Test IMAP
  const imapStart = Date.now();
  const imapClient = new ImapFlow({
    host: config.imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: {
      user: config.email,
      pass: config.password,
    },
    logger: false,
    emitLogs: false,
    tls: {
      servername: config.imapHost,
    },
  });

  const imapPromise = (async () => {
    try {
      await imapClient.connect();
      let totalMessages = 0;
      let unreadMessages = 0;

      // Some IMAP providers (including Zoho) can fail on STATUS "INBOX" command.
      // If connect() succeeded, user is authenticated. We attempt status and fallback safely.
      try {
        const status = await imapClient.status('INBOX', { messages: true, unseen: true });
        totalMessages = status.messages || 0;
        unreadMessages = status.unseen || 0;
      } catch (statusErr) {
        try {
          const mb = await imapClient.mailboxOpen('INBOX', { readOnly: true });
          totalMessages = mb.exists || 0;
        } catch {
          // Authentication succeeded even if mailbox count query was restricted
        }
      }

      imapResult = {
        success: true,
        message: `IMAP authenticated on ${config.imapHost}:${imapPort} (${totalMessages} messages).`,
        latencyMs: Date.now() - imapStart,
        totalMessages,
        unreadMessages,
      };
      await imapClient.logout();
    } catch (err: any) {
      const serverResponse = err?.responseText || err?.response || '';
      let helpfulMsg = serverResponse || err?.message || 'IMAP Authentication failed.';
      const isZoho = config.imapHost.includes('zoho') || config.email.includes('zoho');

      if (serverResponse.includes('enable IMAP') || serverResponse.includes('administrator')) {
        helpfulMsg = `Zoho IMAP is disabled for this account: "${serverResponse}". Fix: In Zoho Mail (mail.zoho.com) > Settings ⚙️ > Mail Accounts > POP/IMAP, check IMAP Access ON. If your email is under an organization domain, your administrator must enable IMAP under mailadmin.zoho.com > Users > Mail Settings > IMAP Access.`;
      } else if (err?.message?.includes('Command failed') || err?.command === 'AUTHENTICATE' || err?.command === 'LOGIN') {
        if (isZoho) {
          helpfulMsg = `Zoho IMAP login was rejected ('Command failed'). In Zoho, IMAP is OFF by default. Fix: Log into mail.zoho.com > Settings ⚙️ > Mail Accounts > Email Forwarding and POP/IMAP > Check "IMAP Access" to ENABLED (or enable in mailadmin.zoho.com).`;
        } else {
          helpfulMsg = `IMAP login rejected (${err?.command || 'LOGIN'}). Ensure IMAP access is enabled in your email provider settings.`;
        }
      }

      imapResult = {
        success: false,
        message: helpfulMsg,
        latencyMs: Date.now() - imapStart,
        totalMessages: 0,
        unreadMessages: 0,
      };
      try {
        await imapClient.logout();
      } catch {
        // ignore
      }
    }
  })();

  // Test SMTP
  const smtpStart = Date.now();
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: config.email,
      pass: config.password,
    },
    connectionTimeout: 8000,
  });

  const smtpPromise = (async () => {
    try {
      await transporter.verify();
      smtpResult = {
        success: true,
        message: `SMTP verified on ${config.smtpHost}:${smtpPort}. Outbound ready.`,
        latencyMs: Date.now() - smtpStart,
      };
    } catch (err: any) {
      smtpResult = {
        success: false,
        message: err?.message || 'SMTP Authentication failed. Check your email & App Password.',
        latencyMs: Date.now() - smtpStart,
      };
    }
  })();

  await Promise.all([imapPromise, smtpPromise]);

  return {
    success: imapResult.success && smtpResult.success,
    imap: imapResult,
    smtp: smtpResult,
  };
}

/**
 * Connects to IMAP, pulls latest messages from INBOX, parses MIME, and returns unified threads.
 */
export async function fetchImapThreads(params: {
  config: MailServerConfig;
  limit?: number;
  projectId?: string;
  inboxId?: string;
  role?: string;
  channel?: string;
}): Promise<UnifiedThread[]> {
  const imapPort = params.config.imapPort || 993;
  const limit = Math.min(Math.max(params.limit || 20, 1), 50);
  const projectId = params.projectId || 'proj-apex';
  const inboxId = params.inboxId || `inbox-${Date.now()}`;
  const role = params.role || 'general';
  const channel = params.channel || 'zoho';

  const client = new ImapFlow({
    host: params.config.imapHost,
    port: imapPort,
    secure: imapPort === 993,
    auth: {
      user: params.config.email,
      pass: params.config.password,
    },
    logger: false,
    emitLogs: false,
    tls: {
      servername: params.config.imapHost,
    },
  });

  try {
    await client.connect();
  } catch (err: any) {
    const rawReason = err?.responseText || err?.response || err?.message || 'Connection failed';
    if (rawReason.includes('enable IMAP') || rawReason.includes('administrator')) {
      throw new Error(
        `Zoho IMAP is disabled for ${params.config.email}: "${rawReason}". To pull existing emails, enable IMAP in mail.zoho.com (Settings > Mail Accounts > POP/IMAP) or in mailadmin.zoho.com (Users > Mail Settings > IMAP Access).`
      );
    }
    throw new Error(`IMAP connection failed: ${rawReason}`);
  }

  const lock = await client.getMailboxLock('INBOX');
  const fetchedRawMessages: {
    uid: number;
    flags: Set<string>;
    internalDate: Date;
    source: Buffer;
  }[] = [];

  try {
    const mailbox = client.mailbox;
    if (!mailbox || mailbox.exists === 0) {
      return [];
    }

    const startSeq = Math.max(1, mailbox.exists - limit + 1);
    const range = `${startSeq}:*`;

    // Fetch messages in range
    for await (const message of client.fetch(range, {
      uid: true,
      flags: true,
      internalDate: true,
      source: true,
    })) {
      if (message.source) {
        fetchedRawMessages.push({
          uid: message.uid,
          flags: message.flags || new Set(),
          internalDate: typeof message.internalDate === 'string' ? new Date(message.internalDate) : (message.internalDate || new Date()),
          source: message.source,
        });
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  if (fetchedRawMessages.length === 0) {
    return [];
  }

  // Parse MIME for each message using simpleParser
  const parsedItems: {
    uid: number;
    flags: Set<string>;
    internalDate: Date;
    mail: ParsedMail;
  }[] = [];

  for (const raw of fetchedRawMessages) {
    try {
      const parsed = await simpleParser(raw.source);
      parsedItems.push({
        uid: raw.uid,
        flags: raw.flags,
        internalDate: raw.internalDate,
        mail: parsed,
      });
    } catch (err) {
      console.warn(`[mailService] Failed to parse message uid ${raw.uid}:`, err);
    }
  }

  // Convert each into a UnifiedMessage
  const unifiedMessages: (UnifiedMessage & {
    normSubject: string;
    rawMessageId?: string;
    isRead: boolean;
    isStarred: boolean;
  })[] = [];

  for (const item of parsedItems) {
    const { uid, flags, internalDate, mail } = item;
    const isRead = flags.has('\\Seen');
    const isStarred = flags.has('\\Flagged');

    const fromAddrs = parseAddresses(mail.from);
    const primaryFrom = fromAddrs[0] || {
      name: params.config.email.split('@')[0],
      address: params.config.email,
    };

    const toAddrs = parseAddresses(mail.to);
    const ccAddrs = parseAddresses(mail.cc).map((a) => a.address);
    const bccAddrs = parseAddresses(mail.bcc).map((a) => a.address);

    const isOutgoing = primaryFrom.address.toLowerCase() === params.config.email.toLowerCase();

    // Attachments
    const attachments = (mail.attachments || []).map((att) => ({
      name: att.filename || 'attachment',
      size: formatBytes(att.size || 0),
      type: att.contentType || 'application/octet-stream',
    }));

    const subject = mail.subject || '(No Subject)';
    const normSubject = normalizeSubject(subject);

    const bodyText = (mail.text || '')
      .replace(/\r\n/g, '\n')
      .trim() || (mail.html ? mail.html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : '');

    const bodyHtml = mail.html || undefined;

    const references = Array.isArray(mail.references)
      ? mail.references
      : mail.references
      ? [mail.references]
      : [];

    unifiedMessages.push({
      id: `imap-msg-${channel}-${uid}`,
      threadId: '', // assigned below
      inboxId,
      projectId,
      channel,
      inboxRole: role,
      from: {
        name: primaryFrom.name,
        address: primaryFrom.address,
        avatar: primaryFrom.name.slice(0, 2).toUpperCase(),
      },
      to: toAddrs.length > 0 ? toAddrs : [{ name: 'Me', address: params.config.email }],
      cc: ccAddrs.length > 0 ? ccAddrs : undefined,
      bcc: bccAddrs.length > 0 ? bccAddrs : undefined,
      subject,
      normSubject,
      bodyText,
      bodyHtml,
      timestamp: (mail.date || internalDate).toISOString(),
      isOutgoing,
      messageId: mail.messageId,
      rawMessageId: mail.messageId,
      inReplyTo: mail.inReplyTo,
      references,
      attachments: attachments.length > 0 ? attachments : undefined,
      isRead,
      isStarred,
    });
  }

  // Thread grouping:
  // Group by references/inReplyTo chain, or fallback to normalized subject
  const threadMap = new Map<string, typeof unifiedMessages>();

  for (const msg of unifiedMessages) {
    let threadKey: string | null = null;

    if (msg.inReplyTo) {
      for (const [key, tMsgs] of threadMap.entries()) {
        if (tMsgs.some((m) => m.rawMessageId === msg.inReplyTo || (m.references && m.references.includes(msg.inReplyTo!)))) {
          threadKey = key;
          break;
        }
      }
    }

    if (!threadKey) {
      threadKey = `thread-${channel}-${Buffer.from(msg.normSubject).toString('base64url').slice(0, 32)}`;
    }

    const list = threadMap.get(threadKey) || [];
    list.push(msg);
    threadMap.set(threadKey, list);
  }

  const threads: UnifiedThread[] = [];

  threadMap.forEach((msgs, threadId) => {
    // Sort chronological inside thread
    msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    msgs.forEach((m) => {
      m.threadId = threadId;
    });

    const latestMsg = msgs[msgs.length - 1];
    const isAnyUnread = msgs.some((m) => !m.isRead);
    const isAnyStarred = msgs.some((m) => m.isStarred);

    const participantsMap = new Map<string, { name: string; address: string; avatar?: string }>();
    msgs.forEach((m) => {
      if (m.from?.address) {
        participantsMap.set(m.from.address.toLowerCase(), m.from);
      }
      m.to.forEach((t) => {
        if (t.address && !participantsMap.has(t.address.toLowerCase())) {
          participantsMap.set(t.address.toLowerCase(), {
            name: t.name,
            address: t.address,
            avatar: t.name.slice(0, 2).toUpperCase(),
          });
        }
      });
    });

    const participants = Array.from(participantsMap.values());

    threads.push({
      id: threadId,
      projectId,
      inboxId,
      channel,
      inboxRole: role,
      subject: latestMsg.subject,
      snippet: latestMsg.bodyText.slice(0, 100).replace(/\n/g, ' ') || '(No content)',
      participants,
      lastMessageTimestamp: latestMsg.timestamp,
      messageCount: msgs.length,
      isRead: !isAnyUnread,
      isStarred: isAnyStarred,
      isArchived: false,
      tags: [channel.toUpperCase(), 'LIVE_IMAP'],
      messages: msgs.map(({ normSubject, rawMessageId, isRead, isStarred, ...rest }) => rest),
    });
  });

  threads.sort(
    (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
  );

  return threads;
}

/**
 * Sends an email via SMTP using Nodemailer.
 */
export async function sendSmtpEmail(params: {
  config: MailServerConfig;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[] | string;
  attachments?: {
    name: string;
    size?: string;
    type?: string;
    content?: any;
    contentBase64?: string;
    path?: string;
  }[];
}): Promise<{ success: boolean; messageId: string; envelope: any }> {
  const smtpPort = params.config.smtpPort || 465;

  const transporter = nodemailer.createTransport({
    host: params.config.smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: params.config.email,
      pass: params.config.password,
    },
  });

  const mailOptions: any = {
    from: params.config.email,
    to: params.to,
    subject: params.subject,
    text: params.text,
  };

  if (params.html) {
    mailOptions.html = params.html;
  }

  if (params.inReplyTo) {
    mailOptions.inReplyTo = params.inReplyTo;
  }

  if (params.references) {
    mailOptions.references = params.references;
  }

  if (params.cc) {
    mailOptions.cc = params.cc;
  }
  if (params.bcc) {
    mailOptions.bcc = params.bcc;
  }

  const smtpAttachments = (params.attachments || [])
    .map((att) => {
      const raw = att.contentBase64 || att.content;
      if (!raw || typeof raw !== 'string') return null;
      return {
        filename: att.name,
        content: Buffer.from(raw, 'base64'),
        contentType: att.type || 'application/octet-stream',
      };
    })
    .filter(Boolean);
  if (smtpAttachments.length > 0) {
    mailOptions.attachments = smtpAttachments;
  }

  const info = await transporter.sendMail(mailOptions);

  return {
    success: true,
    messageId: info.messageId,
    envelope: info.envelope,
  };
}
