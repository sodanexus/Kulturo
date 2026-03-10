// ============================================================
// api.js — Intégrations APIs médias (TMDb · IGDB · OpenLibrary)
// ============================================================

// ── Utilitaire fetch avec timeout ────────────────────────────
async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Normalisation commune ────────────────────────────────────
// Chaque adaptateur retourne un tableau d'objets normalisés :
// { external_id, title, cover_url, description, release_year,
//   genre, author, platform, source_api }

// ── Films — TMDb ─────────────────────────────────────────────
export const TMDb = {
  available() {
    return CONFIG?.tmdb?.apiKey && !CONFIG.tmdb.apiKey.includes("VOTRE_");
  },

  async search(query) {
    if (!this.available()) return [];
    const url = `${CONFIG.tmdb.baseUrl}/search/movie?api_key=${CONFIG.tmdb.apiKey}&query=${encodeURIComponent(query)}&language=fr-FR`;
    const data = await apiFetch(url);
    return (data.results || []).slice(0, 6).map(m => ({
      external_id:  String(m.id),
      title:        m.title,
      cover_url:    m.poster_path ? `${CONFIG.tmdb.imageBase}${m.poster_path}` : null,
      description:  m.overview,
      release_year: m.release_date ? parseInt(m.release_date) : null,
      genre:        null, // enrichi via detail si besoin
      author:       null,
      platform:     null,
      source_api:   "tmdb",
    }));
  },
};

// ── Jeux — IGDB (via Supabase Edge Function proxy) ───────────
// L'API IGDB bloque les appels directs navigateur (CORS).
// On passe par une Edge Function Supabase qui fait le proxy.
export const IGDB = {
  available() {
    return CONFIG?.supabase?.url && CONFIG?.igdb?.clientId && !CONFIG.igdb.clientId.includes("VOTRE_");
  },

  async search(query) {
    if (!this.available()) return [];
    const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${CONFIG.supabase.anonKey}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`IGDB proxy HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return (data || []).map(g => ({
      external_id:  String(g.id),
      title:        g.name,
      cover_url:    g.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.webp`
        : null,
      description:  g.summary || null,
      release_year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
      genre:        g.genres?.map(x => x.name).join(", ") || null,
      author:       g.involved_companies?.find(c => c.developer)?.company?.name
                    || g.involved_companies?.[0]?.company?.name || null,
      platform:     g.platforms?.map(x => x.name).join(", ") || null,
      source_api:   "igdb",
    }));
  },
};

// ── Livres — Open Library ────────────────────────────────────
export const OpenLibrary = {
  available() { return true; }, // pas de clé requise

  async search(query) {
    const url = `${CONFIG.openLibrary.baseUrl}/search.json?q=${encodeURIComponent(query)}&limit=6&fields=key,title,author_name,first_publish_year,subject,cover_i,first_sentence`;
    const data = await apiFetch(url);
    return (data.docs || []).map(b => ({
      external_id:  b.key?.replace("/works/", "") || null,
      title:        b.title,
      cover_url:    b.cover_i
        ? `${CONFIG.openLibrary.coverBase}/${b.cover_i}-M.jpg`
        : null,
      description:  b.first_sentence?.[0] || null,
      release_year: b.first_publish_year || null,
      genre:        b.subject?.slice(0, 3).join(", ") || null,
      author:       b.author_name?.[0] || null,
      platform:     null,
      source_api:   "openlibrary",
    }));
  },
};

// ── Dispatcher selon le type de média ───────────────────────
export async function searchMedia(query, mediaType) {
  if (!query || query.length < 2) return [];
  try {
    switch (mediaType) {
      case "movie": return await TMDb.search(query);
      case "game":  return await IGDB.search(query);
      case "book":  return await OpenLibrary.search(query);
      default:      return [];
    }
  } catch (err) {
    console.error("[API] Erreur recherche :", err);
    return [];
  }
}

// ── Disponibilité des APIs ───────────────────────────────────
export function apiAvailability() {
  return {
    movie: TMDb.available(),
    game:  IGDB.available(),
    book:  OpenLibrary.available(),
  };
}
