// ============================================================
// sw.js — Service Worker Kulturo
// Network-first pour JS/CSS/HTML, cache-first pour images/fonts
// ============================================================

const CACHE_PREFIX = "kulturo-";
const STATIC_CACHE = "kulturo-static-v37";
const IMAGE_CACHE = "kulturo-images-v1";
const CURRENT_CACHES = new Set([STATIC_CACHE, IMAGE_CACHE]);
const MAX_IMAGE_ENTRIES = 120;
const STATIC_ASSETS = [
  "/Kulturo/",
  "/Kulturo/icon-192.png",
  "/Kulturo/icon-512.png"
];

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

// Activate — supprime uniquement les anciens caches appartenant à Kulturo.
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(k))
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

async function cacheImage(request, response) {
  const cache = await caches.open(IMAGE_CACHE);
  await cache.put(request, response);
  const keys = await cache.keys();
  const overflow = keys.length - MAX_IMAGE_ENTRIES;
  if (overflow > 0) {
    await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)));
  }
}

// Fetch — stratégie selon la requête
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Supabase & APIs externes → network-only
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("api.themoviedb.org") ||
    url.hostname.includes("openlibrary.org") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("api.groq.com") ||
    url.hostname.includes("twitch.tv") ||
    url.hostname.includes("igdb.com")
  ) {
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
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html") ||
    url.pathname === "/Kulturo/" ||
    url.pathname === "/Kulturo"
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
            return (await caches.match("/Kulturo/")) || new Response("Hors ligne", { status: 503 });
          }
          return new Response("Hors ligne", { status: 503 });
        })
    );
    return;
  }

  // Images et polices → cache-first avec une limite pour ne pas grossir sans fin.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || (!response.ok && response.type !== "opaque")) return response;
        const clone = response.clone();
        cacheImage(e.request, clone).catch(() => {});
        return response;
      }).catch(() => new Response(null, { status: 504 }));
    })
  );
});
