/* The Court Club service worker
   - Landing page and assets work offline.
   - Booking and payment routes are NEVER cached, so availability is always live.
   Bump VERSION whenever you change index.html or any precached file. */
const VERSION = 'v1';
const SHELL = `tcc-shell-${VERSION}`;
const RUNTIME = `tcc-runtime-${VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

/* Paths that must always hit the network */
const LIVE = /\/(book|api|checkout|payment|admin)(\/|$)/;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* 1. Live routes: network only, friendly page if offline */
  if (url.origin === location.origin && LIVE.test(url.pathname)) {
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).catch(() => caches.match('offline.html')));
    }
    return;
  }

  /* 2. Pages: network first, fall back to the cached landing page */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then(r => r || caches.match('index.html'))
            .then(r => r || caches.match('offline.html'))
        )
    );
    return;
  }

  /* 3. Google Fonts: stale-while-revalidate */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME).then(cache =>
        cache.match(req).then(hit => {
          const fresh = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
    return;
  }

  /* 4. Same-origin static files: cache first, refresh in background */
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(hit => {
        const fresh = fetch(req).then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || fresh;
      })
    );
  }
});
