import test from 'node:test';
import assert from 'node:assert/strict';
import type { Attachment } from '../src/types';
import { extractGmailAttachments, getImageMimeType } from '../src/utils/attachments';
import { loadAttachmentSource } from '../src/services/attachmentSource';

const image: Attachment = { name: 'PHOTO.JPEG', size: '3 B', type: 'application/octet-stream' };

test('image previews recognize generic MIME types, data URLs, and browser-unsupported image formats', () => {
  assert.equal(getImageMimeType(image), 'image/jpeg');
  assert.equal(getImageMimeType({ ...image, name: 'photo.heic' }), 'image/heic');
  assert.equal(getImageMimeType({ ...image, name: 'file', dataUrl: 'data:image/png;base64,AA==' }), 'image/png');
  assert.equal(getImageMimeType({ ...image, name: 'invoice.pdf' }), null);
});

test('standard and Gmail base64 preserve binary bytes, infer an image MIME type, and release preview resources', async () => {
  const bytes = new Uint8Array([0xfb, 0xff, 0xfe]);
  for (const contentBase64 of ['+//+', '-__-']) {
    const source = await loadAttachmentSource({ ...image, contentBase64 });
    const response = await fetch(source.url);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    source.release();
    await assert.rejects(fetch(source.url));
  }
});

test('missing bytes and cancelled loads never create a fake attachment or leave a preview URL', async () => {
  await assert.rejects(loadAttachmentSource(image), /original file is not available/);
  await assert.rejects(loadAttachmentSource({ ...image, url: 'javascript:alert(1)' }), /invalid address/);
  await assert.rejects(loadAttachmentSource({ ...image, contentBase64: 'AA==' }, AbortSignal.abort()), { name: 'AbortError' });
});

test('Gmail attachments survive nested MIME structure and retain the account needed for lazy loading', () => {
  const attachments = extractGmailAttachments({
    mimeType: 'multipart/mixed', parts: [
      { mimeType: 'text/plain', body: { data: 'Ym9keQ==' } },
      { mimeType: 'multipart/related', parts: [
        { mimeType: 'text/html', body: { data: 'PGI+Ym9keTwvYj4=' } },
        { mimeType: 'image/png', body: { size: 2048, attachmentId: 'inline-image' } },
      ] },
      { filename: 'photo.jpg', mimeType: 'image/jpeg', body: { size: 3, data: '-__-' } },
      { filename: 'invoice.pdf', mimeType: 'application/pdf', body: { size: 3000, attachmentId: 'pdf' } },
    ],
  }, 'message-123', 'owner@example.com');
  assert.equal(attachments.length, 3);
  assert.deepEqual(attachments[0], {
    name: 'attachment.png', type: 'image/png', size: '2.0 KB',
    gmail: { messageId: 'message-123', attachmentId: 'inline-image', userEmail: 'owner@example.com' },
  });
  assert.equal(attachments[1].contentBase64, '-__-');
  assert.equal(attachments[2].gmail?.attachmentId, 'pdf');
  assert.deepEqual(extractGmailAttachments(undefined, 'id', 'owner@example.com'), []);
});
