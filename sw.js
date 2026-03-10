// ============================================================
// sw.js — Service Worker Kulturo
// Cache-first pour les assets statiques, network-first pour Supabase
// ============================================================

const CACHE_NAME = "kulturo-v1";
const STATIC_ASSETS = [
  "/Kulturo/",
  "/Kulturo/index.html",
  "/Kulturo/style.css",
  "/Kulturo/app.js",
  "/Kulturo/api.js",
  "/Kulturo/supabase.js",
  "/Kulturo/config.js",
  "/Kulturo/icon-192.png",
  "/Kulturo/icon-512.png",
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=Playfair+Display:wght@700;900&display=swap"
];

// Install — met en cache les assets statiques
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
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
  const url = new URL(e.request.url);

  // Supabase & APIs externes → network-first (pas de cache)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("api.themoviedb.org") ||
    url.hostname.includes("api.rawg.io") ||
    url.hostname.includes("openlibrary.org") ||
    url.hostname.includes("api.groq.com")
  ) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: "offline" }), {
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    return;
  }

  // Assets statiques → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match("/Kulturo/index.html"));
    })
  );
});
