// Service worker simple: cachea la app para que abra rápido y offline.
const CACHE = "activaciones-v17";
const ASSETS = [
  ".", "index.html", "styles.css", "app.js", "config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "icons/favicon.png", "img/botella.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Nunca cachear las llamadas al cerebro (Apps Script)
  if (url.includes("script.google.com")) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
