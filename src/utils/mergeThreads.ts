import { Message, Thread } from '../types';
import { mergeSpamState } from './spam';

export type CrossInboxThread = Thread & { memberIds: string[] };

export function normalizeMessageId(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase();
  const wrapped = trimmed.match(/<[^>]+>/);
  return wrapped ? wrapped[0] : trimmed;
}

function cleanBodyText(text?: string, html?: string): string {
  if (text && text.trim()) {
    return text.trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ').slice(0, 300);
  }
  if (html && html.trim()) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  return '';
}

/** Check if two messages are duplicate copies of the exact same email */
export function areMessagesDuplicate(a: Message, b: Message): boolean {
  if (a.id === b.id) return true;

  // 1. Matching RFC 822 Message-ID
  const aMsgId = normalizeMessageId(a.messageId);
  const bMsgId = normalizeMessageId(b.messageId);
  if (aMsgId && bMsgId && aMsgId === bMsgId) return true;

  // Distinct genuine RFC Message-IDs mean distinct emails (unless synthetic/client ids)
  const aHasRealRfc = aMsgId.includes('@') && !a.id.startsWith('msg-pending-') && !a.id.startsWith('msg-out-');
  const bHasRealRfc = bMsgId.includes('@') && !b.id.startsWith('msg-pending-') && !b.id.startsWith('msg-out-');
  if (aHasRealRfc && bHasRealRfc && aMsgId !== bMsgId) {
    return false;
  }

  const aBody = cleanBodyText(a.bodyText, a.bodyHtml);
  const bBody = cleanBodyText(b.bodyText, b.bodyHtml);

  // 2. Both are outgoing (e.g. optimistic pending send vs synced sent folder copy)
  if (a.isOutgoing && b.isOutgoing) {
    if (aBody && bBody && aBody === bBody) {
      const aTime = Date.parse(a.timestamp);
      const bTime = Date.parse(b.timestamp);
      if (!isNaN(aTime) && !isNaN(bTime) && Math.abs(aTime - bTime) <= 10 * 60 * 1000) {
        return true;
      }
      if (!a.timestamp || !b.timestamp) return true;
    }
  }

  // 3. From same sender with identical body within proximity (including cross-inbox deliver/forward)
  const aSender = (a.from?.address || a.from?.name || '').toLowerCase().trim();
  const bSender = (b.from?.address || b.from?.name || '').toLowerCase().trim();
  const sendersMatch = (aSender && bSender && aSender === bSender) ||
    (a.from?.address && b.from?.address && a.from.address.toLowerCase().trim() === b.from.address.toLowerCase().trim());

  if (sendersMatch) {
    if (aBody && bBody && aBody === bBody) {
      const aTime = Date.parse(a.timestamp);
      const bTime = Date.parse(b.timestamp);
      if (!isNaN(aTime) && !isNaN(bTime) && Math.abs(aTime - bTime) <= 10 * 60 * 1000) {
        return true;
      }
      if (!a.timestamp || !b.timestamp) return true;
    }
  }

  // 4. Same subject + body + timestamp within 5 minutes even if sender representation slightly differs
  const aSubj = (a.subject || '').trim().toLowerCase();
  const bSubj = (b.subject || '').trim().toLowerCase();
  if (aSubj && bSubj && aSubj === bSubj && aBody && bBody && aBody === bBody) {
    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    if (!isNaN(aTime) && !isNaN(bTime) && Math.abs(aTime - bTime) <= 5 * 60 * 1000) {
      return true;
    }
  }

  return false;
}

export function mergeDuplicateMessages(a: Message, b: Message): Message {
  const aIsPending = a.id.startsWith('msg-pending-');
  const bIsPending = b.id.startsWith('msg-pending-');
  if (aIsPending && !bIsPending) return mergeDuplicateMessages(b, a);

  const hasRealMsgId = Boolean(normalizeMessageId(a.messageId)) || !normalizeMessageId(b.messageId);
  const preferred = hasRealMsgId ? a : b;
  const secondary = hasRealMsgId ? b : a;

  const preferredHasFullTo = preferred.to?.some((t) => t.address && t.address.includes('@'));
  const secondaryHasFullTo = secondary.to?.some((t) => t.address && t.address.includes('@'));
  const to = (!preferredHasFullTo && secondaryHasFullTo) ? secondary.to : preferred.to;

  return {
    ...secondary,
    ...preferred,
    to: to || preferred.to,
    bodyHtml: preferred.bodyHtml || secondary.bodyHtml,
    bodyText: (preferred.bodyText || '').length >= (secondary.bodyText || '').length
      ? preferred.bodyText
      : secondary.bodyText,
    messageId: preferred.messageId || secondary.messageId,
    inReplyTo: preferred.inReplyTo || secondary.inReplyTo,
    references: preferred.references?.length ? preferred.references : secondary.references,
    attachments: preferred.attachments?.length ? preferred.attachments : secondary.attachments,
  };
}

