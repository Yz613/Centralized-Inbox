const STORAGE_KEY = 'projectinbox_scheduled_v1';
const MAX_STORED_CHARS = 4_500_000;

export interface ScheduledAttachment {
  name: string;
  size: string;
  type: string;
  contentBase64?: string;
}

export interface ScheduledReply {
  threadId: string;
  text: string;
  html?: string;
  fromInboxId: string;
  subject?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  includeQuote?: boolean;
  attachments?: ScheduledAttachment[];
}

export interface ScheduledNewMessage {
  projectId: string;
  fromInboxId: string;
  toAddress: string;
  toName?: string;
  subject: string;
  body: string;
  html?: string;
  channel: string;
  cc?: string[];
  bcc?: string[];
  attachments?: ScheduledAttachment[];
}

export interface ScheduledMail {
  id: string;
  sendAt: string;
  kind: 'reply' | 'new';
  subject: string;
  preview: string;
  toLabel: string;
  error?: string;
  attemptAt?: string;
  reply?: ScheduledReply;
  message?: ScheduledNewMessage;
}

export interface SchedulePreset {
  id: string;
  label: string;
  detail: string;
  at: Date;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadScheduledMail(): ScheduledMail[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.sendAt) : [];
  } catch {
    return [];
  }
}

export function saveScheduledMail(items: ScheduledMail[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function enqueueScheduled(
  item: ScheduledMail,
  existing = loadScheduledMail()
): { ok: true; items: ScheduledMail[] } | { ok: false; error: string } {
  const when = new Date(item.sendAt).getTime();
  if (!Number.isFinite(when) || when < Date.now() + 45_000) {
    return { ok: false, error: 'Pick a time at least a minute from now.' };
  }
  const items = [...existing.filter((current) => current.id !== item.id), item].sort((a, b) =>
    a.sendAt.localeCompare(b.sendAt)
  );
  if (JSON.stringify(items).length > MAX_STORED_CHARS) {
    return { ok: false, error: 'This message is too large to schedule. Send it now, or remove an attachment.' };
  }
  if (!saveScheduledMail(items)) {
    return { ok: false, error: 'Could not save the scheduled message on this device.' };
  }
  return { ok: true, items };
}

export function dueScheduled(items: ScheduledMail[], now = new Date(), retryMs = 60_000): ScheduledMail[] {
  const time = now.getTime();
  return items.filter((item) => {
    const sendAt = new Date(item.sendAt).getTime();
    if (!Number.isFinite(sendAt) || sendAt > time) return false;
    if (item.attemptAt) {
      const attempted = new Date(item.attemptAt).getTime();
      if (Number.isFinite(attempted) && time - attempted < retryMs) return false;
    }
    return true;
  });
}

export function formatScheduleLabel(date: Date, now = new Date()): string {
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function atLocalTime(day: Date, hours: number, minutes = 0): Date {
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

/** Gmail's usual schedule menu: later today, tomorrow morning and afternoon, and Monday morning. */
export function schedulePresets(now = new Date()): SchedulePreset[] {
  const presets: SchedulePreset[] = [];
  const later = new Date(now);
  later.setMinutes(0, 0, 0);
  later.setHours(later.getHours() + 2);
  if (later.getTime() - now.getTime() < 30 * 60 * 1000) later.setHours(later.getHours() + 1);
  if (later.toDateString() === now.toDateString() && later.getHours() < 23) {
    presets.push({ id: 'later', label: 'Later today', detail: formatScheduleLabel(later, now), at: later });
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const morning = atLocalTime(tomorrow, 8);
  const afternoon = atLocalTime(tomorrow, 13);
  presets.push({ id: 'tomorrow-am', label: 'Tomorrow morning', detail: formatScheduleLabel(morning, now), at: morning });
  presets.push({ id: 'tomorrow-pm', label: 'Tomorrow afternoon', detail: formatScheduleLabel(afternoon, now), at: afternoon });

  const monday = new Date(now);
  const daysUntilMonday = (8 - monday.getDay()) % 7 || 7;
  monday.setDate(now.getDate() + daysUntilMonday);
  const mondayMorning = atLocalTime(monday, 8);
  if (mondayMorning.getTime() !== morning.getTime()) {
    presets.push({
      id: 'monday',
      label: 'Monday morning',
      detail: formatScheduleLabel(mondayMorning, now),
      at: mondayMorning,
    });
  }
  return presets;
}
