/* RTA patient database — offline app shell.
   Patient records are never cached here; they live in IndexedDB and are
   written to NocoDB by the page when a connection is available. */
const SHELL = 'rta-shell-v1';
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

  // Pages: network first so updates arrive, cache as the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) {
          const c = await caches.open(SHELL);
          c.put('/index.html', r.clone());
        }
        return r;
      } catch {
        return (await caches.match(req))
          || (await caches.match('/index.html'))
          || (await caches.match('/'))
          || Response.error();
      }
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
