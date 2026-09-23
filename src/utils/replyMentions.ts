import type { Thread, Message, InboxAccount } from '../types';
import { parseAddress } from './contacts';

export interface RecipientChip {
  name: string;
  address: string;
}

/** Resolves the default inbox account to reply from based on the email address the message was sent to */
export function resolveReplyInbox(
  thread: Thread,
  targetMessage: Message | undefined,
  inboxes: InboxAccount[],
  projectInboxes?: InboxAccount[],
  gmailSendAs?: string[]
): InboxAccount | undefined {
  if (!inboxes || inboxes.length === 0) return undefined;

  // 1. Identify the source message to reply to
  const source =
    targetMessage ||
    [...(thread.messages || [])].reverse().find((m) => !m.isOutgoing) ||
    thread.messages?.[thread.messages.length - 1];

  // 2. Extract candidate recipient emails that the email was sent to
  const candidateEmails: string[] = [];
  if (source) {
    if (Array.isArray(source.to)) {
      for (const t of source.to) {
        if (t?.address) candidateEmails.push(t.address.trim().toLowerCase());
      }
    }
    if (Array.isArray(source.cc)) {
      for (const c of source.cc) {
        const parsed = parseAddress(c);
        if (parsed.address) candidateEmails.push(parsed.address.trim().toLowerCase());
      }
    }
    if (Array.isArray(source.bcc)) {
      for (const b of source.bcc) {
        const parsed = parseAddress(b);
        if (parsed.address) candidateEmails.push(parsed.address.trim().toLowerCase());
      }
    }
  }

  // 3. Match candidate email directly against connected inboxes
  for (const email of candidateEmails) {
    // Prioritize an inbox in the thread's project if available
    const projectMatch =
      projectInboxes?.find((i) => i.email.toLowerCase() === email) ||
      inboxes.find((i) => i.projectId === thread.projectId && i.email.toLowerCase() === email);
    if (projectMatch) return projectMatch;

    // Check all inboxes
    const anyMatch = inboxes.find((i) => i.email.toLowerCase() === email);
    if (anyMatch) return anyMatch;
  }

  // 4. Match candidate email against Gmail Send-As aliases if Gmail is connected
  if (gmailSendAs && gmailSendAs.length > 0) {
    for (const email of candidateEmails) {
      if (gmailSendAs.some((alias) => alias.toLowerCase() === email)) {
        const gmailInbox = inboxes.find((i) => i.channel === 'gmail');
        if (gmailInbox) return gmailInbox;
      }
    }
  }

  // 5. Match candidate email that shares the domain of a connected inbox (e.g. unconfigured alias / routing address)
  const knownDomains = new Set(
    inboxes
      .map((i) => i.email.split('@')[1]?.toLowerCase())
      .filter((d): d is string => Boolean(d))
  );

  for (const email of candidateEmails) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && knownDomains.has(domain)) {
      const carrier =
        projectInboxes?.find((i) => i.email.toLowerCase().endsWith(`@${domain}`)) ||
        inboxes.find((i) => i.projectId === thread.projectId && i.email.toLowerCase().endsWith(`@${domain}`)) ||
        inboxes.find((i) => i.email.toLowerCase().endsWith(`@${domain}`)) ||
        (projectInboxes && projectInboxes[0]) ||
        inboxes[0];

      return {
        id: `sent-to-${email}`,
        name: email.split('@')[0],
        email,
        channel: carrier?.channel || 'cloudflare',
        role: carrier?.role || 'general',
        projectId: thread.projectId || carrier?.projectId || 'default',
        badgeColor: carrier?.badgeColor || '#3B82F6',
        unreadCount: 0,
        status: 'connected',
        lastSyncedAt: new Date().toISOString(),
      };
    }
  }

  // 6. Match by message inboxId (e.g. BCC or mailing list delivery)
  if (source?.inboxId) {
    const match = inboxes.find(
      (i) => i.id === source.inboxId || i.email.toLowerCase() === source.inboxId.toLowerCase()
    );
    if (match) return match;
  }

  // 7. Match by thread inboxId
  if (thread.inboxId) {
    const match = inboxes.find(
      (i) => i.id === thread.inboxId || i.email.toLowerCase() === thread.inboxId.toLowerCase()
    );
    if (match) return match;
  }

  // 8. Check any incoming messages in the thread (from newest to oldest)
  const incomingMessages = [...(thread.messages || [])].reverse().filter((m) => !m.isOutgoing);
  for (const msg of incomingMessages) {
    for (const t of msg.to || []) {
      if (!t?.address) continue;
      const addr = t.address.trim().toLowerCase();
      const match = inboxes.find((i) => i.email.toLowerCase() === addr);
      if (match) return match;
    }
    if (msg.inboxId) {
      const match = inboxes.find(
        (i) => i.id === msg.inboxId || i.email.toLowerCase() === msg.inboxId.toLowerCase()
      );
      if (match) return match;
    }
  }

  // 9. Check thread participants matching any inbox email
  for (const p of thread.participants || []) {
    if (!p?.address) continue;
    const addr = p.address.trim().toLowerCase();
    const match = inboxes.find((i) => i.email.toLowerCase() === addr);
    if (match) return match;
  }

  // 10. If candidateEmails has any address, use it as fallback
  if (candidateEmails.length > 0 && candidateEmails[0].includes('@')) {
    const sentTo = candidateEmails[0];
    const carrier =
      (projectInboxes && projectInboxes[0]) ||
      inboxes.find((i) => i.projectId === thread.projectId) ||
      inboxes[0];
    return {
      id: `sent-to-${sentTo}`,
      name: sentTo.split('@')[0],
      email: sentTo,
      channel: carrier?.channel || 'cloudflare',
      role: carrier?.role || 'general',
      projectId: thread.projectId || carrier?.projectId || 'default',
      badgeColor: carrier?.badgeColor || '#3B82F6',
      unreadCount: 0,
      status: 'connected',
      lastSyncedAt: new Date().toISOString(),
    };
  }

  // 11. Fallback to project inbox or first inbox
  return (
    projectInboxes?.find((i) => i.projectId === thread.projectId) ||
    projectInboxes?.[0] ||
    inboxes[0]
  );
}

