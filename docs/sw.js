const CACHE_VERSION = "v16";
const CACHE_NAME = "mental-math-" + CACHE_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: precache only. The new worker waits until the page asks it to take
// over (SKIP_WAITING), so a version never switches mid-round.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Activate: drop every cache except the current one, then control open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isPageRequest(request) {
  if (request.mode === "navigate") return true;
  const path = new URL(request.url).pathname;
  return path.endsWith("/index.html") || path.endsWith("/");
}

// Network-first for the page: online launches always get the latest HTML.
// Falls back to the cached page offline.
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() =>
      caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || caches.match("./index.html"))
    );
}

// Cache-first for icons, manifest, and other static files.
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    });
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(isPageRequest(event.request) ? networkFirst(event.request) : cacheFirst(event.request));
});
