import test from 'node:test';
import assert from 'node:assert/strict';
import { imageEmbedHtml, isImageFile, liftInlineImages, mentionChipHtml } from '../src/utils/composeMedia';
import { buildGmailMime } from '../src/services/gmailApi';

test('inline images become cid parts and survive a file attachment', () => {
  const html = imageEmbedHtml('data:image/png;base64,aGVsbG8=', 'Board <shot>');
  assert.match(html, /alt="Board &lt;shot&gt;"/);
  const lifted = liftInlineImages(html, [{
    name: 'notes.pdf',
    size: '1 KB',
    type: 'application/pdf',
    contentBase64: 'Zg==',
  }]);
  assert.match(lifted.html || '', /src="cid:inline1\./);
  assert.equal(lifted.files.length, 2);
  assert.equal(lifted.files[1].inline, true);
  assert.equal(lifted.files[1].contentBase64, 'aGVsbG8=');
  assert.equal(lifted.files[1].type, 'image/png');

  const raw = buildGmailMime({
    toAddress: 'ada@example.com',
    subject: 'Photo',
    bodyText: 'See attached',
    html: lifted.html,
    attachments: lifted.files,
  });
  assert.match(raw, /multipart\/related/);
  assert.match(raw, /multipart\/mixed/);
  assert.match(raw, /Content-Disposition: inline/);
  assert.match(raw, /Content-ID: <inline1\./);
  assert.match(raw, /Content-Disposition: attachment; filename="notes.pdf"/);
});

test('mention chips escape names and image files are recognized', () => {
  assert.match(mentionChipHtml('Sam "A"', 'sam@example.com'), /data-mention="sam@example.com"/);
  assert.match(mentionChipHtml('Sam "A"', 'sam@example.com'), /@Sam &quot;A&quot;/);
  assert.equal(isImageFile({ name: 'photo.PNG', type: '' }), true);
  assert.equal(isImageFile({ name: 'notes.pdf', type: 'application/pdf' }), false);
  assert.equal(liftInlineImages('<p>Hello</p>').html, '<p>Hello</p>');
});
