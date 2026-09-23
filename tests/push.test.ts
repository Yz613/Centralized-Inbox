import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { alertsToSend, b64urlToBytes, bytesToB64url, encryptPushPayload, notifyNewMail } from '../pushNotify';
import type { IncomingAlert } from '../mailStore';

const rfcBody = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

test('aes128gcm matches the RFC 8291 example', async () => {
  const asPublic = b64urlToBytes('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const asPrivate = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    x: bytesToB64url(asPublic.slice(1, 33)), y: bytesToB64url(asPublic.slice(33, 65)),
  }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const body = await encryptPushPayload({
    userPublicKey: b64urlToBytes('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
    authSecret: b64urlToBytes('BTBZMqHH6r4Tts7J_aSIgg'),
    payload: new TextEncoder().encode('When I grow up, I want to be a watermelon'),
    salt: b64urlToBytes('DGv6ra1nlYgDCS1FRnbzlw'),
    asPrivateKey: asPrivate,
    asPublicKey: asPublic,
  });
  assert.equal(bytesToB64url(body), rfcBody);
});

const alert = (over: Partial<IncomingAlert> = {}): IncomingAlert => ({
  threadId: 'thread-1',
  subject: 'Hello',
  snippet: 'A note',
  fromName: 'Ada',
  fromAddress: 'ada@example.com',
  timestamp: new Date().toISOString(),
  participants: [{ name: 'Ada', address: 'ada@example.com' }],
  tags: [],
  ...over,
});

test('phone alerts skip newsletters, spam, and mailbox history', () => {
  const now = Date.parse('2026-09-22T20:00:00Z');
  const recent = new Date(now - 60_000).toISOString();
  const sent = alertsToSend([
    alert({ timestamp: recent }),
    alert({ threadId: 'feed', timestamp: recent, subject: 'Weekly digest', fromAddress: 'news@substack.com', participants: [{ name: 'News', address: 'news@substack.com' }] }),
    alert({ threadId: 'spam', timestamp: recent, spamStatus: 'suspected', subject: 'Security alert', fromAddress: 'alerts@bank.test', participants: [{ name: 'Bank', address: 'alerts@bank.test' }] }),
    alert({ threadId: 'old', timestamp: '2020-01-01T00:00:00Z', subject: 'Security alert', fromAddress: 'alerts@bank.test', participants: [{ name: 'Bank', address: 'alerts@bank.test' }] }),
    alert({ threadId: 'paper', timestamp: recent, subject: 'Security alert', fromAddress: 'alerts@bank.test', participants: [{ name: 'Bank', address: 'alerts@bank.test' }] }),
  ], 'recent', now);
  assert.deepEqual(sent.map((item) => item.threadId), ['thread-1', 'paper']);
  const live = alertsToSend([alert({ threadId: 'old', timestamp: '2020-01-01T00:00:00Z' })], 'live', now);
  assert.equal(live.length, 1);
});

test('a saved phone receives one push and a gone subscription is removed', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('migrations/0005_push_subscriptions.sql', 'utf8'));
  sql.prepare('INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .run('https://fcm.googleapis.com/fcm/send/device', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', 'now', 'now');
  const db: any = { prepare(query: string) {
    const statement: any = { values: [] as any[], bind(...values: any[]) { this.values = values; return this; },
      async all() { return { results: sql.prepare(query).all(...this.values) }; },
      async run() { return { success: true, meta: sql.prepare(query).run(...this.values) }; } };
    return statement;
  } };
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicKey = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(null, { status: 410 });
  };
  try {
    await notifyNewMail({ DB: db, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d }, [alert()], 'live');
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, ['https://fcm.googleapis.com/fcm/send/device']);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM push_subscriptions').get()!.n, 0);
});
