self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'New mail', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'New mail';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || data.threadId || 'mail',
    data: { url: data.url || '/', threadId: data.threadId || '' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const target = new URL(payload.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if (typeof existing.navigate === 'function') {
        await existing.navigate(target);
        return;
      }
      existing.postMessage({ type: 'open-thread', threadId: payload.threadId });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
