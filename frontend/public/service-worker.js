const SHELL_CACHE = 'kenya-watch-shell-v1';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/kenya-watch-192.png',
  '/icons/kenya-watch-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('kenya-watch-shell-') && key !== SHELL_CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          return caches.open(SHELL_CACHE).then((cache) => cache.put('/', response.clone()).then(() => response));
        }
        return response;
      }).catch(async () => {
        const cachedShell = await caches.match('/');
        if (cachedShell) return cachedShell;
        return Response.error();
      })
    );
    return;
  }

  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          return caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()).then(() => response));
        }
        return response;
      }))
    );
  }
});

// Web Push: zero-cost phone alerts. The OS shows this notification even when
// the Kenya Watch tab is closed, and no SMS airtime or SMS credit is used.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { title: 'Kenya Watch', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Kenya Watch';
  const options = {
    body: payload.body || '',
    icon: '/icons/kenya-watch-192.png',
    badge: '/icons/kenya-watch-192.png',
    data: { link: payload.link || '/' },
    tag: payload.tag || 'kenya-watch-status'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
