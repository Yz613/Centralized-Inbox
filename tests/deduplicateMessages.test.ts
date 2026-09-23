import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areMessagesDuplicate,
  mergeDuplicateMessages,
  deduplicateMessages,
  mergeThreadLists,
} from '../src/utils/mergeThreads';
import type { Message, Thread } from '../src/types';

test('areMessagesDuplicate: identifies RFC Message-ID match', () => {
  const msg1: Message = {
    id: 'm1',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Alice', address: 'alice@example.com' },
    to: [{ name: 'Bob', address: 'bob@example.com' }],
    subject: 'Hello',
    bodyText: 'Hello world',
    timestamp: '2026-09-23T12:00:00.000Z',
    isOutgoing: false,
    messageId: '<unique-msg-123@mail.gmail.com>',
  };

  const msg2: Message = {
    id: 'm2',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Alice', address: 'alice@example.com' },
    to: [{ name: 'Bob', address: 'bob@example.com' }],
    subject: 'Hello',
    bodyText: 'Hello world',
    timestamp: '2026-09-23T12:00:00.000Z',
    isOutgoing: false,
    messageId: ' <unique-msg-123@mail.gmail.com> ',
  };

  assert.equal(areMessagesDuplicate(msg1, msg2), true);
});

test('areMessagesDuplicate: collapses optimistic pending and synced outgoing messages', () => {
  const pending: Message = {
    id: 'msg-pending-1727100000',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Me', address: 'me@example.com' },
    to: [{ name: 'Client', address: 'client@example.com' }],
    subject: 'Project Proposal',
    bodyText: 'Here is the proposal for your review.',
    timestamp: '2026-09-23T12:50:00.000Z',
    isOutgoing: true,
  };

  const synced: Message = {
    id: 'msg-out-1727100005',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Me', address: 'me@example.com' },
    to: [{ name: 'Client', address: 'client@example.com' }],
    subject: 'Project Proposal',
    bodyText: 'Here is the proposal for your review.',
    timestamp: '2026-09-23T12:50:02.000Z',
    isOutgoing: true,
    messageId: '<gmail-sent-8899@mail.gmail.com>',
  };

  assert.equal(areMessagesDuplicate(pending, synced), true);
});

test('areMessagesDuplicate: collapses incoming duplicates with normalized recipient (e.g. sarahfrank48@gmail.com vs sarahfrank48)', () => {
  const card1: Message = {
    id: 'msg-1',
    threadId: 't-update',
    inboxId: 'inbox-1',
    projectId: 'proj-1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'shadchanim@aizer.app', address: 'shadchanim@aizer.app' },
    to: [{ name: 'sarahfrank48@gmail.com', address: 'sarahfrank48@gmail.com' }],
    subject: 'Re: ASI consolidated shadchan update — 09/22/2026',
    bodyText: 'The following shidduchim have been shared with you...',
    timestamp: '2026-09-23T16:53:00.000Z',
    isOutgoing: false,
  };

  const card2: Message = {
    id: 'msg-2',
    threadId: 't-update',
    inboxId: 'inbox-1',
    projectId: 'proj-1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'shadchanim@aizer.app', address: 'shadchanim@aizer.app' },
    to: [{ name: 'sarahfrank48', address: 'sarahfrank48' }],
    subject: 'Re: ASI consolidated shadchan update — 09/22/2026',
    bodyText: 'The following shidduchim have been shared with you...',
    timestamp: '2026-09-23T16:53:00.000Z',
    isOutgoing: false,
  };

  assert.equal(areMessagesDuplicate(card1, card2), true);

  const merged = mergeDuplicateMessages(card2, card1);
  // Full email address with @ must be preferred over truncated username
  assert.equal(merged.to[0].address, 'sarahfrank48@gmail.com');
});

test('deduplicateMessages: collapses duplicates in list and sorts chronologically', () => {
  const msgOlder: Message = {
    id: 'm-old',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'Me', address: 'me@example.com' }],
    subject: 'Initial Message',
    bodyText: 'Hello there',
    timestamp: '2026-09-22T10:00:00.000Z',
    isOutgoing: false,
  };

  const msgNewer1: Message = {
    id: 'm-new-1',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'me', address: 'me' }],
    subject: 'Update',
    bodyText: 'Here is the update',
    timestamp: '2026-09-23T12:00:00.000Z',
    isOutgoing: false,
  };

  const msgNewer2: Message = {
    id: 'm-new-2',
    threadId: 't1',
    inboxId: 'i1',
    projectId: 'p1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'me@example.com', address: 'me@example.com' }],
    subject: 'Update',
    bodyText: 'Here is the update',
    timestamp: '2026-09-23T12:00:00.000Z',
    isOutgoing: false,
  };

  const deduped = deduplicateMessages([msgNewer1, msgOlder, msgNewer2]);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].id, 'm-old');
  assert.equal(deduped[1].to[0].address, 'me@example.com');
});

test('mergeThreadLists: collapses duplicate messages and updates messageCount', () => {
  const t1: Thread = {
    id: 't-main',
    projectId: 'p1',
    inboxId: 'i1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Test Thread',
    snippet: 'Snippet...',
    participants: [{ name: 'Sender', address: 'sender@example.com' }],
    lastMessageTimestamp: '2026-09-23T12:00:00.000Z',
    messageCount: 2,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'msg-copy-1',
        threadId: 't-main',
        inboxId: 'i1',
        projectId: 'p1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Sender', address: 'sender@example.com' },
        to: [{ name: 'sarahfrank48', address: 'sarahfrank48' }],
        subject: 'Test Thread',
        bodyText: 'The duplicate body...',
        timestamp: '2026-09-23T12:00:00.000Z',
        isOutgoing: false,
      },
      {
        id: 'msg-copy-2',
        threadId: 't-main',
        inboxId: 'i1',
        projectId: 'p1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Sender', address: 'sender@example.com' },
        to: [{ name: 'sarahfrank48@gmail.com', address: 'sarahfrank48@gmail.com' }],
        subject: 'Test Thread',
        bodyText: 'The duplicate body...',
        timestamp: '2026-09-23T12:00:00.000Z',
        isOutgoing: false,
      },
    ],
  };

  const [merged] = mergeThreadLists([t1], []);
  assert.equal(merged.messages.length, 1);
  assert.equal(merged.messageCount, 1);
  assert.equal(merged.messages[0].to[0].address, 'sarahfrank48@gmail.com');
});
