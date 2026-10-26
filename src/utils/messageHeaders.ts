export type AddressLike = string | { name?: string; address?: string };

function labelFor(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object') {
    const record = item as { name?: string; address?: string };
    const address = (record.address || '').trim();
    const name = (record.name || '').trim();
    if (!address) return '';
    if (name && name.toLowerCase() !== address.toLowerCase()) return `${name} <${address}>`;
    return address;
  }
  return '';
}

function emailKey(label: string): string {
  const wrapped = label.match(/<([^>]+)>/);
  const address = (wrapped ? wrapped[1] : label).trim().toLowerCase();
  return address.includes('@') ? address : '';
}

/** Unique display labels for a Cc or Bcc list stored as strings or address objects. */
export function formatAddressList(value: unknown): string[] {
  if (value == null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const label = labelFor(item);
    const key = emailKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** One-line recipient summary. Cc is visible here; Bcc stays in the header details. */
export function audienceLabel(toName: string, cc: unknown): string {
  const copies = formatAddressList(cc);
  if (!copies.length) return `to ${toName}`;
  return `to ${toName}, cc ${copies.join(', ')}`;
}
