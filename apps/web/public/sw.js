/* OpenLens service worker: keeps the feed and recently read stories available offline.
 * Strategy: network-first for pages and feed API calls (fall back to cache), cache-first for
 * hashed Next.js static assets. Studio and SSE are never cached. */
const VERSION = "openlens-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/studio") || url.pathname.includes("/studio/") || url.pathname.endsWith("/events")) return;
  if (req.headers.get("accept")?.includes("text/event-stream")) return;

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetchAndCache(req)));
    return;
  }
  const isPage = req.mode === "navigate";
  const isFeedApi = url.pathname.startsWith("/v1/feed") || /\/v1\/stories\/[^/]+$/.test(url.pathname);
  if (isPage || isFeedApi) {
    event.respondWith(fetchAndCache(req).catch(() => caches.match(req).then((hit) => hit || caches.match("/"))));
  }
});

function fetchAndCache(req) {
  return fetch(req).then((res) => {
    if (res.ok && res.type !== "opaque") {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
}
