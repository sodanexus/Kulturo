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

// ── Jeux — IGDB (via Twitch) ─────────────────────────────────
// IGDB nécessite un token OAuth Twitch. On le récupère côté client
// via le endpoint proxy Twitch (client_credentials).
// Le token est mis en cache le temps de sa validité (~60 jours).
let _igdbToken = null;
let _igdbTokenExpiry = 0;

async function getIGDBToken() {
  if (_igdbToken && Date.now() < _igdbTokenExpiry) return _igdbToken;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CONFIG.igdb.clientId}&client_secret=${CONFIG.igdb.clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error("IGDB token failed");
  const data = await res.json();
  _igdbToken = data.access_token;
  _igdbTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _igdbToken;
}

export const IGDB = {
  available() {
    return CONFIG?.igdb?.clientId && !CONFIG.igdb.clientId.includes("VOTRE_");
  },

  async search(query) {
    if (!this.available()) return [];
    const token = await getIGDBToken();
    const body = `search "${query}"; fields name,cover.image_id,summary,first_release_date,genres.name,involved_companies.company.name,platforms.name; limit 6;`;
    const data = await apiFetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": CONFIG.igdb.clientId,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body,
    });
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
