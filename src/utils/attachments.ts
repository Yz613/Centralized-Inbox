import type { Attachment } from '../types';

const imageTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
};

export function getImageMimeType(attachment: Attachment): string | null {
  const type = (attachment.type || '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('image/')) return type;
  const dataType = attachment.dataUrl?.match(/^data:(image\/[^;,]+)/i)?.[1];
  if (dataType) return dataType.toLowerCase();
  return imageTypes[attachment.name?.split('.').pop()?.toLowerCase() || ''] || null;
}

export function attachmentBlob(attachment: Attachment, contentBase64: string): Blob {
  // Gmail uses URL-safe base64; imported and composed attachments use standard base64.
  const binary = atob(contentBase64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: getImageMimeType(attachment) || attachment.type || 'application/octet-stream' });
}

export interface GmailAttachmentPart {
  mimeType: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailAttachmentPart[];
}

export function extractGmailAttachments(
  payload: GmailAttachmentPart | undefined, messageId: string, userEmail: string,
): Attachment[] {
  const attachments: Attachment[] = [];
  const walk = (part: GmailAttachmentPart) => {
    const mimeType = part.mimeType || 'application/octet-stream';
    const disposition = part.headers?.find((h) => h.name.toLowerCase() === 'content-disposition')?.value || '';
    if (part.filename || /^attachment\b/i.test(disposition) || (mimeType.startsWith('image/') && part.body)) {
      const size = part.body?.size || 0;
      attachments.push({
        name: part.filename || `attachment.${mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'bin'}`,
        size: size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`,
        type: mimeType,
        ...(part.body?.data ? { contentBase64: part.body.data } : {}),
        ...(part.body?.attachmentId ? { gmail: { messageId, attachmentId: part.body.attachmentId, userEmail } } : {}),
      });
    }
    part.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  return attachments;
}
