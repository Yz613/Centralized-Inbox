export interface SavedReply {
  id: string;
  projectId: string | 'all';
  title: string;
  body: string;
}

const SNOOZE_KEY = 'projectinbox_snooze_v1';
const REPLIES_KEY = 'projectinbox_saved_replies_v1';

type SnoozeMap = Record<string, string>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota
  }
}

export function getSnoozeMap(): SnoozeMap {
  return readJson<SnoozeMap>(SNOOZE_KEY, {});
}

export function snoozeUntil(threadId: string, untilIso: string) {
  const map = getSnoozeMap();
  map[threadId] = untilIso;
  writeJson(SNOOZE_KEY, map);
}

export function clearSnooze(threadId: string) {
  const map = getSnoozeMap();
  delete map[threadId];
  writeJson(SNOOZE_KEY, map);
}

export function getSnoozeUntil(threadId: string): string | undefined {
  return getSnoozeMap()[threadId];
}

export function isThreadSnoozed(threadId: string, now = Date.now()): boolean {
  const until = getSnoozeUntil(threadId);
  if (!until) return false;
  const ts = new Date(until).getTime();
  if (Number.isNaN(ts) || ts <= now) {
    clearSnooze(threadId);
    return false;
  }
  return true;
}

export function snoozeFor(threadId: string, ms: number) {
  snoozeUntil(threadId, new Date(Date.now() + ms).toISOString());
}

export function getSavedReplies(): SavedReply[] {
  return readJson<SavedReply[]>(REPLIES_KEY, []);
}

export function saveReplyTemplate(reply: Omit<SavedReply, 'id'> & { id?: string }): SavedReply {
  const next: SavedReply = {
    id: reply.id || `sr-${Date.now()}`,
    projectId: reply.projectId,
    title: reply.title.trim(),
    body: reply.body.trim(),
  };
  const list = getSavedReplies().filter((r) => r.id !== next.id);
  list.unshift(next);
  writeJson(REPLIES_KEY, list.slice(0, 40));
  return next;
}

export function deleteReplyTemplate(id: string) {
  writeJson(
    REPLIES_KEY,
    getSavedReplies().filter((r) => r.id !== id)
  );
}

export function repliesForProject(projectId: string | 'all'): SavedReply[] {
  return getSavedReplies().filter((r) => r.projectId === 'all' || r.projectId === projectId);
}

export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}
