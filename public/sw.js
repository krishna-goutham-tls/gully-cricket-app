/*
 * Boundary service worker — deliberately small and conservative.
 *
 * The job is to make the home-screen app launch instantly and survive a dead
 * signal at the ground. It is NOT allowed to make anyone look at stale cricket.
 *
 * Three rules keep it safe:
 *
 *  1. Convex is never touched. Scores travel over a WebSocket to a different
 *     origin; this worker bails on anything cross-origin, and service workers
 *     don't intercept WebSockets at all. Live scoring is unaffected by design.
 *  2. Only content-hashed files are served cache-first (`/_next/static/...`,
 *     icons). A hashed filename can't go stale — a new build means new names —
 *     so there is no version of this cache that can serve the wrong code.
 *  3. Pages are network-first. The freshest HTML always wins when there is a
 *     signal, and the cache is a fallback for when there isn't. That is what
 *     stops anyone getting pinned to an old build.
 *
 * Anything not covered by those rules is passed straight through, untouched,
 * exactly as if this file did not exist.
 *
 * Kill switch: if this ever misbehaves, replace the body of the fetch listener
 * with `return;` and bump VERSION. Clients pick it up on their next launch,
 * and the app falls back to plain network behaviour.
 */
const VERSION = "v1";
const STATIC_CACHE = `boundary-static-${VERSION}`;
const PAGE_CACHE = `boundary-pages-${VERSION}`;

self.addEventListener("install", () => {
  // Never leave someone stuck on an old worker waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Content-addressed: the filename changes whenever the bytes do. */
function isImmutable(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Mutations and anything non-GET go straight to the network.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Convex, fonts, anything not ours — not our business.
  if (url.origin !== self.location.origin) return;

  // React Server Component payloads must match the running build exactly,
  // so they are never cached.
  if (url.searchParams.has("_rsc")) return;

  if (isImmutable(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Only store real successes — never an error page or an opaque response.
  if (response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline: this page if we have it, otherwise the app shell.
    const hit = (await cache.match(request)) || (await cache.match("/"));
    if (hit) return hit;
    throw err;
  }
}
