import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAddress,
  insertMention,
  mentionAtCursor,
  resolveReplyInbox,
  defaultReplyRecipients,
  replyAllRecipients,
} from '../src/utils/replyMentions';
import type { InboxAccount, Message, Thread } from '../src/types';

test('mention query follows the caret after @', () => {
  assert.deepEqual(mentionAtCursor('Hi @sa', 6), { start: 3, query: 'sa' });
  assert.equal(mentionAtCursor('email me at test@example.com', 27), null);
  assert.equal(mentionAtCursor('Hi @sam there', 'Hi @sam there'.length), null);
});

test('choosing a mention replaces the token and can be added once', () => {
  const inserted = insertMention('Loop in @sa', 11, 8, 'Sam Rivera');
  assert.equal(inserted.text, 'Loop in @Sam Rivera ');
  assert.equal(appendAddress('a@example.com', 'sam@example.com'), 'a@example.com, sam@example.com');
  assert.equal(appendAddress('sam@example.com', 'sam@example.com'), 'sam@example.com');
  assert.equal(appendAddress('', 'sam@example.com', ['sam@example.com']), '');
});

const mockInboxes: InboxAccount[] = [
  {
    id: 'inbox-support',
    name: 'Support',
    email: 'support@apexanalytics.io',
    channel: 'gmail',
    role: 'support',
    projectId: 'proj-apex',
    badgeColor: '#EF4444',
    unreadCount: 0,
    status: 'connected',
    lastSyncedAt: '2026-09-23T12:00:00Z',
  },
  {
    id: 'inbox-admin',
    name: 'Admin',
    email: 'admin@apexanalytics.io',
    channel: 'zoho',
    role: 'admin',
    projectId: 'proj-apex',
    badgeColor: '#F59E0B',
    unreadCount: 0,
    status: 'connected',
    lastSyncedAt: '2026-09-23T12:00:00Z',
  },
  {
    id: 'inbox-billing',
    name: 'Billing',
    email: 'billing@apexanalytics.io',
    channel: 'cloudflare',
    role: 'billing',
    projectId: 'proj-apex',
    badgeColor: '#10B981',
    unreadCount: 0,
    status: 'connected',
    lastSyncedAt: '2026-09-23T12:00:00Z',
  },
];

test('resolveReplyInbox: defaults sender to the email the incoming message was sent to', () => {
  const thread: Thread = {
    id: 't-1',
    projectId: 'proj-apex',
    inboxId: 'inbox-support', // thread initially assigned to support
    channel: 'gmail',
    inboxRole: 'support',
    subject: 'Enterprise Contract Review',
    snippet: 'Please find the contract attached',
    participants: [
      { name: 'Alice Client', address: 'alice@enterprise.com' },
      { name: 'Admin', address: 'admin@apexanalytics.io' },
    ],
    lastMessageTimestamp: '2026-09-23T14:00:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-1',
        threadId: 't-1',
        inboxId: 'inbox-admin',
        projectId: 'proj-apex',
        channel: 'zoho',
        inboxRole: 'admin',
        from: { name: 'Alice Client', address: 'alice@enterprise.com' },
        to: [{ name: 'Admin', address: 'admin@apexanalytics.io' }],
        subject: 'Enterprise Contract Review',
        bodyText: 'Hi, sending this to your admin email address.',
        timestamp: '2026-09-23T14:00:00Z',
        isOutgoing: false,
      },
    ],
  };

  const resolved = resolveReplyInbox(thread, undefined, mockInboxes);
  assert.ok(resolved);
  assert.equal(resolved.email, 'admin@apexanalytics.io');
  assert.equal(resolved.id, 'inbox-admin');
});

test('resolveReplyInbox: picks the inbox of a specific message when replying to an earlier message', () => {
  const msgSupport: Message = {
    id: 'm-1',
    threadId: 't-multi',
    inboxId: 'inbox-support',
    projectId: 'proj-apex',
    channel: 'gmail',
    inboxRole: 'support',
    from: { name: 'Bob Partner', address: 'bob@partner.com' },
    to: [{ name: 'Support', address: 'support@apexanalytics.io' }],
    subject: 'Multi-part conversation',
    bodyText: 'Help with integration',
    timestamp: '2026-09-23T10:00:00Z',
    isOutgoing: false,
  };

  const msgBilling: Message = {
    id: 'm-2',
    threadId: 't-multi',
    inboxId: 'inbox-billing',
    projectId: 'proj-apex',
    channel: 'cloudflare',
    inboxRole: 'billing',
    from: { name: 'Bob Partner', address: 'bob@partner.com' },
    to: [{ name: 'Billing', address: 'billing@apexanalytics.io' }],
    subject: 'Multi-part conversation',
    bodyText: 'Here is the invoice question',
    timestamp: '2026-09-23T12:00:00Z',
    isOutgoing: false,
  };

  const thread: Thread = {
    id: 't-multi',
    projectId: 'proj-apex',
    inboxId: 'inbox-support',
    channel: 'gmail',
    inboxRole: 'support',
    subject: 'Multi-part conversation',
    snippet: 'Here is the invoice question',
    participants: [
      { name: 'Bob Partner', address: 'bob@partner.com' },
      { name: 'Support', address: 'support@apexanalytics.io' },
      { name: 'Billing', address: 'billing@apexanalytics.io' },
    ],
    lastMessageTimestamp: '2026-09-23T12:00:00Z',
    messageCount: 2,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [msgSupport, msgBilling],
  };

  // Default without targetMessage replies to latest incoming (billing)
  const defaultResolved = resolveReplyInbox(thread, undefined, mockInboxes);
  assert.equal(defaultResolved?.email, 'billing@apexanalytics.io');

  // Replying specifically to msgSupport resolves support inbox
  const supportResolved = resolveReplyInbox(thread, msgSupport, mockInboxes);
  assert.equal(supportResolved?.email, 'support@apexanalytics.io');

  // Replying specifically to msgBilling resolves billing inbox
  const billingResolved = resolveReplyInbox(thread, msgBilling, mockInboxes);
  assert.equal(billingResolved?.email, 'billing@apexanalytics.io');
});

