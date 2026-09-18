import { Thread } from '../types';

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
    const richerMessages =
      (older.messages?.length || 0) > (newer.messages?.length || 0) ? older.messages : newer.messages;

    map.set(next.id, {
      ...newer,
      messages: richerMessages || newer.messages,
      messageCount: Math.max(newer.messageCount, older.messageCount, richerMessages?.length || 0),
      isStarred: prev.isStarred || next.isStarred,
      isArchived: prev.isArchived || next.isArchived,
      tags: Array.from(new Set([...(prev.tags || []), ...(next.tags || [])])),
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
  );
}