export function deduplicateMessages(messages: Message[]): Message[] {
  if (!messages || messages.length <= 1) return messages || [];

  const result: Message[] = [];
  for (const message of messages) {
    const existingIndex = result.findIndex((existing) => areMessagesDuplicate(existing, message));
    if (existingIndex >= 0) {
      result[existingIndex] = mergeDuplicateMessages(result[existingIndex], message);
    } else {
      result.push(message);
    }
  }

  return result.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function messageFingerprint(m: Message): string {
  const msgId = normalizeMessageId(m.messageId);
  if (msgId) return msgId;
  const from = (m.from?.address || '').toLowerCase().trim();
  const body = (m.bodyText || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const time = m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 16) : '';
  if (from && body && time) {
    return `fp:${from}:${time}:${body}`;
  }
  return '';
}

function threadMessageKeys(thread: Thread): string[] {
  const keys = new Set<string>();
  for (const message of thread.messages || []) {
    const messageId = normalizeMessageId(message.messageId);
    const inReplyTo = normalizeMessageId(message.inReplyTo);
    if (messageId) keys.add(messageId);
    if (inReplyTo) keys.add(inReplyTo);
    const fp = messageFingerprint(message);
    if (fp) keys.add(fp);
  }
  return [...keys];
}

export function dedupedMessages(group: Thread[]): Message[] {
  const allMessages = group.flatMap((thread) => thread.messages || []);
  return deduplicateMessages(allMessages);
}

/** One row when the same message was delivered to more than one connected inbox. */
export function collapseCrossInboxDuplicates(threads: Thread[]): CrossInboxThread[] {
  const parent = threads.map((_, index) => index);
  const find = (index: number): number => {
    let cursor = index;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]];
      cursor = parent[cursor];
    }
    return cursor;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[a] = b;
  };
  const owner = new Map<string, number>();
  threads.forEach((thread, index) => {
    for (const key of threadMessageKeys(thread)) {
      const previous = owner.get(key);
      if (previous === undefined) owner.set(key, index);
      else union(previous, index);
    }
  });
  const groups = new Map<number, Thread[]>();
  threads.forEach((thread, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(thread);
    groups.set(root, group);
  });
  return [...groups.values()].map((group) => {
    const primary = [...group].sort((a, b) => {
      const byTime = Date.parse(b.lastMessageTimestamp) - Date.parse(a.lastMessageTimestamp);
      if (byTime) return byTime;
      return a.id < b.id ? -1 : 1;
    })[0];
    const messages = dedupedMessages(group);
    const participants = [];
    const seenAddresses = new Set<string>();
    for (const thread of group) {
      for (const person of thread.participants || []) {
        const address = (person.address || person.name || '').toLowerCase();
        if (!address || seenAddresses.has(address)) continue;
        seenAddresses.add(address);
        participants.push(person);
      }
    }
    let spam = {
      spamStatus: primary.spamStatus,
      spamReason: primary.spamReason,
      spamReviewedAt: primary.spamReviewedAt,
    };
    for (const thread of group) {
      if (thread !== primary) spam = { ...spam, ...mergeSpamState(spam, thread) };
    }
    const newest = messages[messages.length - 1];
    return {
      ...primary,
      ...spam,
      participants: participants.length ? participants : primary.participants,
      messages,
      tags: [...new Set(group.flatMap((thread) => thread.tags || []))],
      isRead: group.every((thread) => thread.isRead),
      isStarred: group.some((thread) => thread.isStarred),
      isArchived: group.every((thread) => thread.isArchived),
      snippet: newest?.bodyText?.replace(/\s+/g, ' ').trim().slice(0, 140) || primary.snippet,
      lastMessageTimestamp: group.reduce((latest, thread) => thread.lastMessageTimestamp > latest ? thread.lastMessageTimestamp : latest, primary.lastMessageTimestamp),
      messageCount: messages.length,
      memberIds: group.map((thread) => thread.id),
    };
  });
}

export function crossInboxMemberIds(threads: Thread[], threadId: string): string[] {
  const match = collapseCrossInboxDuplicates(threads).find((thread) => thread.memberIds.includes(threadId));
  return match?.memberIds || [threadId];
}

/** A conversation belongs to a mailbox when the thread or any message was filed there. */
export function threadInMailbox(thread: Pick<Thread, 'inboxId' | 'messages'>, inboxId: string): boolean {
  if (thread.inboxId === inboxId) return true;
  return thread.messages.some((message) => message.inboxId === inboxId);
}

/** Merge two thread lists by id without dropping either D1 or Gmail mail. */
export function mergeThreadLists(existing: Thread[], incoming: Thread[]): Thread[] {
  const map = new Map<string, Thread>();

  for (const thread of existing) {
    const dedupedMsgs = deduplicateMessages(thread.messages || []);
    map.set(thread.id, {
      ...thread,
      messages: dedupedMsgs,
      messageCount: dedupedMsgs.length,
    });
  }

  for (const next of incoming) {
    const prev = map.get(next.id);
    if (!prev) {
      const dedupedMsgs = deduplicateMessages(next.messages || []);
      map.set(next.id, {
        ...next,
        messages: dedupedMsgs,
        messageCount: dedupedMsgs.length,
      });
      continue;
    }

    const prevTs = new Date(prev.lastMessageTimestamp).getTime();
    const nextTs = new Date(next.lastMessageTimestamp).getTime();
    const newer = nextTs >= prevTs ? next : prev;
    const older = newer === next ? prev : next;
    const richerMessages = deduplicateMessages([...older.messages, ...newer.messages]);
    const newIncoming = next.messages.some(message => !message.isOutgoing && !prev.messages.some(old => areMessagesDuplicate(old, message)));

    map.set(next.id, {
      ...newer,
      ...mergeSpamState(prev, next),
      messages: richerMessages,
      messageCount: richerMessages.length,
      isStarred: prev.isStarred || next.isStarred,
      isArchived: newIncoming && nextTs >= prevTs ? false : newer.isArchived,
      tags: Array.from(new Set([...(prev.tags || []), ...(next.tags || [])])),
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
  );
}
