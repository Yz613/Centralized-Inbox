import type { Thread } from '../types';
import { parseAddress } from './contacts';

export interface RecipientChip {
  name: string;
  address: string;
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

export function defaultReplyRecipients(thread: Thread, ownEmail?: string): RecipientChip[] {
  const latestIncoming = [...(thread.messages || [])].reverse().find((message) => !message.isOutgoing);
  const source = latestIncoming || thread.messages?.[thread.messages.length - 1];
  if (source?.from?.address) {
    return uniqueRecipients([{ name: source.from.name, address: source.from.address }], ownEmail);
  }
  return uniqueRecipients(thread.participants || [], ownEmail);
}

export function replyAllRecipients(thread: Thread, ownEmail?: string): RecipientChip[] {
  const latestIncoming = [...(thread.messages || [])].reverse().find((message) => !message.isOutgoing);
  const source = latestIncoming || thread.messages?.[thread.messages.length - 1];
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

export function quotedReplyMessage(thread: Thread) {
  return [...(thread.messages || [])].reverse().find((message) => !message.isOutgoing)
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
