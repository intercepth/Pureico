/* Pureico service worker. The build fills in the version and the list of files to cache. */
const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const CACHE = `pureico-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('pureico-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page asks for this when the visitor accepts the "new version" prompt.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isPage(url) {
  return (
    url.pathname === '/' || url.pathname === '/index.html' || !/\.[a-z0-9]+$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const key = request.mode === 'navigate' && isPage(url) ? '/' : request;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((cached) => cached || fetch(request)),
  );
});
