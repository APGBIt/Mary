// Mary funciona sin conexión después de la primera visita: guarda la app, el modelo y el detector.
const V = 'mary-4.3.0';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(V).then((ca) => ca.put(r, c)); return res; })
      .catch(() => caches.match(r).then((m) => m || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => {
    if (res.ok && res.status === 200) { const c = res.clone(); caches.open(V).then((ca) => ca.put(r, c)); }
    return res;
  })));
});
