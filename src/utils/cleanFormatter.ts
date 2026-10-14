/**
 * Intelligent clean formatter for email bodies and responses.
 * Formats blobs of text cleanly:
 * - Converts lists/enumerations into proper HTML lists (<ul>/<ol>)
 * - Adds tasteful <b> for key deadlines, dates, metrics, action items
 * - Adds <u> for critical notices and crucial requirements
 * - Skips lines between every 1-2 sentences for airy, effortless readability
 */

export interface CleanFormatResult {
  html: string;
  plainText: string;
  summary: string;
  hasLists: boolean;
  hasBold: boolean;
  hasUnderline: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const GREETING_REGEX = /^(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening))\b[^\n,.]*[,.!]/i;
const SIGNOFF_REGEX = /^(?:best|best\s+regards|regards|sincerely|thanks|thank\s+you|cheers|yours|warm\s+regards)[,!.]?$/i;

/**
 * Detects if a line looks like an explicit list item:
 * 1. item, 1) item, (1) item, - item, * item, • item
 */
function parseListItem(line: string): { type: 'ol' | 'ul'; content: string } | null {
  const trimmed = line.trim();
  const olMatch = trimmed.match(/^(?:(?:\d+|[a-zA-Z])[.)]|(?:\(\d+\)))\s+(.+)$/);
  if (olMatch) {
    return { type: 'ol', content: olMatch[1].trim() };
  }
  const ulMatch = trimmed.match(/^[-*•–—]\s+(.+)$/);
  if (ulMatch) {
    return { type: 'ul', content: ulMatch[1].trim() };
  }
  return null;
}

/**
 * Checks if a sentence introduces a list
 */
function isListIntro(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith(':')) return true;
  return /\b(?:here\s+(?:is|are)(?:\s+the)?|the\s+following|we\s+need\s+to|tasks?|deliverables?|action\s+items?|checklist|steps?|items?|requirements?)\s*:\s*$/i.test(trimmed);
}

/**
 * Checks if a string contains comma/semicolon-separated items that should become a list
 */
function tryExtractInlineList(text: string): { intro: string; items: string[] } | null {
  const colonIndex = text.indexOf(':');
  if (colonIndex > 0 && colonIndex < text.length - 10) {
    const intro = text.slice(0, colonIndex + 1).trim();
    const rest = text.slice(colonIndex + 1).trim();
    if (isListIntro(intro)) {
      // Split on comma, semicolon, or "and"
      const rawItems = rest
        .split(/(?:;|,|\band\s+also\b|\balso\b|\band\b)/i)
        .map((s) => s.trim().replace(/^\s*[-*•]\s*/, '').replace(/\.+$/, ''))
        .filter((s) => s.length > 2);
      if (rawItems.length >= 2) {
        return { intro, items: rawItems };
      }
    }
  }

  // Also check "First ..., Second ..., Third ..." or "1. ..., 2. ..., 3. ..." in a single line
  const numberedInline = text
    .split(/(?:(?:\d+\.|\d+\)|\([0-9]+\))\s+)/)
    .map((s) => s.trim().replace(/\.+$/, ''))
    .filter(Boolean);
  if (numberedInline.length >= 2 && text.match(/\b\d+[.)]/)) {
    return { intro: '', items: numberedInline };
  }

  return null;
}

/**
 * Applies bold and underline emphasis to text.
 * Bold: Deadlines, dates, times, amounts, lead-ins, key metrics.
 * Underline: Critical cautions, warnings, requirements.
 */
