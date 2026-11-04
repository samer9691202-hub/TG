/* Vaulty service worker – caches the app shell so it works fully offline. Caches no user data. */
const CACHE = 'vaulty-v1.0.1';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'js/diag.js', 'js/crypto.js', 'js/generator.js', 'js/vault.js',
  'js/storage.js', 'js/i18n.js', 'js/app.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
