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

export async function showForegroundNotification(title: string, body: string, tag: string) {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag,
          data: { url: tag === 'inbox-alerts-on' ? '/' : `/?thread=${encodeURIComponent(tag)}`, threadId: tag },
        });
        return;
      }
    } catch {
      // Use the page notification when the service worker cannot display one.
    }
  }
  new Notification(title, { body, tag });
}

export function phoneAlertFailure(message: string): string {
  if (/push service not available|push service error/i.test(message)) {
    if (typeof navigator !== 'undefined' && 'brave' in navigator) {
      return 'Brave allowed this site to show notifications, but background push registration failed. In Brave Privacy and security, check “Use Google Services for Push Messaging”, restart Brave, then retry. Alerts still work while this inbox is open.';
    }
    return 'This browser could not register background alerts. Check its push messaging settings, then retry. Alerts still work while this inbox is open.';
  }
  return message;
}

export function phoneAlertStatusHint(status: 'ready' | 'unconfigured' | 'unsupported'): string | null {
  if (status === 'ready') return null;
  if (status === 'unconfigured') return 'Background alerts are not configured on the server. Alerts still work while this inbox is open.';
  if ('brave' in navigator) return 'Brave cannot register background alerts. Check “Use Google Services for Push Messaging” in Privacy and security, then retry.';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return 'For background alerts on iPhone, add this inbox to your Home Screen from Safari, open it there, then tap the bell.';
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
