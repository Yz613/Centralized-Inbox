import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContacts, searchContacts, parseAddress, getInitials } from '../src/utils/contacts';
import { Thread, InboxAccount } from '../src/types';

const mockInboxes: InboxAccount[] = [
  {
    id: 'inbox-user-1',
    name: 'Yehuda Zahler',
    email: 'yehuda@apexanalytics.io',
    channel: 'gmail',
    role: 'admin',
    projectId: 'proj-apex',
    badgeColor: '#EF4444',
    unreadCount: 0,
    status: 'connected',
    lastSyncedAt: '2026-09-20T12:00:00Z',
  },
];

const mockThreads: Thread[] = [
  {
    id: 't-1',
    projectId: 'proj-apex',
    inboxId: 'inbox-user-1',
    channel: 'gmail',
    inboxRole: 'admin',
    subject: 'Production cluster issue',
    snippet: 'Hey Yehuda, check logs',
    participants: [
      { name: 'Marcus Vance', address: 'm.vance@fintechcorp.eu' },
      { name: 'Yehuda Zahler', address: 'yehuda@apexanalytics.io' },
    ],
    lastMessageTimestamp: '2026-09-22T10:00:00Z',
    messageCount: 2,
    isRead: true,
    isStarred: false,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-1',
        threadId: 't-1',
        inboxId: 'inbox-user-1',
        projectId: 'proj-apex',
        channel: 'gmail',
        inboxRole: 'admin',
        from: { name: 'Marcus Vance', address: 'm.vance@fintechcorp.eu' },
        to: [{ name: 'Yehuda', address: 'yehuda@apexanalytics.io' }],
        cc: ['sarah.ops@fintechcorp.eu'],
        subject: 'Production cluster issue',
        bodyText: 'Please review the attached logs.',
        timestamp: '2026-09-22T09:00:00Z',
        isOutgoing: false,
      },
      {
        id: 'm-2',
        threadId: 't-1',
        inboxId: 'inbox-user-1',
        projectId: 'proj-apex',
        channel: 'gmail',
        inboxRole: 'admin',
        from: { name: 'Yehuda Zahler', address: 'yehuda@apexanalytics.io' },
        to: [{ name: 'Marcus Vance', address: 'm.vance@fintechcorp.eu' }],
        subject: 'Re: Production cluster issue',
        bodyText: 'Checking on it now.',
        timestamp: '2026-09-22T10:00:00Z',
        isOutgoing: true,
      },
    ],
  },
  {
    id: 't-2',
    projectId: 'proj-zenith',
    inboxId: 'inbox-user-1',
    channel: 'gmail',
    inboxRole: 'admin',
    subject: 'Partnership Inquiry',
    snippet: 'Hi, excited to connect',
    participants: [
      { name: 'Alice Walker', address: 'alice@venturecapital.com' },
    ],
    lastMessageTimestamp: '2026-09-21T15:00:00Z',
    messageCount: 1,
    isRead: true,
    isStarred: true,
    isArchived: false,
    tags: [],
    messages: [
      {
        id: 'm-3',
        threadId: 't-2',
        inboxId: 'inbox-user-1',
        projectId: 'proj-zenith',
        channel: 'gmail',
        inboxRole: 'admin',
        from: { name: 'Alice Walker', address: 'alice@venturecapital.com' },
        to: [{ name: 'Yehuda', address: 'yehuda@apexanalytics.io' }],
        subject: 'Partnership Inquiry',
        bodyText: 'Hi, would love to connect about Series B.',
        timestamp: '2026-09-21T15:00:00Z',
        isOutgoing: false,
      },
    ],
  },
];

test('parseAddress extracts address and clean name', () => {
  assert.deepEqual(parseAddress('Sarah Jenkins <sarah@acme.org>'), {
    address: 'sarah@acme.org',
    name: 'Sarah Jenkins',
  });
  assert.deepEqual(parseAddress('"Bob Ross" <bob@art.com>'), {
    address: 'bob@art.com',
    name: 'Bob Ross',
  });
  assert.deepEqual(parseAddress('justemail@domain.com'), {
    address: 'justemail@domain.com',
  });
});

