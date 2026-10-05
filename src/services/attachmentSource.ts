import type { Attachment } from '../types';
import { attachmentBlob } from '../utils/attachments';

export interface AttachmentSource {
  url: string;
  release: () => void;
}

export async function loadAttachmentSource(attachment: Attachment, signal?: AbortSignal): Promise<AttachmentSource> {
  signal?.throwIfAborted();
  if (attachment.dataUrl || (!attachment.contentBase64 && attachment.url)) {
    const url = attachment.dataUrl || attachment.url!;
    if (!/^(data:|blob:|https?:\/\/)/i.test(url)) throw new Error('This attachment has an invalid address.');
    return { url, release: () => {} };
  }

  let content = attachment.contentBase64;
  if (!content && attachment.gmail) {
    const { getAccessToken } = await import('./googleAuth');
    const token = await getAccessToken();
    const { userEmail, messageId, attachmentId } = attachment.gmail;
    if (!token) throw new Error(`Reconnect ${userEmail} to open this attachment.`);
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userEmail)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error(`Reconnect ${userEmail} to open this attachment.`);
      throw new Error('Could not load this attachment. Please try again.');
    }
    content = (await response.json()).data;
  }
  if (!content) throw new Error('The original file is not available in this saved email. Try syncing the mailbox again.');
  signal?.throwIfAborted();
  const url = URL.createObjectURL(attachmentBlob(attachment, content));
  return { url, release: () => URL.revokeObjectURL(url) };
}

export function downloadAttachmentSource(attachment: Attachment, url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.name || 'attachment';
  link.rel = 'noopener';
  if (/^https?:\/\//i.test(url)) link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
