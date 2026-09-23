import type { D1Database } from '@cloudflare/workers-types';
import type { IncomingAlert } from './mailStore';
import { classifyThreadStream } from './src/utils/streamClassification';
import type { Thread } from './src/types';

const RECENT_MS = 2 * 60 * 60 * 1000;
const MAX_ALERTS = 8;

export type PushEnv = {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  ));
}

/** aes128gcm body from RFC 8291. Optional key and salt keep the RFC vector reproducible. */
export async function encryptPushPayload(input: {
  userPublicKey: Uint8Array;
  authSecret: Uint8Array;
  payload: Uint8Array;
  salt?: Uint8Array;
  asPrivateKey?: CryptoKey;
  asPublicKey?: Uint8Array;
}): Promise<Uint8Array<ArrayBuffer>> {
  const salt = input.salt ?? crypto.getRandomValues(new Uint8Array(16));
  let asPrivate = input.asPrivateKey;
  let asPublic = input.asPublicKey;
  if (!asPrivate || !asPublic) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const userKey = await crypto.subtle.importKey(
    'raw',
    input.userPublicKey as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userKey },
    asPrivate,
    256,
  ));
  const keyInfo = concat([utf8('WebPush: info'), new Uint8Array([0]), input.userPublicKey, asPublic]);
  const ikm = await hkdf(input.authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, concat([utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])]), 16);
  const nonce = await hkdf(salt, ikm, concat([utf8('Content-Encoding: nonce'), new Uint8Array([0])]), 12);
  const padded = concat([input.payload, new Uint8Array([2])]);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat([header, ciphertext]);
}

async function importVapidKey(publicKey: string, privateKey: string) {
  const raw = b64urlToBytes(publicKey);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('VAPID public key must be a P-256 uncompressed point.');
  return crypto.subtle.importKey('jwk', {
    kty: 'EC',
    crv: 'P-256',
    d: privateKey,
    x: bytesToB64url(raw.slice(1, 33)),
    y: bytesToB64url(raw.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function vapidAuthorization(endpoint: string, env: PushEnv) {
  const publicKey = (env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim();
  const audience = new URL(endpoint).origin;
  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(utf8(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || 'mailto:inbox@projectinbox.local',
  })));
  const key = await importVapidKey(publicKey, privateKey);
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8(`${header}.${payload}`),
  ));
  return `vapid t=${header}.${payload}.${bytesToB64url(signature)}, k=${publicKey}`;
}

export function alertsToSend(alerts: IncomingAlert[], mode: 'live' | 'recent', now = Date.now()): IncomingAlert[] {
  const chosen = new Map<string, IncomingAlert>();
  for (const alert of alerts) {
    if (alert.spamStatus === 'suspected') continue;
    if (mode === 'recent') {
      const sentAt = Date.parse(alert.timestamp);
      if (!Number.isFinite(sentAt) || now - sentAt > RECENT_MS || sentAt - now > 60 * 60 * 1000) continue;
    }
    const stream = classifyThreadStream({
      id: alert.threadId,
      subject: alert.subject,
      snippet: alert.snippet,
      participants: alert.participants,
      tags: alert.tags,
      messages: [],
    } as unknown as Thread);
    if (stream === 'feed') continue;
    const previous = chosen.get(alert.threadId);
    if (!previous || alert.timestamp > previous.timestamp) chosen.set(alert.threadId, alert);
  }
  const seenMessages = new Set<string>();
  const unique: IncomingAlert[] = [];
  for (const alert of chosen.values()) {
    const messageKey = alert.messageId?.replace(/[<>]/g, '').trim().toLowerCase();
    if (messageKey) {
      if (seenMessages.has(messageKey)) continue;
      seenMessages.add(messageKey);
    }
    unique.push(alert);
  }
  return unique.slice(0, MAX_ALERTS);
}

async function sendOne(env: PushEnv, subscription: { endpoint: string; p256dh: string; auth: string }, alert: IncomingAlert) {
  const payload = utf8(JSON.stringify({
    title: alert.fromName || alert.fromAddress || 'New mail',
    body: alert.subject || 'New message',
    tag: alert.threadId,
    threadId: alert.threadId,
    url: `/?thread=${encodeURIComponent(alert.threadId)}`,
  }));
  const body = await encryptPushPayload({
    userPublicKey: b64urlToBytes(subscription.p256dh),
    authSecret: b64urlToBytes(subscription.auth),
    payload,
  });
  const topic = bytesToB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(alert.threadId)))).slice(0, 32);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, env),
      TTL: '86400',
      Urgency: 'high',
      Topic: topic,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
    },
    body,
  });
  return response.status;
}

/** Tell subscribed phones about new mail. Failures stay here so delivery can still succeed. */
export async function notifyNewMail(env: PushEnv, alerts: IncomingAlert[], mode: 'live' | 'recent') {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
    const pending = alertsToSend(alerts, mode);
    if (!pending.length) return;
    const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all<{
      endpoint: string; p256dh: string; auth: string;
    }>();
    for (const alert of pending) {
      for (const subscription of results) {
        try {
          const status = await sendOne(env, subscription, alert);
          if (status === 404 || status === 410) {
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(subscription.endpoint).run();
          } else if (status < 200 || status > 299) {
            console.error(JSON.stringify({ message: 'push rejected', status }));
          }
        } catch (error) {
          console.error(JSON.stringify({ message: 'push send failed', error: error instanceof Error ? error.message : String(error) }));
        }
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ message: 'push notify failed', error: error instanceof Error ? error.message : String(error) }));
  }
}
