/* RTA patient database — offline app shell.
   Patient records are never cached here; they live in IndexedDB and are
   written to NocoDB by the page when a connection is available. */
const SHELL = 'rta-shell-v2';
const FONTS = 'rta-fonts-v1';
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== FONTS).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache patient data or API responses.
  if (url.pathname.startsWith('/api/')) return;

  // Pages: serve the cached shell immediately, then refresh it in the
  // background. Network-first made the app wait for a TCP timeout on a bad
  // connection before showing anything.
  if (req.mode === 'navigate') {
    const refresh = fetch(req)
      .then(async r => {
        if (r.ok) {
          const c = await caches.open(SHELL);
          await c.put('/index.html', r.clone());
        }
        return r;
      })
      .catch(() => null);
    e.waitUntil(refresh);

    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = (await c.match('/index.html')) || (await c.match(req)) || (await c.match('/'));
      if (hit) return hit;
      const r = await refresh;
      return r || Response.error();
    })());
    return;
  }

  // The web font is optional, but cache it so the page keeps its look offline.
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
        return r;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  // Other local assets: cache first, then fill the cache from the network.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && r.ok) {
        const c = await caches.open(SHELL);
        c.put(req, r.clone());
      }
      return r;
    } catch {
      return Response.error();
    }
  })());
});
