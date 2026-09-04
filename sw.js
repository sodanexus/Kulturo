// ============================================================
// sw.js — Service Worker Kulturo
// Network-first pour JS/CSS/HTML, cache-first pour images/fonts
// ============================================================

const CACHE_PREFIX = "kulturo-";
const STATIC_CACHE = "kulturo-static-v67";
const COVER_CACHE = "kulturo-covers-v1";
const BACKDROP_CACHE = "kulturo-backdrops-v1";
const CURRENT_CACHES = new Set([STATIC_CACHE, COVER_CACHE, BACKDROP_CACHE]);
const LEGACY_IMAGE_CACHES = ["kulturo-images-v3"];
const MAX_COVER_ENTRIES = 240;
const MAX_BACKDROP_ENTRIES = 36;
const APP_SCOPE = new URL(self.registration?.scope || "./", self.location?.href || "https://kulturo.local/");
const appAsset = path => new URL(path, APP_SCOPE).href;
const APP_HOME = appAsset("./");
const STATIC_ASSETS = ["./", "logo.svg", "icon.svg", "icon-192.png", "icon-512.png"].map(appAsset);

// Install — met en cache uniquement les assets statiques lourds
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      // Une ressource momentanément indisponible ne doit pas annuler
      // l'installation complète du service worker.
      .then(cache => Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset))))
  );
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
  await trimCache(cacheName, limit);
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
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(e.request, clone));
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
        })
    );
    return;
  }

  const imageCache = mediaImageCache(url);

  // L'analyse de couleur demande explicitement les jaquettes en mode CORS.
  // Une ancienne réponse opaque, mise en cache par un <img> classique, peut
  // s'afficher mais ne peut pas être lue dans un canvas. Ces requêtes passent
  // donc d'abord par le réseau et remplacent l'éventuelle copie opaque par une
  // réponse CORS exploitable lorsque le serveur d'images l'autorise.
  if (e.request.destination === "image" && e.request.mode === "cors") {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response.ok && response.type !== "opaque") {
            cacheBounded(e.request, response.clone(), imageCache.name, imageCache.limit).catch(() => {});
          }
          return response;
        })
        .catch(async () => (await caches.match(e.request)) || new Response(null, { status: 504 }))
    );
    return;
  }

  // Jaquettes et arrière-plans disposent de budgets séparés : parcourir les
  // grandes bannières d'une fiche ne peut plus évincer toute la bibliothèque.
  if (e.request.destination === "image") {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (!response || (!response.ok && response.type !== "opaque")) return response;
          const clone = response.clone();
          cacheBounded(e.request, clone, imageCache.name, imageCache.limit).catch(() => {});
          return response;
        }).catch(() => new Response(null, { status: 504 }));
      })
    );
    return;
  }

  // Les polices restent avec les ressources statiques et ne consomment plus
  // le quota réservé aux jaquettes.
  if (e.request.destination === "font") {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
        if (response?.ok) caches.open(STATIC_CACHE).then(cache => cache.put(e.request, response.clone()));
        return response;
      }))
    );
  }
});