/** The @token being typed at the caret, if the cursor is still inside it. */
export function mentionAtCursor(text: string, cursor: number): { start: number; query: string } | null {
  const safe = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safe);
  const match = before.match(/(?:^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1];
  return { start: safe - query.length - 1, query };
}

export function insertMention(
  text: string,
  cursor: number,
  start: number,
  label: string
): { text: string; cursor: number } {
  const safeLabel = label.replace(/[\r\n]/g, ' ').trim() || 'someone';
  const insertion = `@${safeLabel} `;
  const next = text.slice(0, start) + insertion + text.slice(cursor);
  return { text: next, cursor: start + insertion.length };
}

export function uniqueRecipients(people: RecipientChip[], ownEmail?: string): RecipientChip[] {
  const own = ownEmail?.toLowerCase();
  const seen = new Set<string>();
  const out: RecipientChip[] = [];
  for (const person of people) {
    const address = person.address?.trim().toLowerCase();
    if (!address || !address.includes('@') || address === own || seen.has(address)) continue;
    seen.add(address);
    out.push({ name: person.name?.trim() || address, address });
  }
  return out;
}

export function defaultReplyRecipients(thread: Thread, ownEmail?: string, targetMessage?: Message): RecipientChip[] {
  const latestIncoming = [...(thread.messages || [])].reverse().find((message) => !message.isOutgoing);
  const source = targetMessage || latestIncoming || thread.messages?.[thread.messages.length - 1];
  if (source?.from?.address) {
    return uniqueRecipients([{ name: source.from.name, address: source.from.address }], ownEmail);
  }
  return uniqueRecipients(thread.participants || [], ownEmail);
}

export function replyAllRecipients(thread: Thread, ownEmail?: string, targetMessage?: Message): RecipientChip[] {
  const latestIncoming = [...(thread.messages || [])].reverse().find((message) => !message.isOutgoing);
  const source = targetMessage || latestIncoming || thread.messages?.[thread.messages.length - 1];
  const people: RecipientChip[] = [];
  if (source?.from?.address) people.push({ name: source.from.name, address: source.from.address });
  for (const person of source?.to || []) people.push({ name: person.name, address: person.address });
  for (const raw of source?.cc || []) {
    const parsed = parseAddress(raw);
    if (parsed.address) people.push({ name: parsed.name || parsed.address, address: parsed.address });
  }
  if (!people.length) return uniqueRecipients(thread.participants || [], ownEmail);
  return uniqueRecipients(people, ownEmail);
}

export function quotedReplyMessage(thread: Thread, targetMessage?: Message) {
  return targetMessage || [...(thread.messages || [])].reverse().find((message) => !message.isOutgoing)
    || thread.messages?.[thread.messages.length - 1];
}

/** Add an address to a comma-separated field without duplicating To or Cc. */
export function appendAddress(existing: string, address: string, already: string[] = []): string {
  const lower = address.trim().toLowerCase();
  if (!lower.includes('@')) return existing;
  const taken = new Set(already.map((item) => parseAddress(item).address || item.toLowerCase()));
  if (taken.has(lower)) return existing;
  const parts = existing.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => (parseAddress(part).address || part.toLowerCase()) === lower)) return existing;
  return parts.length ? `${parts.join(', ')}, ${address.trim()}` : address.trim();
}
