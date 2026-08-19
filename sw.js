// ============================================================
// sw.js — Service Worker Kulturo
// Network-first pour JS/CSS/HTML, cache-first pour images/fonts
// ============================================================

const CACHE_NAME = "kulturo-v5";
const STATIC_ASSETS = [
  "/Kulturo/",
  "/Kulturo/icon-192.png",
  "/Kulturo/icon-512.png"
];

// Install — met en cache uniquement les assets statiques lourds
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // Une ressource momentanément indisponible ne doit pas annuler
      // l'installation complète du service worker.
      .then(cache => Promise.allSettled(STATIC_ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

// Activate — supprime les anciens caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — stratégie selon la requête
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Supabase & APIs externes → network-only
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("api.themoviedb.org") ||
    url.hostname.includes("openlibrary.org") ||
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
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
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

  // Images, fonts → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => new Response(null, { status: 504 }));
    })
  );
});
