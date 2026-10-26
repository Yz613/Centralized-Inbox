const UL_STYLE = 'margin:0.4em 0 0.4em 1.25em;padding:0 0 0 0.35em;list-style:disc outside;';
const OL_STYLE = 'margin:0.4em 0 0.4em 1.25em;padding:0 0 0 0.35em;list-style:decimal outside;';
const LI_STYLE = 'display:list-item;margin:0.15em 0;';
const QUOTE_STYLE = 'margin:0.6em 0;padding-left:0.8em;border-left:3px solid #dadce0;color:#444746;';
const LINK_STYLE = 'color:#0b57d0;text-decoration:underline;';

function ensureStyle(html: string, tag: string, style: string): string {
  return html.replace(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'), (_match, attrs: string) => {
    if (attrs.includes(style)) return `<${tag}${attrs}>`;
    if (/style\s*=/i.test(attrs)) {
      const next = attrs.replace(
        /style\s*=\s*(["'])([\s\S]*?)\1/i,
        (_all, quote: string, css: string) => `style=${quote}${css.replace(/;?\s*$/, ';')}${style}${quote}`
      );
      return `<${tag}${next}>`;
    }
    return `<${tag}${attrs} style="${style}">`;
  });
}

/** Inline styles so lists, quotes, and links survive email clients and Tailwind's reset. */
export function styleEmailHtml(html: string): string {
  if (!html) return '';
  let next = html;
  next = ensureStyle(next, 'ul', UL_STYLE);
  next = ensureStyle(next, 'ol', OL_STYLE);
  next = ensureStyle(next, 'li', LI_STYLE);
  next = ensureStyle(next, 'blockquote', QUOTE_STYLE);
  next = ensureStyle(next, 'a', LINK_STYLE);
  return next;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Plain-text version that keeps bullets and numbers from the rich message. */
export function plainTextFromHtml(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
    let index = 0;
    return `\n${inner.replace(/<li\b[^>]*>/gi, () => `\n${++index}. `).replace(/<\/li>/gi, '')}\n`;
  });
  text = text.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner: string) => {
    return `\n${inner.replace(/<li\b[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')}\n`;
  });
  text = text.replace(/<li\b[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|blockquote|tr|table)>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