test('resolveReplyInbox: matches inbox by message inboxId when delivered via BCC', () => {
  const thread: Thread = {
    id: 't-bcc',
    projectId: 'proj-apex',
    inboxId: 'inbox-support',
    channel: 'gmail',
    inboxRole: 'support',
    subject: 'System Outage Notice',
    snippet: 'Urgent notification',
    participants: [{ name: 'Alert Service', address: 'alerts@cloudops.com' }],
    lastMessageTimestamp: '2026-09-23T13:00:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-bcc',
        threadId: 't-bcc',
        inboxId: 'inbox-admin', // Arrived in admin mailbox even though To is generic
        projectId: 'proj-apex',
        channel: 'zoho',
        inboxRole: 'admin',
        from: { name: 'Alert Service', address: 'alerts@cloudops.com' },
        to: [{ name: 'Undisclosed Recipients', address: 'undisclosed-recipients@cloudops.com' }],
        subject: 'System Outage Notice',
        bodyText: 'Service interruption notification.',
        timestamp: '2026-09-23T13:00:00Z',
        isOutgoing: false,
      },
    ],
  };

  const resolved = resolveReplyInbox(thread, undefined, mockInboxes);
  assert.equal(resolved?.id, 'inbox-admin');
  assert.equal(resolved?.email, 'admin@apexanalytics.io');
});

test('resolveReplyInbox: creates synthesized inbox for unconfigured custom domain alias', () => {
  const thread: Thread = {
    id: 't-alias',
    projectId: 'proj-apex',
    inboxId: 'inbox-support',
    channel: 'cloudflare',
    inboxRole: 'support',
    subject: 'Contact Form Inquiry',
    snippet: 'Sent to info alias',
    participants: [{ name: 'Visitor', address: 'visitor@external.org' }],
    lastMessageTimestamp: '2026-09-23T14:00:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-alias',
        threadId: 't-alias',
        inboxId: 'inbox-support',
        projectId: 'proj-apex',
        channel: 'cloudflare',
        inboxRole: 'support',
        from: { name: 'Visitor', address: 'visitor@external.org' },
        to: [{ name: 'Info Desk', address: 'info@apexanalytics.io' }], // Unconfigured alias
        subject: 'Contact Form Inquiry',
        bodyText: 'Sent to info@apexanalytics.io',
        timestamp: '2026-09-23T14:00:00Z',
        isOutgoing: false,
      },
    ],
  };

  const resolved = resolveReplyInbox(thread, undefined, mockInboxes);
  assert.ok(resolved);
  assert.equal(resolved.email, 'info@apexanalytics.io');
  assert.equal(resolved.id, 'sent-to-info@apexanalytics.io');
});

test('defaultReplyRecipients: excludes the resolved reply inbox email from To', () => {
  const msg: Message = {
    id: 'm-reply',
    threadId: 't-r',
    inboxId: 'inbox-admin',
    projectId: 'proj-apex',
    channel: 'zoho',
    inboxRole: 'admin',
    from: { name: 'Alice Client', address: 'alice@enterprise.com' },
    to: [{ name: 'Admin', address: 'admin@apexanalytics.io' }],
    subject: 'Discussion',
    bodyText: 'Let us chat',
    timestamp: '2026-09-23T14:00:00Z',
    isOutgoing: false,
  };

  const thread: Thread = {
    id: 't-r',
    projectId: 'proj-apex',
    inboxId: 'inbox-admin',
    channel: 'zoho',
    inboxRole: 'admin',
    subject: 'Discussion',
    snippet: 'Let us chat',
    participants: [
      { name: 'Alice Client', address: 'alice@enterprise.com' },
      { name: 'Admin', address: 'admin@apexanalytics.io' },
    ],
    lastMessageTimestamp: '2026-09-23T14:00:00Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [msg],
  };

  // With admin@apexanalytics.io as ownEmail, only alice@enterprise.com remains in recipients
  const recipients = defaultReplyRecipients(thread, 'admin@apexanalytics.io', msg);
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].address, 'alice@enterprise.com');

  const replyAll = replyAllRecipients(thread, 'admin@apexanalytics.io', msg);
  assert.equal(replyAll.length, 1);
  assert.equal(replyAll[0].address, 'alice@enterprise.com');
});

