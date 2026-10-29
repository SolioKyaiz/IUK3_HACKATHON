// App-shell service worker. Map tiles are never cached here (OSM tile policy:
// no offline tile download); saved plans are kept by the app in localStorage.
const CACHE = "suuplan-shell-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/kg_border.geojson", "/icons/icon-192.png"];

// Precache the shell plus the hashed JS/CSS that index.html references, so the very first
// visit is enough for saved plans to open offline later.
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    const html = await (await fetch("/index.html", { cache: "no-store" })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await c.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // tiles, APIs on other hosts
  if (url.pathname.startsWith("/api/")) {
    // Snow layer: network first, cached copy when offline. Other API calls: network only.
    if (url.pathname === "/api/snow/basins.geojson") e.respondWith(networkFirst(e.request));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }
  // Hashed build assets and fonts: cache first.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    }))
  );
});

function networkFirst(req) {
  return fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req));
}
