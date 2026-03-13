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
    const base = CONFIG.tmdb.baseUrl;
    const key  = CONFIG.tmdb.apiKey;
    const lang = "language=fr-FR";

    const [movies, shows] = await Promise.allSettled([
      apiFetch(`${base}/search/movie?api_key=${key}&query=${encodeURIComponent(query)}&${lang}`),
      apiFetch(`${base}/search/tv?api_key=${key}&query=${encodeURIComponent(query)}&${lang}`),
    ]);

    const normalizeMovie = m => ({
      external_id:  String(m.id),
      title:        m.title,
      cover_url:    m.poster_path ? `${CONFIG.tmdb.imageBase}${m.poster_path}` : null,
      description:  m.overview,
      release_year: m.release_date ? Number.parseInt(m.release_date.slice(0, 4), 10) : null,
      genre:        null,
      author:       null,
      platform:     null,
      source_api:   "tmdb",
      subtype:      "movie",
    });

    const normalizeShow = s => ({
      external_id:  String(s.id),
      title:        s.name,
      cover_url:    s.poster_path ? `${CONFIG.tmdb.imageBase}${s.poster_path}` : null,
      description:  s.overview,
      release_year: s.first_air_date ? Number.parseInt(s.first_air_date.slice(0, 4), 10) : null,
      genre:        null,
      author:       null,
      platform:     null,
      source_api:   "tmdb",
      subtype:      "tv",
    });

    const movieResults = movies.status === "fulfilled" ? (movies.value.results || []).slice(0, 4).map(normalizeMovie) : [];
    const showResults  = shows.status  === "fulfilled" ? (shows.value.results  || []).slice(0, 4).map(normalizeShow)  : [];

    // Entrelace films et séries pour avoir un mix équilibré
    const merged = [];
    const max = Math.max(movieResults.length, showResults.length);
    for (let i = 0; i < max; i++) {
      if (movieResults[i]) merged.push(movieResults[i]);
      if (showResults[i])  merged.push(showResults[i]);
    }
    return merged.slice(0, 8);
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

// ── Détails enrichis ────────────────────────────────────────

export const TMDbDetails = {
  async fetch(externalId, subtype = "movie") {
    if (!CONFIG?.tmdb?.apiKey) return null;
    const key  = CONFIG.tmdb.apiKey;
    const base = CONFIG.tmdb.baseUrl;
    const ep   = subtype === "tv" ? "tv" : "movie";
    const lang = "language=fr-FR";

    const [main, credits, providers] = await Promise.allSettled([
      apiFetch(`${base}/${ep}/${externalId}?api_key=${key}&${lang}`),
      apiFetch(`${base}/${ep}/${externalId}/credits?api_key=${key}&${lang}`),
      apiFetch(`${base}/${ep}/${externalId}/watch/providers?api_key=${key}`),
    ]);

    const d = main.status === "fulfilled" ? main.value : null;
    const c = credits.status === "fulfilled" ? credits.value : null;
    const p = providers.status === "fulfilled" ? providers.value : null;

    if (!d) return null;

    // Réalisateur (film) ou créateur (série)
    let directors = null;
    if (ep === "movie" && c?.crew) {
      directors = c.crew.filter(x => x.job === "Director").map(x => x.name).slice(0, 2).join(", ") || null;
    } else if (ep === "tv" && d.created_by) {
      directors = d.created_by.map(x => x.name).slice(0, 2).join(", ") || null;
    }

    // Casting top 4
    const cast_members = c?.cast?.slice(0, 4).map(x => x.name).join(", ") || null;

    // Durée / saisons / épisodes
    const duration       = ep === "movie" ? (d.runtime || null) : null;
    const seasons_count  = ep === "tv" ? (d.number_of_seasons || null) : null;
    const episodes_count = ep === "tv" ? (d.number_of_episodes || null) : null;

    // Statut diffusion
    const statusMap = {
      "Ended": "Terminée", "Canceled": "Annulée", "Returning Series": "En cours",
      "In Production": "En production", "Planned": "Prévue", "Released": null,
    };
    const air_status = statusMap[d.status] || null;

    // Plateformes France
    const fr = p?.results?.FR;
    const providersList = [
      ...(fr?.flatrate || []),
      ...(fr?.free || []),
    ].map(x => x.provider_name).slice(0, 4);
    const watch_providers = providersList.length ? providersList.join(", ") : null;

    // Backdrop
    const backdrop_url = d.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}`
      : null;

    const description = d.overview || null;

    return { backdrop_url, description, directors, cast_members, duration, seasons_count, episodes_count, air_status, watch_providers };
  },
};

export const IGDBDetails = {
  async fetch(externalId) {
    if (!CONFIG?.supabase?.url || !CONFIG?.igdb?.clientId) return null;
    const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.supabase.anonKey}` },
      body: JSON.stringify({ id: Number(externalId) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const g = Array.isArray(data) ? data[0] : data;
    if (!g) return null;

    const developer  = g.involved_companies?.find(c => c.developer)?.company?.name || null;
    const publisher  = g.involved_companies?.find(c => c.publisher)?.company?.name || null;
    const platform   = g.platforms?.map(x => x.name).join(", ") || null;
    const description = g.summary || null;

    return { developer, publisher, platform, description };
  },
};

async function translateViaProxy(text) {
  if (!text || !CONFIG?.supabase?.url) return text;
  // Détection basique — si c'est déjà en français on ne translate pas
  const frWords = [" le ", " la ", " les ", " un ", " une ", " des ", " est ", " dans ", " que ", " qui "];
  const looksFrenh = frWords.some(w => text.toLowerCase().includes(w));
  if (looksFrenh) return text;
  try {
    const res = await fetch(`${CONFIG.supabase.url}/functions/v1/groq-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.supabase.anonKey}`,
      },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: `Traduis ce texte en français de façon naturelle. Réponds UNIQUEMENT avec la traduction, sans guillemets ni explication :\n\n${text}`,
        }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 400,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

export const OpenLibraryDetails = {
  async fetch(externalId) {
    if (!externalId) return null;
    try {
      const data = await apiFetch(`${CONFIG.openLibrary.baseUrl}/works/${externalId}.json`);
      const rawDescription = typeof data.description === "string"
        ? data.description
        : data.description?.value || null;

      const description = rawDescription
        ? await translateViaProxy(rawDescription)
        : null;

      // Éditions pour pages + ISBN
      const edData = await apiFetch(`${CONFIG.openLibrary.baseUrl}/works/${externalId}/editions.json?limit=1`);
      const ed = edData?.entries?.[0];
      const page_count = ed?.number_of_pages || null;
      const isbn = ed?.isbn_13?.[0] || ed?.isbn_10?.[0] || null;
      const publisher = ed?.publishers?.[0] || null;

      return { description, page_count, isbn, publisher };
    } catch { return null; }
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
