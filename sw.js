/* Bankers Voice India — service worker: app shell offline, never caches API calls */
const V = 'bv-v3';
const ASSETS = ['./', 'index.html', 'style.css', 'common.js', 'app.js', 'supabase.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'dm-serif-display-latin-400-normal.woff2', 'manrope-latin-400-normal.woff2', 'manrope-latin-600-normal.woff2', 'manrope-latin-800-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const fresh = r.mode === 'navigate' || /\.(html|js|css)$/.test(new URL(r.url).pathname);
  e.respondWith(fresh
    ? fetch(r).then(res => { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html')))
    : caches.match(r).then(m => m || fetch(r).then(res => { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); return res; })));
});
