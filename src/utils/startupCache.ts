import type { Thread } from '../types';

// Keep recent, complete conversations within a conservative localStorage budget.
// Bounding both size and count also bounds parsing and rendering work at startup.
export const STARTUP_CACHE_MAX_THREADS = 50;
export const STARTUP_CACHE_MAX_BYTES = 2_000_000;

export function serializeStartupThreads(threads: Thread[]): string {
  const recent = [...threads].sort((a, b) =>
    Date.parse(b.lastMessageTimestamp) - Date.parse(a.lastMessageTimestamp));
  const entries: string[] = [];
  let bytes = 4; // UTF-16 storage for the surrounding brackets.
  for (const thread of recent) {
    if (entries.length === STARTUP_CACHE_MAX_THREADS) break;
    const entry = JSON.stringify(thread);
    const entryBytes = entry.length * 2 + (entries.length ? 2 : 0);
    if (bytes + entryBytes > STARTUP_CACHE_MAX_BYTES) continue;
    entries.push(entry);
    bytes += entryBytes;
  }
  return `[${entries.join(',')}]`;
}
