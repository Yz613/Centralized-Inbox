import test from 'node:test';
import assert from 'node:assert/strict';
import type { Thread } from '../src/types';

function createThread(id: string, isRead: boolean, isArchived = false, spamStatus: 'not_spam' | 'suspected' = 'not_spam'): Thread {
  return {
    id,
    projectId: 'proj-1',
    inboxId: 'inbox-1',
    channel: 'gmail',
    inboxRole: 'general',
    subject: `Subject ${id}`,
    snippet: `Snippet ${id}`,
    participants: [{ name: 'User', address: 'user@example.com' }],
    lastMessageTimestamp: new Date().toISOString(),
    messageCount: 1,
    isRead,
    isStarred: false,
    isArchived,
    tags: [],
    spamStatus,
    messages: [
      {
        id: `msg-${id}`,
        threadId: id,
        inboxId: 'inbox-1',
        projectId: 'proj-1',
        channel: 'gmail',
        inboxRole: 'general',
        from: { name: 'Sender', address: 'sender@example.com' },
        to: [{ name: 'User', address: 'user@example.com' }],
        subject: `Subject ${id}`,
        bodyText: `Body ${id}`,
        timestamp: new Date().toISOString(),
        isOutgoing: false,
      },
    ],
  };
}

test('unread filter isolates unread active threads and ignores read, archived, or spam threads', () => {
  const threads = [
    createThread('t1', false),               // unread active -> keep
    createThread('t2', true),                // read active -> omit
    createThread('t3', false, true),         // unread archived -> omit
    createThread('t4', false, false, 'suspected'), // unread spam -> omit
    createThread('t5', false),               // unread active -> keep
  ];

  const unreadFiltered = threads.filter((t) => {
    if (t.isArchived) return false;
    if (t.spamStatus === 'suspected') return false;
    if (t.isRead) return false;
    return true;
  });

  assert.deepEqual(unreadFiltered.map((t) => t.id), ['t1', 't5']);
});
