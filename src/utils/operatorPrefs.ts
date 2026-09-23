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

export const SAMPLE_PROJECT_IDS = ['proj-apex', 'proj-nordic', 'proj-zenith'];

export function snoozeTonightIso(): string {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function snoozeMondayIso(): string {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 1 Mon
  let add = (8 - day) % 7;
  if (add === 0 && d.getTime() <= Date.now()) add = 7;
  d.setDate(d.getDate() + add);
  return d.toISOString();
}

export interface ComposerDraft {
  text: string;
  subject?: string;
  cc?: string;
  bcc?: string;
  fromInboxId?: string;
  toAddress?: string;
  toName?: string;
  toList?: string;
}

const DRAFTS_KEY = 'projectinbox_drafts_v1';
const FOLLOWUPS_KEY = 'projectinbox_followups_v1';
const NOTIF_KEY = 'projectinbox_notifications_v1';
const SIG_KEY = 'projectinbox_signatures_v1';
const COMPOSE_DRAFT_KEY = '__compose__';

export function getDraft(threadId: string): ComposerDraft | undefined {
  return readJson<Record<string, ComposerDraft>>(DRAFTS_KEY, {})[threadId];
}

export function saveDraft(threadId: string, draft: ComposerDraft) {
  const map = readJson<Record<string, ComposerDraft>>(DRAFTS_KEY, {});
  map[threadId] = draft;
  writeJson(DRAFTS_KEY, map);
}

export function clearDraft(threadId: string) {
  const map = readJson<Record<string, ComposerDraft>>(DRAFTS_KEY, {});
  delete map[threadId];
  writeJson(DRAFTS_KEY, map);
}

export function getComposeDraft(): ComposerDraft | undefined {
  return getDraft(COMPOSE_DRAFT_KEY);
}

export function saveComposeDraft(draft: ComposerDraft) {
  saveDraft(COMPOSE_DRAFT_KEY, draft);
}

export function clearComposeDraft() {
  clearDraft(COMPOSE_DRAFT_KEY);
}

export function getInboxSignatures(): Record<string, string> {
  return readJson<Record<string, string>>(SIG_KEY, {});
}

export function setInboxSignature(inboxId: string, signature: string) {
  const map = getInboxSignatures();
  if (signature.trim()) map[inboxId] = signature.trim();
  else delete map[inboxId];
  writeJson(SIG_KEY, map);
}

export interface FollowUp {
  id: string;
  projectId: string | 'all';
  text: string;
  done: boolean;
  createdAt: string;
}

export function getFollowUps(): FollowUp[] {
  return readJson<FollowUp[]>(FOLLOWUPS_KEY, []);
}

export function addFollowUps(projectId: string | 'all', texts: string[]): FollowUp[] {
  const existing = getFollowUps();
  const known = new Set(existing.map((f) => `${f.projectId}::${f.text.toLowerCase()}`));
  const added: FollowUp[] = [];
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const key = `${projectId}::${trimmed.toLowerCase()}`;
    if (known.has(key)) continue;
    known.add(key);
    added.push({
      id: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      text: trimmed,
      done: false,
      createdAt: new Date().toISOString(),
    });
  }
  const next = [...added, ...existing].slice(0, 80);
  writeJson(FOLLOWUPS_KEY, next);
  return next;
}

export function toggleFollowUp(id: string): FollowUp[] {
  const next = getFollowUps().map((f) => (f.id === id ? { ...f, done: !f.done } : f));
  writeJson(FOLLOWUPS_KEY, next);
  return next;
}

export function deleteFollowUp(id: string): FollowUp[] {
  const next = getFollowUps().filter((f) => f.id !== id);
  writeJson(FOLLOWUPS_KEY, next);
  return next;
}

export function notificationsOptedIn(): boolean {
  const saved = readJson<{ enabled?: boolean }>(NOTIF_KEY, {}).enabled;
  if (saved !== undefined) return saved;
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function setNotificationsOptedIn(enabled: boolean) {
  writeJson(NOTIF_KEY, { enabled });
}

export function formatOutboundBody(opts: {
  text: string;
  signature?: string;
  quote?: { name: string; date: string; body: string } | null;
}): string {
  let body = opts.text.trim();
  if (opts.signature?.trim()) {
    body += `\n\n-- \n${opts.signature.trim()}`;
  }
  if (opts.quote?.body) {
    const quoted = opts.quote.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    body += `\n\nOn ${opts.quote.date}, ${opts.quote.name} wrote:\n${quoted}`;
  }
  return body;
}

export function lastMessageOutgoing(messages: { isOutgoing?: boolean }[]): boolean {
  if (!messages.length) return false;
  return Boolean(messages[messages.length - 1]?.isOutgoing);
}
