// ============================================================
// sw.js — Service Worker Kulturo
// Network-first pour JS/CSS/HTML, cache-first pour images/fonts
// ============================================================

const CACHE_PREFIX = "kulturo-";
const STATIC_CACHE = "kulturo-static-v3.4.9";
const COVER_CACHE = "kulturo-covers-v1";
const BACKDROP_CACHE = "kulturo-backdrops-v1";
const CURRENT_CACHES = new Set([STATIC_CACHE, COVER_CACHE, BACKDROP_CACHE]);
const LEGACY_IMAGE_CACHES = ["kulturo-images-v3"];
const MAX_COVER_ENTRIES = 240;
const MAX_BACKDROP_ENTRIES = 36;
const APP_SCOPE = new URL(self.registration?.scope || "./", self.location?.href || "https://kulturo.local/");
const appAsset = path => new URL(path, APP_SCOPE).href;
const APP_HOME = appAsset("./");
const STATIC_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "config.js",
  "app.js",
  "api.js",
  "supabase.js",
  "domain.js",
  "style.css",
  "styles/add-sheet.css",
  "styles/mobile-polish.css",
  "styles/enhancements.css",
  "features/add-flow.js",
  "features/async-gate.js",
  "features/backup-restore.js",
  "features/cover-accent.js",
  "features/detail-enrichment.js",
  "features/detail-session.js",
  "features/dialog-focus.js",
  "features/dom-updates.js",
  "features/insights.js",
  "features/journal.js",
  "features/journal-groups.js",
  "features/journal-navigation.js",
  "features/library-cache.js",
  "features/media-detail.js",
  "features/media-metadata.js",
  "features/profile.js",
  "features/request-client.js",
  "features/ui-actions.js",
  "features/ui-states.js",
  "features/upcoming.js",
  "logo.svg",
  "icon.svg?v=3.4.9",
  "icon-192.png?v=3.4.9",
  "icon-512.png?v=3.4.9",
].map(appAsset);
const EXTERNAL_APP_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm",
];

// Install — prépare l'application complète pour son premier démarrage hors
// ligne. Une ressource locale manquante conserve l'ancien worker fonctionnel.
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    // Supabase est importé dès le démarrage : sans ce module, l'interface ne
    // peut pas exploiter sa bibliothèque locale. Son cache fait donc partie de
    // l'installation, au même titre que les modules locaux.
    await cache.addAll(EXTERNAL_APP_ASSETS);
  })());
});

// L'utilisateur choisit le moment du rechargement depuis le bandeau Kulturo.
self.addEventListener("message", e => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function mediaImageCache(url) {
  const isBackdrop = /\/t\/p\/(?:w780|w1280|original)\//i.test(url.pathname);
  return isBackdrop
    ? { name: BACKDROP_CACHE, limit: MAX_BACKDROP_ENTRIES }
    : { name: COVER_CACHE, limit: MAX_COVER_ENTRIES };
}

function looksLikeImage(request, response) {
  const url = new URL(request.url);
  const contentType = response?.headers?.get("content-type") || "";
  return request.destination === "image" ||
    contentType.startsWith("image/") ||
    ["image.tmdb.org", "images.igdb.com", "covers.openlibrary.org"].includes(url.hostname) ||
    url.hostname.endsWith("googleusercontent.com") ||
    /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url.href);
}

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const overflow = keys.length - limit;
  if (overflow > 0) await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)));
}

// Plusieurs jaquettes arrivent souvent dans la même poignée de millisecondes.
// Une taille de cache était auparavant recalculée après chacune d'elles ; on
// regroupe désormais ces parcours coûteux en une seule opération par rafale.
const pendingCacheTrims = new Map();
function scheduleCacheTrim(cacheName, limit) {
  const pending = pendingCacheTrims.get(cacheName);
  if (pending) return pending;
  const task = new Promise(resolve => setTimeout(resolve, 160))
    .then(() => trimCache(cacheName, limit))
    .finally(() => pendingCacheTrims.delete(cacheName));
  pendingCacheTrims.set(cacheName, task);
  return task;
}

