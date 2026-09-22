import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEmailHtml } from '../src/utils/trackerBlocking';
import { classifyThreadStream } from '../src/utils/streamClassification';
import type { Thread } from '../src/types';

test('Tracker Blocking: strips 1x1 tracking images and known tracker URLs', () => {
  const dirtyHtml = `
    <div>
      <p>Hello world, here is our newsletter!</p>
      <img src="https://example.com/banner.jpg" width="600" height="200" alt="Banner" />
      <img src="https://superhuman.com/api/tracking/pixel.png" width="1" height="1" />
      <img src="https://t.yesware.com/t/12345/pixel.gif" style="display:none;" />
      <img src="https://mandrillapp.com/track/open.php?u=123" />
      <p>Footer content</p>
    </div>
  `;

  const result = sanitizeEmailHtml(dirtyHtml);

  assert.equal(result.blockedCount, 3);
  assert.ok(result.cleanHtml.includes('https://example.com/banner.jpg'));
  assert.ok(!result.cleanHtml.includes('superhuman.com/api/tracking'));
  assert.ok(!result.cleanHtml.includes('t.yesware.com'));
  assert.ok(!result.cleanHtml.includes('mandrillapp.com/track'));
  assert.ok(result.detectedTrackers.includes('Superhuman Read Receipt'));
  assert.ok(result.detectedTrackers.includes('Yesware'));
  assert.ok(result.detectedTrackers.includes('Mandrill / Mailchimp'));
});

test('Tracker Blocking: leaves clean email HTML untouched', () => {
  const cleanHtml = `
    <div>
      <h1>Clean Email</h1>
      <p>No tracking here!</p>
      <img src="https://example.com/logo.png" width="200" height="50" alt="Logo" />
    </div>
  `;

  const result = sanitizeEmailHtml(cleanHtml);
  assert.equal(result.blockedCount, 0);
  assert.equal(result.detectedTrackers.length, 0);
  assert.equal(result.cleanHtml, cleanHtml);
});

test('Stream Classification: auto-classifies Feed, Paper Trail, and Primary', () => {
  const newsletterThread: Thread = {
    id: 't-1',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Morning Brew Daily: Markets hit all time highs',
    snippet: 'Here is your daily market recap...',
    participants: [{ name: 'Morning Brew', address: 'crew@morningbrew.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  const receiptThread: Thread = {
    id: 't-2',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Your receipt from Apple for $9.99',
    snippet: 'Thank you for your order...',
    participants: [{ name: 'Apple Receipts', address: 'no-reply@apple.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  const humanThread: Thread = {
    id: 't-3',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Quick question about the partnership agreement',
    snippet: 'Hi Yehuda, wanted to check if you had time to talk...',
    participants: [{ name: 'Sarah Miller', address: 'sarah@partnercompany.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 2,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  assert.equal(classifyThreadStream(newsletterThread), 'feed');
  assert.equal(classifyThreadStream(receiptThread), 'paper_trail');
  assert.equal(classifyThreadStream(humanThread), 'primary');
});

test('Stream Classification: respects manual user tag overrides', () => {
  const overriddenThread: Thread = {
    id: 't-4',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Weekly digest from team',
    snippet: '...',
    participants: [{ name: 'Substack', address: 'digest@substack.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: ['STREAM_PRIMARY'], // User manually tagged as primary
    messages: [],
  };

  assert.equal(classifyThreadStream(overriddenThread), 'primary');
});

test('Sent Mail: correctly identifies outgoing threads and SENT tags', () => {
  const incomingOnlyThread: Thread = {
    id: 't-in',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Incoming inquiry',
    snippet: 'Hello...',
    participants: [{ name: 'Client', address: 'client@example.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-1',
        threadId: 't-in',
        inboxId: 'in-1',
        projectId: 'p-1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Client', address: 'client@example.com' },
        to: [{ name: 'Me', address: 'me@example.com' }],
        subject: 'Incoming inquiry',
        bodyText: 'Hello...',
        timestamp: new Date().toISOString(),
        isOutgoing: false,
      },
    ],
  };

  const repliedThread: Thread = {
    id: 't-reply',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Project Update',
    snippet: 'You: Thanks for the update...',
    participants: [
      { name: 'Partner', address: 'partner@example.com' },
      { name: 'Me', address: 'me@example.com' },
    ],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 2,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-2',
        threadId: 't-reply',
        inboxId: 'in-1',
        projectId: 'p-1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Partner', address: 'partner@example.com' },
        to: [{ name: 'Me', address: 'me@example.com' }],
        subject: 'Project Update',
        bodyText: 'How is it going?',
        timestamp: new Date().toISOString(),
        isOutgoing: false,
      },
      {
        id: 'm-3',
        threadId: 't-reply',
        inboxId: 'in-1',
        projectId: 'p-1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Me', address: 'me@example.com' },
        to: [{ name: 'Partner', address: 'partner@example.com' }],
        subject: 'Re: Project Update',
        bodyText: 'Thanks for the update...',
        timestamp: new Date().toISOString(),
        isOutgoing: true,
      },
    ],
  };

  const sentTagThread: Thread = {
    id: 't-tag',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Proposal sent',
    snippet: 'Proposal attached...',
    participants: [{ name: 'Me', address: 'me@example.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: true, // Archived should still appear in Sent mail
    tags: ['SENT', 'GMAIL'],
    messages: [],
  };

  const isSent = (t: Thread) => t.messages.some((m) => m.isOutgoing) || t.tags.includes('SENT');

  assert.equal(isSent(incomingOnlyThread), false);
  assert.equal(isSent(repliedThread), true);
  assert.equal(isSent(sentTagThread), true);
});