test('getInitials creates proper 2-letter monogram', () => {
  assert.equal(getInitials('Marcus Vance'), 'MV');
  assert.equal(getInitials('Alice'), 'AL');
  assert.equal(getInitials(undefined, 'm.vance@fintechcorp.eu'), 'M.');
});

test('extractContacts extracts inbound senders, recipients, CC, and metadata', () => {
  const contacts = extractContacts(mockThreads, mockInboxes);

  // Should have Marcus Vance, Sarah Ops (from CC), Alice Walker
  const marcus = contacts.find((c) => c.address === 'm.vance@fintechcorp.eu');
  assert.ok(marcus);
  assert.equal(marcus.name, 'Marcus Vance');
  assert.equal(marcus.isSender, true);
  assert.equal(marcus.incomingCount, 1);
  assert.equal(marcus.outgoingCount, 1);
  assert.ok(marcus.projectIds.includes('proj-apex'));

  const alice = contacts.find((c) => c.address === 'alice@venturecapital.com');
  assert.ok(alice);
  assert.equal(alice.name, 'Alice Walker');
  assert.equal(alice.isSender, true);
  assert.ok(alice.projectIds.includes('proj-zenith'));

  const sarah = contacts.find((c) => c.address === 'sarah.ops@fintechcorp.eu');
  assert.ok(sarah);
  assert.equal(sarah.isSender, false); // was only on CC
});

test('searchContacts zero-query returns recent inbound senders first', () => {
  const contacts = extractContacts(mockThreads, mockInboxes);
  const results = searchContacts(contacts, '');

  assert.ok(results.length >= 2);
  // Marcus (interacted 2026-09-22) should be first, Alice (2026-09-21) second
  assert.equal(results[0].address, 'm.vance@fintechcorp.eu');
  assert.equal(results[1].address, 'alice@venturecapital.com');
});

test('searchContacts finds by partial name, email prefix, and domain', () => {
  const contacts = extractContacts(mockThreads, mockInboxes);

  // Search by name "mar"
  const byName = searchContacts(contacts, 'mar');
  assert.equal(byName[0].address, 'm.vance@fintechcorp.eu');

  // Search by last name "vance"
  const byLastName = searchContacts(contacts, 'vance');
  assert.equal(byLastName[0].address, 'm.vance@fintechcorp.eu');

  // Search by domain "venturecapital"
  const byDomain = searchContacts(contacts, 'venturecapital');
  assert.equal(byDomain[0].address, 'alice@venturecapital.com');

  // Search by email prefix "sarah"
  const byEmail = searchContacts(contacts, 'sarah');
  assert.equal(byEmail[0].address, 'sarah.ops@fintechcorp.eu');
});

test('searchContacts prioritizes current project and inbound senders', () => {
  const contacts = extractContacts(mockThreads, mockInboxes);

  // Both Marcus and Sarah have "fintechcorp.eu" in their address (domain match 400)
  // But Marcus is in proj-apex AND is an inbound sender (+150), so Marcus ranks higher than Sarah
  const fintechMatches = searchContacts(contacts, 'fintechcorp');
  assert.equal(fintechMatches[0].address, 'm.vance@fintechcorp.eu');

  // When query matches multiple contacts with similar match quality, currentProjectId boosts relevance
  const c1 = {
    address: 'dev1@service.io',
    displayAddress: 'dev1@service.io',
    name: 'Alex Developer',
    incomingCount: 1,
    outgoingCount: 0,
    lastInteractedAt: '2026-09-20T00:00:00Z',
    projectIds: ['proj-apex'],
    inboxIds: [],
    isSender: true,
  };
  const c2 = {
    address: 'dev2@service.io',
    displayAddress: 'dev2@service.io',
    name: 'Alex Designer',
    incomingCount: 1,
    outgoingCount: 0,
    lastInteractedAt: '2026-09-20T00:00:00Z',
    projectIds: ['proj-zenith'],
    inboxIds: [],
    isSender: true,
  };

  const apexMatches = searchContacts([c1, c2], 'alex', { currentProjectId: 'proj-apex' });
  assert.equal(apexMatches[0].address, 'dev1@service.io');

  const zenithMatches = searchContacts([c1, c2], 'alex', { currentProjectId: 'proj-zenith' });
  assert.equal(zenithMatches[0].address, 'dev2@service.io');
});