export function applyEmphasis(html: string): string {
  // Avoid replacing inside existing HTML tags by splitting by tags
  const parts = html.split(/(<[^>]+>)/g);

  return parts
    .map((part) => {
      if (part.startsWith('<')) return part;

      let res = part;

      // 1. Critical requirements -> Underline
      res = res.replace(
        /\b(please\s+note|make\s+sure(?:\s+to|\s+not\s+to)?|must\s+be(?:\s+[a-z]+)?|do\s+not\b[^\n,.]*|critical(?::|\b)|urgent(?::|\b)|strictly\s+required|important\s+reminder)\b/gi,
        '<u>$1</u>'
      );

      // 2. Deadlines, dates, times, and day references (including "by Friday at 5pm") -> Bold
      res = res.replace(
        /\b((?:by|before|until|due(?:\s+on)?|deadline(?:\s+is)?)\s+)?\b((?:(?:this|next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|eod|cob)(?:\s+(?:morning|afternoon|evening|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|by\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?)\b/gi,
        (match, prefix, date) => `${prefix ? `<b>${prefix}` : '<b>'}${date}</b>`
      );

      // Specific times: 5pm, 10:30 AM, 2:00 PM (if not already captured in <b>)
      res = res.replace(
        /(?<!<b>[^\b]*)\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi,
        '<b>$1</b>'
      );

      // Calendar dates: Oct 24, October 24th, 2026
      res = res.replace(
        /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?)\b/gi,
        '<b>$1</b>'
      );

      // Dollar amounts & percentages: $5,000, $12.50, 45%
      res = res.replace(
        /(\$[\d,]+(?:\.\d{2})?(?:\s*(?:k|m|b|million|billion|thousand))?)\b/gi,
        '<b>$1</b>'
      );
      res = res.replace(
        /\b(\d+(?:\.\d+)?%)(?!\w)/gi,
        '<b>$1</b>'
      );

      // Key headings / lead-ins at the beginning of phrases or bullet points (e.g. "Action item:", "Next steps:")
      res = res.replace(
        /(^|<li>\s*|\.\s+)([A-Z][A-Za-z0-9\s]{1,22}):\s+/g,
        '$1<b>$2:</b> '
      );

      // Clean up any double bold tags <b><b>...</b></b>
      res = res.replace(/<b>\s*<b>/gi, '<b>').replace(/<\/b>\s*<\/b>/gi, '</b>');
      res = res.replace(/<u>\s*<u>/gi, '<u>').replace(/<\/u>\s*<\/u>/gi, '</u>');

      return res;
    })
    .join('');
}

/**
 * Splits plain text into sentences, respecting abbreviations and numbers.
 */
function splitIntoSentences(text: string): string[] {
  // Replace common abbreviations with temporary placeholders
  const protectedText = text
    .replace(/\b(?:e\.g\.|i\.e\.|etc\.|vs\.|dr\.|mr\.|mrs\.|ms\.)/gi, (m) => m.replace(/\./g, '__DOT__'))
    .replace(/(\d+)\.(\d+)/g, '$1__DOT__$2');

  const rawSentences = protectedText.split(/(?<=[.?!])\s+(?=[A-Z0-9"'])/);

  return rawSentences
    .map((s) => s.replace(/__DOT__/g, '.').trim())
    .filter(Boolean);
}

/**
 * Formats a block of text into airy, easy-to-read paragraphs
 * skipping a line between every 1-2 sentences.
 */
function formatSentencesToParagraphs(text: string): string[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];
  if (sentences.length <= 2) {
    return [sentences.join(' ')];
  }

  const paragraphs: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i]);
    // Group every 2 sentences into a paragraph, or 1 if it's a short punchy sentence or list intro
    if (current.length === 2 || isListIntro(sentences[i]) || i === sentences.length - 1) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }

  if (current.length > 0) {
    paragraphs.push(current.join(' '));
  }

  return paragraphs;
}

/**
 * Main cleanFormatText implementation:
 * Takes raw text, parses greetings, lists, sign-offs, and sentence chunks,
 * structures into HTML with inline email-safe styling, and applies emphasis.
 */
export function cleanFormatText(rawText: string): CleanFormatResult {
  if (!rawText || !rawText.trim()) {
    return {
      html: '',
      plainText: '',
      summary: 'Empty text',
      hasLists: false,
      hasBold: false,
      hasUnderline: false,
    };
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const htmlSections: string[] = [];
  let totalListItems = 0;
  let hasLists = false;

  let currentList: { type: 'ol' | 'ul'; items: string[] } | null = null;

  const flushList = () => {
    if (!currentList || currentList.items.length === 0) return;
    hasLists = true;
    totalListItems += currentList.items.length;
    const tag = currentList.type;
    const listStyle = tag === 'ol' ? 'list-style-type: decimal;' : 'list-style-type: disc;';
    const listHtml = [
      `<${tag} style="${listStyle} margin: 12px 0; padding-left: 24px; line-height: 1.6;">`,
      ...currentList.items.map((it) => `  <li style="margin-bottom: 6px;">${escapeHtml(it)}</li>`),
      `</${tag}>`,
    ].join('\n');
    htmlSections.push(listHtml);
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Check if line is a list item
    const listItem = parseListItem(line);
    if (listItem) {
      if (currentList && currentList.type !== listItem.type) {
        flushList();
      }
      if (!currentList) {
        currentList = { type: listItem.type, items: [] };
      }
      currentList.items.push(listItem.content);
      continue;
    }

    // Not a list item -> flush any open list
    flushList();

    // 2. Check if greeting
    if (i === 0 && GREETING_REGEX.test(line)) {
      htmlSections.push(`<p style="margin-bottom: 14px; line-height: 1.6;">${escapeHtml(line)}</p>`);
      continue;
    }

    // 3. Check if sign-off
    if (SIGNOFF_REGEX.test(line) || (i >= lines.length - 2 && SIGNOFF_REGEX.test(lines[i]))) {
      const remaining = lines.slice(i).map(escapeHtml).join('<br>');
      htmlSections.push(`<p style="margin-top: 18px; margin-bottom: 10px; line-height: 1.6;">${remaining}</p>`);
      break;
    }

    // 4. Check if inline list inside sentence
    const inlineList = tryExtractInlineList(line);
    if (inlineList && inlineList.items.length >= 2) {
      if (inlineList.intro) {
        htmlSections.push(`<p style="margin-bottom: 10px; line-height: 1.6;">${escapeHtml(inlineList.intro)}</p>`);
      }
      const listStyle = 'list-style-type: disc;';
      const listHtml = [
        `<ul style="${listStyle} margin: 12px 0; padding-left: 24px; line-height: 1.6;">`,
        ...inlineList.items.map((it) => `  <li style="margin-bottom: 6px;">${escapeHtml(it)}</li>`),
        `</ul>`,
      ].join('\n');
      htmlSections.push(listHtml);
      hasLists = true;
      totalListItems += inlineList.items.length;
      continue;
    }

    // 5. Standard paragraph: Break into 1-2 sentence airy paragraphs
    const paragraphs = formatSentencesToParagraphs(line);
    for (const p of paragraphs) {
      htmlSections.push(`<p style="margin-bottom: 14px; line-height: 1.6;">${escapeHtml(p)}</p>`);
    }
  }

  flushList();

  // Apply bold and underline formatting to the assembled HTML
  const rawFormattedHtml = htmlSections.join('\n');
  const emphasizedHtml = applyEmphasis(rawFormattedHtml);

  const hasBold = emphasizedHtml.includes('<b>');
  const hasUnderline = emphasizedHtml.includes('<u>');

  // Generate plain text representation
  const plainText = emphasizedHtml
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(p|ul|ol)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  // Summary note
  const summaryParts: string[] = [];
  if (hasLists) summaryParts.push(`formatted ${totalListItems} list items`);
  if (hasBold) summaryParts.push('emphasized key dates & actions');
  if (hasUnderline) summaryParts.push('underlined critical requirements');
  summaryParts.push('spaced paragraphs for easy reading');

  const summary = `Cleaned up text: ${summaryParts.join(', ')}.`;

  return {
    html: emphasizedHtml,
    plainText,
    summary,
    hasLists,
    hasBold,
    hasUnderline,
  };
}
