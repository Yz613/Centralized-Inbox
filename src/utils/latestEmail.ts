import { Thread, Message } from '../types';
import { getSpamStatus } from './spam';

/**
 * Returns the latest eligible thread from a list of threads based on chronological timestamp.
 * Skips archived threads and suspected spam by default unless specified.
 */
export function getLatestEligibleThread(
  threads: Thread[],
  options?: { includeArchived?: boolean; includeSpam?: boolean }
): Thread | null {
  if (!threads || threads.length === 0) return null;

  const eligible = threads.filter((t) => {
    if (!options?.includeArchived && t.isArchived) return false;
    if (!options?.includeSpam && getSpamStatus(t) === 'suspected') return false;
    return true;
  });

  if (eligible.length === 0) {
    // If all threads are archived or spam, fall back to the newest thread
    return threads.slice().sort(
      (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
    )[0];
  }

  return eligible.slice().sort(
    (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
  )[0];
}

/**
 * Returns the latest message in a thread.
 */
export function getLatestMessage(thread: Thread): Message | null {
  if (!thread || !thread.messages || thread.messages.length === 0) return null;
  return thread.messages[thread.messages.length - 1];
}
