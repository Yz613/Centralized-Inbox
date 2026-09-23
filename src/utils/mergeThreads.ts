import { Message, Thread } from '../types';
import { mergeSpamState } from './spam';

export type CrossInboxThread = Thread & { memberIds: string[] };

function normalizeMessageId(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase();
  const wrapped = trimmed.match(/<[^>]+>/);
  return wrapped ? wrapped[0] : trimmed;
}

function threadMessageKeys(thread: Thread): string[] {
  const keys = new Set<string>();
  for (const message of thread.messages || []) {
    const messageId = normalizeMessageId(message.messageId);
    const inReplyTo = normalizeMessageId(message.inReplyTo);
    if (messageId) keys.add(messageId);
    if (inReplyTo) keys.add(inReplyTo);
  }
  return [...keys];
}

function dedupedMessages(group: Thread[]): Message[] {
  const byKey = new Map<string, Message>();
  for (const thread of group) {
    for (const message of thread.messages || []) {
      const key = normalizeMessageId(message.messageId) || message.id;
      const previous = byKey.get(key);
      if (!previous || (message.bodyText || '').length > (previous.bodyText || '').length) byKey.set(key, message);
    }
  }
  return [...byKey.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
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
    map.set(thread.id, thread);
  }

  for (const next of incoming) {
    const prev = map.get(next.id);
    if (!prev) {
      map.set(next.id, next);
      continue;
    }

    const prevTs = new Date(prev.lastMessageTimestamp).getTime();
    const nextTs = new Date(next.lastMessageTimestamp).getTime();
    const newer = nextTs >= prevTs ? next : prev;
    const older = newer === next ? prev : next;
    const messageMap = new Map([...older.messages, ...newer.messages].map(message => [message.id, message]));
    const richerMessages = Array.from(messageMap.values()).sort((a,b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const newIncoming = next.messages.some(message => !message.isOutgoing && !prev.messages.some(old => old.id === message.id));

    map.set(next.id, {
      ...newer,
      ...mergeSpamState(prev, next),
      messages: richerMessages || newer.messages,
      messageCount: Math.max(newer.messageCount, older.messageCount, richerMessages?.length || 0),
      isStarred: prev.isStarred || next.isStarred,
      isArchived: newIncoming && nextTs >= prevTs ? false : newer.isArchived,
      tags: Array.from(new Set([...(prev.tags || []), ...(next.tags || [])])),
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
  );
}
