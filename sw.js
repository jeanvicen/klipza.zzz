const CACHE_NAME = 'klipza-shell-v13';
const APP_SHELL = [
  '/?pwa=1',
  '/index.html',
  '/Studio.html',
  '/manifest.webmanifest',
  '/assets/klipza-mark.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];
const pwaClients = new Set();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(async () => {
        pwaClients.clear();
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.all(clients.map((client) => {
          try {
            const url = new URL(client.url);
            if (url.origin === self.location.origin && url.searchParams.get('pwa') !== '1') return client.navigate(client.url);
          } catch {}
          return null;
        }));
        return self.clients.claim();
      })
  );
});

self.addEventListener('message', (event) => {
  const clientId = event.source?.id;
  if (event.data?.type === 'klipza-activate-web-update') {
    self.skipWaiting();
    return;
  }
  if (!clientId || event.data?.type !== 'klipza-client-mode') return;
  if (event.data.mode === 'pwa') pwaClients.add(clientId);
  else pwaClients.delete(clientId);
});

async function isPwaRequest(request, event) {
  const url = new URL(request.url);
  if (url.searchParams.get('pwa') === '1') return true;
  if (!event.clientId) return false;
  if (pwaClients.has(event.clientId)) return true;
  const client = await self.clients.get(event.clientId);
  if (!client?.url) return false;
  try {
    return new URL(client.url).searchParams.get('pwa') === '1';
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    if (!await isPwaRequest(request, event)) return fetch(request);

    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (!response || response.status !== 200 || response.type !== 'basic') return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    } catch {
      return caches.match('/?pwa=1') || caches.match('/index.html');
    }
  })());
});
