import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStableStoredThreads, fetchStoredThreads } from '../src/services/mailApi';
import { serializeStartupThreads, STARTUP_CACHE_MAX_BYTES, STARTUP_CACHE_MAX_THREADS } from '../src/utils/startupCache';
import type { Thread } from '../src/types';

const thread = (id: string, timestamp = '2026-11-02T12:00:00Z', bodyText = 'Complete email') => ({
  id, lastMessageTimestamp: timestamp, messages: [{ id: `m-${id}`, bodyText, bodyHtml: `<p>${bodyText}</p>` }],
} as Thread);

test('first mail page is published while older history is still pending', async (t) => {
  const newest = thread('newest');
  const older = thread('older');
  const pages: Thread[][] = [];
  let releaseHistory!: () => void;
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve; });
  let firstPage!: () => void;
  const firstPageReady = new Promise<void>(resolve => { firstPage = resolve; });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input) === '/api/mail/revision') return Response.json({ revision: '2:stable' });
    if (String(input).includes('cursor=')) {
      await historyGate;
      return Response.json({ threads: [older], nextCursor: null });
    }
    return Response.json({ threads: [newest], nextCursor: 'older' });
  });
  let completed = false;
  const result = fetchStableStoredThreads(undefined, { onPage(page) { pages.push(page); firstPage(); } })
    .then(snapshot => { completed = true; return snapshot; });
  try {
    await firstPageReady;
    assert.equal(completed, false);
    assert.deepEqual(pages, [[newest]]);
  } finally { releaseHistory(); }
  assert.deepEqual((await result).threads, [newest, older]);
  assert.deepEqual(pages, [[newest], [older]]);
});

test('a failed history page leaves the already published mail available and reports failure', async (t) => {
  const pages: Thread[][] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input) === '/api/mail/revision') return Response.json({ revision: '2:stable' });
    return String(input).includes('cursor=')
      ? new Response('', { status: 500 })
      : Response.json({ threads: [thread('newest')], nextCursor: 'older' });
  });
  await assert.rejects(fetchStableStoredThreads(undefined, { onPage: page => { pages.push(page); } }), /Could not refresh/);
  assert.deepEqual(pages.map(page => page.map(item => item.id)), [['newest']]);
});

test('cancelled startup does not publish a late page or request more history', async (t) => {
  const controller = new AbortController();
  let published = false;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    controller.abort();
    return Response.json({ threads: [thread('late')], nextCursor: 'older' });
  });
  await assert.rejects(fetchStoredThreads(undefined, {
    signal: controller.signal, onPage: () => { published = true; },
  }), { name: 'AbortError' });
  assert.equal(published, false);
  assert.equal(requests, 1);
});

test('startup cache keeps full email text and HTML and prioritizes the newest 50 conversations', () => {
  const body = 'Full email content. '.repeat(100);
  const threads = Array.from({ length: 200 }, (_, i) => thread(String(i), new Date(i * 1000).toISOString(), body));
  const cached = JSON.parse(serializeStartupThreads(threads));
  assert.equal(cached.length, STARTUP_CACHE_MAX_THREADS);
  assert.equal(cached[0].id, '199');
  assert.equal(cached[0].messages[0].bodyText, body);
  assert.equal(cached[0].messages[0].bodyHtml, `<p>${body}</p>`);
  assert.equal(threads[0].id, '0');
});

test('oversized emails do not prevent smaller complete conversations from being cached', () => {
  const serialized = serializeStartupThreads([
    thread('huge', undefined, 'a'.repeat(STARTUP_CACHE_MAX_BYTES)), thread('small'),
  ]);
  assert.ok(serialized.length * 2 <= STARTUP_CACHE_MAX_BYTES);
  assert.deepEqual(JSON.parse(serialized).map((item: Thread) => item.id), ['small']);
});
