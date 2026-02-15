/* Minimal service worker for offline support.
   - App shell + static assets: cache-first
   - Navigations: network-first, fallback to cache
*/

const CACHE_NAME = "gi-cocktail-v2";

const APP_SHELL = [
  "/request",
  "/request/order",
  "/offline.html",
  "/manifest.webmanifest",
  "/prawn-icon.png",
  "/apple-touch-icon.png",
  "/og-image.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/cocktails/placeholder.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  const path = url.pathname || "";
  if (path.startsWith("/_next/static/")) return true;
  if (path.startsWith("/cocktails/")) return true;
  if (path.startsWith("/icons/")) return true;
  return /\.(?:js|css|png|jpe?g|webp|svg|woff2)$/.test(path);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so we get fresh HTML when online.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then((hit) => hit || caches.match("/request") || caches.match("/offline.html")),
        ),
    );
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        });
      }),
    );
  }
});
