/*
 * JARVIS 4.0 — Service worker (Phase 9)
 *
 * Principes :
 *  - Seul le shell statique et les assets immuables (/assets/*) sont mis en cache.
 *  - Les données dynamiques (/api/*) et les artefacts générés (/generated/*,
 *    /hyperframes/*, /reels/*) ne sont JAMAIS mis en cache (risque de données
 *    périmées et de dépassement de quota sur mobile).
 *  - Cache borné (nombre d'entrées + taille maximale par réponse).
 *  - Mises à jour gérées via SKIP_WAITING + controllerchange côté client.
 *  - Aucune notification Web Push : aucune API de notification n'est utilisée.
 */
const CACHE_NAME = "jarvis-v4-hud-shell";
const MAX_CACHE_ENTRIES = 60;
const MAX_CACHED_BYTES = 3 * 1024 * 1024;

const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/pwa-maskable-512x512.png",
];

// Chemins dynamiques/générés : jamais mis en cache, jamais servis depuis le cache.
const UNCACHABLE_PREFIXES = [
  "/api/",
  "/generated/",
  "/hyperframes/",
  "/reels/",
  "/ffmpeg-core/",
];

function isCacheable(pathname) {
  if (UNCACHABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  if (pathname.startsWith("/assets/")) return true;
  return APP_SHELL_URLS.includes(pathname);
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;
  const excess = keys.length - MAX_CACHE_ENTRIES;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("jarvis-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les données dynamiques et artefacts générés passent toujours par le réseau.
  if (!isCacheable(url.pathname)) return;

  // Navigation : réseau d'abord, repli sur le shell précaché en cas de perte
  // de connexion. Le HTML est rafraîchi à chaque réponse réseau réussie.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || (await caches.match("/")))
    );
    return;
  }

  // Assets statiques : réseau d'abord pour voir immédiatement les mises à jour,
  // avec repli sur le cache et cache borné.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const declaredSize = Number(response.headers.get("content-length") || 0);
          if (!declaredSize || declaredSize <= MAX_CACHED_BYTES) {
            const copy = response.clone();
            const requestCopy = request.clone();
            caches.open(CACHE_NAME).then(async (cache) => {
              await cache.put(requestCopy, copy);
              await trimCache(cache);
            });
          }
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
