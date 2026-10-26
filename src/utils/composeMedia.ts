export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;

export interface ComposeAttachment {
  name: string;
  size: string;
  type: string;
  contentBase64?: string;
  contentId?: string;
  inline?: boolean;
}

export function isImageFile(file: { type?: string; name?: string }): boolean {
  if ((file.type || '').toLowerCase().startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|avif|svg)$/i.test(file.name || '');
}

export function formatByteSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(kb))} KB`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

export function mentionChipHtml(name: string, address: string): string {
  const label = escapeHtml((name || address).replace(/[\r\n]/g, ' ').trim() || address);
  const email = escapeHtml(address.trim());
  return `<span data-mention="${email}" contenteditable="false" style="display:inline-block;background:#e8f0fe;color:#174ea6;border-radius:999px;padding:0 6px;font-weight:600;line-height:1.7;margin:0 1px;">@${label}</span>&nbsp;`;
}

export function imageEmbedHtml(dataUrl: string, name: string): string {
  const alt = escapeHtml(name || 'image');
  return `<img src="${escapeHtml(dataUrl)}" alt="${alt}" data-inline-image="true" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;" />`;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/** Shrink photos before they land in the message so a dropped image still sends. */
export async function embedImageFile(file: File): Promise<{ dataUrl: string; name: string } | null> {
  if (file.size > MAX_ATTACHMENT_BYTES) return null;
  const name = file.name || 'image';
  const type = (file.type || '').toLowerCase();
  if (type === 'image/gif' || type === 'image/svg+xml' || type === '') {
    const dataUrl = await readDataUrl(file);
    return dataUrl.startsWith('data:image/') ? { dataUrl, name } : null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const output = type === 'image/png' ? 'image/png' : 'image/jpeg';
    return { dataUrl: canvas.toDataURL(output, 0.86), name };
  } catch {
    const dataUrl = await readDataUrl(file);
    return dataUrl.startsWith('data:image/') ? { dataUrl, name } : null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function filesToAttachments(files: File[]): Promise<{ attachments: ComposeAttachment[]; errors: string[] }> {
  const attachments: ComposeAttachment[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${file.name || 'A file'} is over 20 MB.`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    attachments.push({
      name: file.name || 'attachment',
      size: formatByteSize(file.size),
      type: file.type || 'application/octet-stream',
      contentBase64: bytesToBase64(bytes),
    });
  }
  return { attachments, errors };
}

export function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const direct = Array.from(data.files || []);
  if (direct.length > 0) return direct;
  const files: File[] = [];
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/**
 * Turn editor data-URL images into CID inline parts so recipients see them in the message.
 * HTML that already uses normal or cid sources is left alone.
 */
export function liftInlineImages(
  html: string | undefined,
  files: ComposeAttachment[] = []
): { html?: string; files: ComposeAttachment[] } {
  if (!html || !/data:image\//i.test(html)) return { html, files };
  const inline: ComposeAttachment[] = [];
  let index = 0;
  const rewritten = html.replace(
    /<img\b([^>]*?)\bsrc=(["'])(data:image\/([a-zA-Z0-9.+-]+);base64,([^"']+))\2([^>]*)>/gi,
    (match, before: string, _quote: string, _dataUrl: string, subtype: string, payload: string, after: string) => {
      const contentBase64 = payload.replace(/\s+/g, '');
      if (!contentBase64) return match;
      index += 1;
      const cid = `inline${index}.${Date.now().toString(36)}@projectinbox`;
      const mime = subtype.toLowerCase() === 'jpg' ? 'jpeg' : subtype.toLowerCase();
      const nameMatch = `${before} ${after}`.match(/\balt=(["'])(.*?)\1/i);
      inline.push({
        name: nameMatch?.[2] || `image-${index}.${mime === 'jpeg' ? 'jpg' : mime.split('+')[0]}`,
        size: formatByteSize(Math.floor((contentBase64.length * 3) / 4)),
        type: `image/${mime}`,
        contentBase64,
        contentId: cid,
        inline: true,
      });
      const spaced = before.length === 0 ? ' ' : before.endsWith(' ') ? before : `${before} `;
      return `<img${spaced}src="cid:${cid}"${after}>`;
    }
  );
  if (!inline.length) return { html, files };
  return { html: rewritten, files: [...files, ...inline] };
}
