/* Pureico service worker. The build fills in the version and the list of files to cache. */
const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const CACHE = `pureico-${VERSION}`;

// Cached files are content-hashed, so a Vary header added by the host never matters.
const MATCH = { ignoreVary: true };

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

/** Maps `/terms`, `/terms/` and `/terms/index.html` to the cached `/terms/`. */
function pageKey(url) {
  const path = url.pathname.replace(/index\.html$/, '');
  return path.endsWith('/') || /\.[a-z0-9]+$/i.test(path) ? path : `${path}/`;
}

async function respond(request) {
  const cache = await caches.open(CACHE);
  if (request.mode !== 'navigate') {
    return (await cache.match(request, MATCH)) || fetch(request);
  }
  const page = await cache.match(pageKey(new URL(request.url)), MATCH);
  if (page) return page;
  try {
    return await fetch(request);
  } catch (error) {
    // Offline and not cached: fall back to the converter itself.
    const shell = await cache.match('/', MATCH);
    if (shell) return shell;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
