export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type PreparedAlerts = { key: ArrayBuffer } | 'unconfigured' | 'unsupported';

let prepared: Promise<PreparedAlerts> | null = null;
let enabling: Promise<'ready' | 'unconfigured' | 'unsupported'> | null = null;

async function loadPhoneAlerts(): Promise<PreparedAlerts> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const [keyResponse] = await Promise.all([
    fetch('/api/push/public-key', { cache: 'no-store' }),
    navigator.serviceWorker.register('/sw.js'),
  ]);
  if (!keyResponse.ok) throw new Error('Could not check the background alert settings.');
  const keyData = await keyResponse.json().catch(() => null);
  if (!keyData?.configured || !keyData.publicKey) return 'unconfigured';
  const key = urlBase64ToBytes(String(keyData.publicKey).trim());
  if (key.byteLength !== 65 || key[0] !== 4) throw new Error('Phone alert key on the server is invalid.');
  await navigator.serviceWorker.ready;
  return { key: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) };
}

/** Fetch the push key and install the script before the bell is tapped. */
export function preparePhoneAlerts(): Promise<PreparedAlerts> {
  if (!prepared) {
    prepared = loadPhoneAlerts().catch((error) => {
      prepared = null;
      throw error;
    });
  }
  return prepared;
}

async function registerPhoneAlerts(): Promise<'ready' | 'unconfigured' | 'unsupported'> {
  const ready = await preparePhoneAlerts();
  if (ready === 'unsupported' || ready === 'unconfigured') return ready;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const current = new Uint8Array(existing.options.applicationServerKey || new ArrayBuffer(0));
    const next = new Uint8Array(ready.key);
    const sameKey = current.byteLength === next.byteLength && current.every((byte, index) => byte === next[index]);
    if (!sameKey) await existing.unsubscribe();
  }
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ready.key });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      reportPushFailure(message);
      throw error;
    }
  }
  const saved = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!saved.ok) {
    const data = await saved.json().catch(() => ({}));
    throw new Error(data.error || 'Could not save this phone.');
  }
  return 'ready';
}

export function enablePhoneAlerts(): Promise<'ready' | 'unconfigured' | 'unsupported'> {
  if (!enabling) enabling = registerPhoneAlerts().finally(() => { enabling = null; });
  return enabling;
}

export async function disablePhoneAlerts() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}

export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // audio context may require user interaction
  }
}

export async function showForegroundNotification(title: string, body: string, tag: string) {
  playNotificationChime();
  if ('serviceWorker' in navigator) {
    try {
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      }
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          data: { url: tag === 'inbox-alerts-on' ? '/' : `/?thread=${encodeURIComponent(tag)}`, threadId: tag },
        });
        return;
      }
    } catch {
      // Use the page notification when the service worker cannot display one.
    }
  }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag });
    }
  } catch {
    // ignore constructor failure on Android Chromium
  }
}

export function phoneAlertFailure(message: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isBrave =
    typeof navigator !== 'undefined' &&
    ('brave' in navigator || (navigator as any).brave?.isBrave || ua.includes('Brave'));
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);

  if (/push service not available|push service error|Registration failed/i.test(message)) {
    if (isIos) {
      return 'On iPhone, Apple requires adding this app to your Home Screen: tap Share (↑) → "Add to Home Screen", then open from your home screen.';
    }
    if (isBrave && isMobile) {
      return 'On Brave Android, the desktop toggle does not exist. Ensure notifications are allowed in: (1) Address bar lock icon → Permissions → Notifications; and (2) Android Settings → Apps → Brave → Notifications. In-app alerts with audio chime are active while open.';
    }
    if (isBrave) {
      return 'Brave Desktop blocks push by default. In Brave Settings → Brave Shields & privacy, turn ON “Use Google Services for Push Messaging”, restart Brave, then retry.';
    }
    return 'This browser could not register background alerts. Check its push messaging settings, then retry. In-tab alerts still work while this inbox is open.';
  }
  return message;
}

export function phoneAlertStatusHint(status: 'ready' | 'unconfigured' | 'unsupported'): string | null {
  if (status === 'ready') return null;
  if (status === 'unconfigured') return 'Background alerts are not configured on the server. Alerts still work while this inbox is open.';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isBrave = 'brave' in navigator || ua.includes('Brave');

  if (isIos) {
    return 'For background alerts on iPhone, add this inbox to your Home Screen: tap Share (↑) → "Add to Home Screen", then open from your home screen.';
  }
  if (isBrave && isMobile) {
    return 'On Brave Android, allow notifications in your phone Settings → Apps → Brave → Notifications. In-app alerts work while open.';
  }
  if (isBrave) {
    return 'Brave Desktop cannot register background alerts. Turn ON “Use Google Services for Push Messaging” in Brave Settings → Shields & privacy.';
  }
  return 'This browser cannot receive background alerts. Open this inbox in a browser that supports push notifications and tap the bell.';
}

export function reportPushFailure(message: string) {
  void fetch('/api/push/failure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message.slice(0, 300) }),
  }).catch(() => {});
}
