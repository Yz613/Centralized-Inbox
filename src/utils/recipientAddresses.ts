/** Split recipient fields without splitting commas inside quoted names or angle addresses. */
export function recipientInputSegments(raw: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  let angle = false;
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted) {
      if (char === '<') angle = true;
      if (char === '>') angle = false;
      if (!angle && /[,;\r\n]/.test(char)) {
        segments.push(raw.slice(start, index).trim());
        start = index + 1;
      }
    }
  }
  segments.push(raw.slice(start).trim());
  return segments;
}

export function splitRecipientAddresses(raw: string): string[] {
  return recipientInputSegments(raw).filter(Boolean);
}
