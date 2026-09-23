import assert from 'node:assert/strict';
import test from 'node:test';
import type { Message, Thread } from '../src/types';
import { createLocalEmailRequest } from '../src/utils/localEmailAI';

function fixture(bodyText: string, bodyHtml?: string): { thread: Thread; message: Message } {
  const message = {
    id: 'message-1',
    threadId: 'thread-1',
    inboxId: 'inbox-1',
    projectId: 'project-1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Alice', address: 'alice@example.com' },
    to: [{ name: 'Bob', address: 'bob@example.com' }],
    subject: 'Meeting notes',
    bodyText,
    bodyHtml,
    timestamp: '2026-09-23T12:00:00Z',
    isOutgoing: false,
    attachments: [{ name: 'private.pdf', size: '1 MB', type: 'application/pdf', contentBase64: 'sensitive-attachment-bytes' }],
  } satisfies Message;
  const thread = {
    id: 'thread-1', projectId: 'project-1', inboxId: 'inbox-1', channel: 'gmail', inboxRole: 'general',
    subject: 'Meeting notes', snippet: bodyText, participants: [], lastMessageTimestamp: message.timestamp,
    messageCount: 1, isRead: true, isStarred: false, isArchived: false, tags: [], messages: [message],
  } satisfies Thread;
  return { thread, message };
}

test('local email request includes text and excludes HTML and attachment data', () => {
  const { thread, message } = fixture('Please review the notes.', '<img src="https://tracker.example/pixel">');
  const { request, wasTruncated } = createLocalEmailRequest(thread, 'summarize', message);
  const input = JSON.stringify(request.input);
  assert.equal(request.localOnly, true);
  assert.equal(wasTruncated, false);
  assert.match(input, /Please review the notes/);
  assert.doesNotMatch(input, /tracker\.example|sensitive-attachment-bytes|private\.pdf/);
});

test('HTML-only email is converted to plain text without script content', () => {
  const { thread, message } = fixture('', '<p>Hello &amp; welcome</p><script>SECRET_SCRIPT</script><div>Reply by Friday</div>');
  const { request } = createLocalEmailRequest(thread, 'analyze', message);
  const input = JSON.stringify(request.input);
  assert.match(input, /Hello & welcome/);
  assert.match(input, /Reply by Friday/);
  assert.doesNotMatch(input, /SECRET_SCRIPT|<p>/);
});

test('long conversation keeps recent content and marks the result as partial', () => {
  const { thread } = fixture(`${'old '.repeat(2_000)}Recent question: can you reply?`);
  const { request, wasTruncated } = createLocalEmailRequest(thread, 'action_items');
  assert.equal(wasTruncated, true);
  const input = JSON.stringify(request.input);
  assert.match(input, /Recent question: can you reply\?/);
  assert.match(input, /Earlier content omitted/);
  assert.ok(input.length < 7_500);
});
