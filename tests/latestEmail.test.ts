import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLatestEligibleThread, getLatestMessage } from '../src/utils/latestEmail';
import type { Thread, Message } from '../src/types';

test('getLatestEligibleThread: picks the newest chronological thread', () => {
  const olderThread: Thread = {
    id: 't-1',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Old Discussion',
    snippet: 'Hey...',
    participants: [{ name: 'Alice', address: 'alice@example.com' }],
    lastMessageTimestamp: '2026-09-20T10:00:00.000Z',
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  const newerThread: Thread = {
    id: 't-2',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Latest Discussion',
    snippet: 'New update here...',
    participants: [{ name: 'Bob', address: 'bob@example.com' }],
    lastMessageTimestamp: '2026-09-23T11:30:00.000Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  const middleThread: Thread = {
    id: 't-3',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Middle Discussion',
    snippet: 'Yesterday...',
    participants: [{ name: 'Charlie', address: 'charlie@example.com' }],
    lastMessageTimestamp: '2026-09-22T08:00:00.000Z',
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  // Test when list is out of order
  const list = [olderThread, newerThread, middleThread];
  const latest = getLatestEligibleThread(list);

  assert.ok(latest);
  assert.equal(latest.id, 't-2');
  assert.equal(latest.subject, 'Latest Discussion');
});

test('getLatestEligibleThread: skips archived and suspected spam threads by default', () => {
  const newestArchived: Thread = {
    id: 't-archived',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Archived notification',
    snippet: '...',
    participants: [{ name: 'System', address: 'system@example.com' }],
    lastMessageTimestamp: '2026-09-23T12:00:00.000Z',
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isArchived: true,
    tags: [],
    messages: [],
  };

  const newestSpam: Thread = {
    id: 't-spam',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Win lottery',
    snippet: '...',
    participants: [{ name: 'Scammer', address: 'spam@scam.com' }],
    lastMessageTimestamp: '2026-09-23T11:59:00.000Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    spamStatus: 'suspected',
    tags: [],
    messages: [],
  };

  const validInboxThread: Thread = {
    id: 't-valid',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Client Meeting Notes',
    snippet: 'Thanks for chatting...',
    participants: [{ name: 'Client', address: 'client@example.com' }],
    lastMessageTimestamp: '2026-09-23T10:00:00.000Z',
    messageCount: 1,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [],
  };

  const latest = getLatestEligibleThread([newestArchived, newestSpam, validInboxThread]);
  assert.ok(latest);
  assert.equal(latest.id, 't-valid');
});

test('getLatestEligibleThread: handles empty and null lists safely', () => {
  assert.equal(getLatestEligibleThread([]), null);
  assert.equal(getLatestEligibleThread(null as any), null);
});

test('getLatestMessage: extracts newest message in a multi-message conversation', () => {
  const msg1: Message = {
    id: 'm-1',
    threadId: 't-1',
    inboxId: 'in-1',
    projectId: 'p-1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Alice', address: 'alice@example.com' },
    to: [{ name: 'Me', address: 'me@example.com' }],
    subject: 'Thread',
    bodyText: 'First email',
    timestamp: '2026-09-20T10:00:00.000Z',
    isOutgoing: false,
  };

  const msg2: Message = {
    id: 'm-2',
    threadId: 't-1',
    inboxId: 'in-1',
    projectId: 'p-1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Me', address: 'me@example.com' },
    to: [{ name: 'Alice', address: 'alice@example.com' }],
    subject: 'Re: Thread',
    bodyText: 'Second email (my reply)',
    timestamp: '2026-09-21T10:00:00.000Z',
    isOutgoing: true,
  };

  const msg3: Message = {
    id: 'm-3',
    threadId: 't-1',
    inboxId: 'in-1',
    projectId: 'p-1',
    channel: 'gmail',
    inboxRole: 'general',
    from: { name: 'Alice', address: 'alice@example.com' },
    to: [{ name: 'Me', address: 'me@example.com' }],
    subject: 'Re: Thread',
    bodyText: 'Third email (latest incoming email)',
    timestamp: '2026-09-23T09:00:00.000Z',
    isOutgoing: false,
  };

  const thread: Thread = {
    id: 't-1',
    projectId: 'p-1',
    inboxId: 'in-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: 'Thread',
    snippet: 'Third email...',
    participants: [{ name: 'Alice', address: 'alice@example.com' }],
    lastMessageTimestamp: '2026-09-23T09:00:00.000Z',
    messageCount: 3,
    isRead: false,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [msg1, msg2, msg3],
  };

  const latestMsg = getLatestMessage(thread);
  assert.ok(latestMsg);
  assert.equal(latestMsg.id, 'm-3');
  assert.equal(latestMsg.bodyText, 'Third email (latest incoming email)');
});
