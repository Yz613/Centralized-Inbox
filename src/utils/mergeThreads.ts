import { Thread } from '../types';
import { mergeSpamState } from './spam';

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
