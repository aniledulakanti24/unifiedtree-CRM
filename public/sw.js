// Keeps the app opening without a connection: use the network when it's there, else the last saved copy.
const CACHE = 'unifiedtree-crm-v3';
const SHELL = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});

// The Open and Snooze buttons on an alert. The open app does the work; if none is open, the app opens.
self.addEventListener('notificationclick', (e) => {
  const { id, link } = e.notification.data || {};
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const client = list[0];
    if (client) { client.postMessage({ type: 'alert-action', action: e.action || 'open', id, link }); return e.action === 'snooze' ? undefined : client.focus(); }
    return e.action === 'snooze' ? undefined : self.clients.openWindow(`./#${link || '/alerts'}`);
  }));
});