async function migrateLegacyImages() {
  const existingCaches = await caches.keys();
  for (const legacyName of LEGACY_IMAGE_CACHES) {
    if (!existingCaches.includes(legacyName)) continue;
    const legacy = await caches.open(legacyName);
    const requests = await legacy.keys();
    for (const request of requests) {
      const response = await legacy.match(request);
      if (!response || !looksLikeImage(request, response)) continue;
      const target = mediaImageCache(new URL(request.url));
      const cache = await caches.open(target.name);
      await cache.put(request, response);
    }
    await caches.delete(legacyName);
  }
  await Promise.all([
    trimCache(COVER_CACHE, MAX_COVER_ENTRIES),
    trimCache(BACKDROP_CACHE, MAX_BACKDROP_ENTRIES),
  ]);
}

// Activate — migre les anciennes images puis supprime uniquement les caches
// Kulturo devenus obsolètes.
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    await migrateLegacyImages();
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(key))
      .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isNetworkOnlyUrl(url) {
  return (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("api.themoviedb.org") ||
    url.hostname === "openlibrary.org" ||
    url.hostname === "www.googleapis.com" ||
    url.hostname === "books.googleapis.com" ||
    url.hostname.includes("api.groq.com") ||
    url.hostname === "id.twitch.tv" ||
    url.hostname === "api.igdb.com"
  );
}

async function cacheBounded(request, response, cacheName, limit) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await scheduleCacheTrim(cacheName, limit);
}

function keepCacheWriteAlive(event, responsePromise, cacheWrite) {
  event.waitUntil(responsePromise.then(() => cacheWrite()).catch(() => {}));
}

async function fetchWithTimeout(request, timeoutMs = 6_000) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  request.signal?.addEventListener("abort", relayAbort, { once: true });
  if (request.signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", relayAbort);
  }
}

// Fetch — stratégie selon la requête
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Supabase & APIs externes → network-only
  if (isNetworkOnlyUrl(url)) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // JS, CSS, HTML → network-first (toujours à jour)
  if (
    e.request.destination === "script" ||
    e.request.destination === "style" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".json") ||
    e.request.destination === "manifest" ||
    e.request.mode === "navigate"
  ) {
    let write = Promise.resolve();
    const responsePromise = fetchWithTimeout(e.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            write = caches.open(STATIC_CACHE).then(cache => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(e.request);
          if (cached) return cached;
          if (e.request.mode === "navigate") {
            return (await caches.match(APP_HOME)) || new Response("Hors ligne", { status: 503 });
          }
          return new Response("Hors ligne", { status: 503 });
        });
    e.respondWith(responsePromise);
    keepCacheWriteAlive(e, responsePromise, () => write);
    return;
  }

  const imageCache = mediaImageCache(url);

  // L'analyse de couleur demande explicitement les jaquettes en mode CORS.
  // Une ancienne réponse opaque, mise en cache par un <img> classique, peut
  // s'afficher mais ne peut pas être lue dans un canvas. Ces requêtes passent
  // donc d'abord par le réseau et remplacent l'éventuelle copie opaque par une
  // réponse CORS exploitable lorsque le serveur d'images l'autorise.
  if (e.request.destination === "image" && e.request.mode === "cors") {
    let write = Promise.resolve();
    const responsePromise = fetch(e.request)
        .then(response => {
          if (response.ok && response.type !== "opaque") {
            write = cacheBounded(e.request, response.clone(), imageCache.name, imageCache.limit);
          }
          return response;
        })
        .catch(async () => (await caches.match(e.request)) || new Response(null, { status: 504 }));
    e.respondWith(responsePromise);
    keepCacheWriteAlive(e, responsePromise, () => write);
    return;
  }

  // Jaquettes et arrière-plans disposent de budgets séparés : parcourir les
  // grandes bannières d'une fiche ne peut plus évincer toute la bibliothèque.
  if (e.request.destination === "image") {
    let write = Promise.resolve();
    const responsePromise = caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (!response || (!response.ok && response.type !== "opaque")) return response;
          const clone = response.clone();
          write = cacheBounded(e.request, clone, imageCache.name, imageCache.limit);
          return response;
        }).catch(() => new Response(null, { status: 504 }));
      });
    e.respondWith(responsePromise);
    keepCacheWriteAlive(e, responsePromise, () => write);
    return;
  }

  // Les polices restent avec les ressources statiques et ne consomment plus
  // le quota réservé aux jaquettes.
  if (e.request.destination === "font") {
    let write = Promise.resolve();
    const responsePromise = caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
        if (response?.ok) write = caches.open(STATIC_CACHE).then(cache => cache.put(e.request, response.clone()));
        return response;
      }).catch(() => new Response(null, { status: 504 })));
    e.respondWith(responsePromise);
    keepCacheWriteAlive(e, responsePromise, () => write);
  }
});
