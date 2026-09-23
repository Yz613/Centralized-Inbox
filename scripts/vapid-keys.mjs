const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
let binary = '';
for (const byte of raw) binary += String.fromCharCode(byte);
const publicKey = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
