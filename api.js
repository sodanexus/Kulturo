// ============================================================
// api.js — Intégrations APIs médias
// TMDb · IGDB · Open Library · Google Books
// ============================================================

import { Auth } from "./supabase.js";

// Identifiants officiels TMDb. Les libellés sont gardés côté client pour
// éviter deux requêtes supplémentaires à chaque chargement des sorties.
const TMDB_GENRE_LABELS = {
  movie: {
    28: "Action", 12: "Aventure", 16: "Animation", 35: "Comédie",
    80: "Crime", 99: "Documentaire", 18: "Drame", 10751: "Familial",
    14: "Fantastique", 36: "Histoire", 27: "Horreur", 10402: "Musique",
    9648: "Mystère", 10749: "Romance", 878: "Science-fiction",
    10770: "Téléfilm", 53: "Thriller", 10752: "Guerre", 37: "Western",
  },
  tv: {
    10759: "Action & aventure", 16: "Animation", 35: "Comédie",
    80: "Crime", 99: "Documentaire", 18: "Drame", 10751: "Familial",
    10762: "Enfants", 9648: "Mystère", 10763: "Actualités",
    10764: "Télé-réalité", 10765: "Science-fiction & fantastique",
    10766: "Soap", 10767: "Talk-show", 10768: "Guerre & politique",
    37: "Western",
  },
};

function tmdbGenreData(ids, subtype) {
  const genreIds = Array.isArray(ids)
    ? [...new Set(ids.map(Number).filter(Number.isFinite))]
    : [];
  const labels = TMDB_GENRE_LABELS[subtype] || {};
  const genres = genreIds.map(id => labels[id]).filter(Boolean);
  return {
    genre_ids: genreIds,
    genres,
    genre: genres.join(", ") || null,
  };
}

// ── Utilitaire fetch avec timeout ────────────────────────────
async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const { timeoutMs = 8000, ...fetchOptions } = options;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function edgeFunctionHeaders() {
  const accessToken = await Auth.getAccessToken();
  if (!accessToken) throw new Error("Session expirée");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
  };
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
      ...tmdbGenreData(m.genre_ids, "movie"),
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
      ...tmdbGenreData(s.genre_ids, "tv"),
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

  // Sorties cinéma et nouvelles séries prévues dans les 6 prochains mois.
  // Les films exigent une date de sortie française. Pour les séries, TMDb ne
  // possède pas de date régionale équivalente : on exige donc soit une offre
  // de diffusion référencée en France, soit une production d'origine française.
  async upcoming() {
    if (!this.available()) return [];

    const base = CONFIG.tmdb.baseUrl;
    const key  = CONFIG.tmdb.apiKey;
    const today = new Date();
    const end = new Date(today);
    // Un ajout de mois peut sauter en mars depuis un 31 janvier.
    // 183 jours donne une fenêtre stable d'environ six mois.
    end.setDate(end.getDate() + 183);
    const isoDate = date => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const startDate = isoDate(today);
    const endDate = isoDate(end);
    const common = `api_key=${key}&language=fr-FR&include_adult=false&sort_by=popularity.desc`;

    // Priorité à la sortie cinéma (3), puis à la sortie limitée (2).
    const movieUrl = page => `${base}/discover/movie?${common}&region=FR&include_video=false&with_release_type=3%7C2&release_date.gte=${startDate}&release_date.lte=${endDate}&page=${page}`;
    const tvWindow = `timezone=Europe%2FParis&include_null_first_air_dates=false&first_air_date.gte=${startDate}&first_air_date.lte=${endDate}`;
    const tvFranceUrl = page => `${base}/discover/tv?${common}&${tvWindow}&watch_region=FR&with_watch_monetization_types=flatrate%7Cfree%7Cads&page=${page}`;
    // Les offres de visionnage TMDb sont souvent renseignées tardivement pour
    // les séries à venir. Ce second filet conserve uniquement les grands
    // diffuseurs disponibles en France et les principales chaînes françaises.
    const franceBroadcasterIds = [
      213, 2739, 2552, 3186, 4330, 1024, // Netflix, Disney+, Apple TV, Max, Paramount+, Prime Video
      285, 361, 290, 712, 249, 1628,     // Canal+, France 2, TF1, M6, France 3, ARTE
    ].join("%7C");
    const tvBroadcasterUrl = page => `${base}/discover/tv?${common}&${tvWindow}&with_networks=${franceBroadcasterIds}&page=${page}`;
    const tvFrenchOriginUrl = page => `${base}/discover/tv?${common}&${tvWindow}&with_origin_country=FR&page=${page}`;

    const requests = await Promise.allSettled([
      apiFetch(movieUrl(1)), apiFetch(movieUrl(2)),
      apiFetch(tvFranceUrl(1)), apiFetch(tvFranceUrl(2)),
      apiFetch(tvBroadcasterUrl(1)), apiFetch(tvBroadcasterUrl(2)), apiFetch(tvBroadcasterUrl(3)),
      apiFetch(tvFrenchOriginUrl(1)), apiFetch(tvFrenchOriginUrl(2)),
    ]);
    if (requests.every(r => r.status === "rejected")) {
      throw new Error("TMDB indisponible");
    }

    const moviePages = requests.slice(0, 2)
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value.results || []);
    const tvFrancePages = requests.slice(2, 4)
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value.results || []);
    const tvBroadcasterPages = requests.slice(4, 7)
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value.results || []);
    const tvFrenchOriginPages = requests.slice(7)
      .filter(r => r.status === "fulfilled")
      .flatMap(r => r.value.results || []);
    const tvFranceIds = new Set(tvFrancePages.map(item => String(item.id)));
    const tvBroadcasterIds = new Set(tvBroadcasterPages.map(item => String(item.id)));
    const tvFrenchOriginIds = new Set(tvFrenchOriginPages.map(item => String(item.id)));
    const tvPages = [...tvFrancePages, ...tvBroadcasterPages, ...tvFrenchOriginPages];

    const movies = moviePages.map(m => ({
      external_id:  String(m.id),
      title:        m.title,
      cover_url:    m.poster_path ? `${CONFIG.tmdb.imageBase}${m.poster_path}` : null,
      description:  m.overview || null,
      release_year: m.release_date ? Number.parseInt(m.release_date.slice(0, 4), 10) : null,
      release_date: m.release_date || null,
      ...tmdbGenreData(m.genre_ids, "movie"),
      author:       null,
      platform:     null,
      source_api:   "tmdb",
      subtype:      "movie",
      upcoming_type:"movie",
      availability_label: "Sortie France",
      popularity:   m.popularity || 0,
    }));

    const shows = tvPages.map(s => {
      const id = String(s.id);
      const hasFrenchMetadata = Boolean(String(s.overview || "").trim())
        || Boolean(s.name && s.original_name && s.name !== s.original_name);
      const isFrenchOrigin = tvFrenchOriginIds.has(id);
      const isDirectlyAvailable = tvFranceIds.has(id);
      const isFranceBroadcaster = tvBroadcasterIds.has(id);
      const languageIsLocallyCommon = ["fr", "en"].includes(String(s.original_language || "").toLowerCase());
      return {
        external_id:  id,
        title:        s.name,
        cover_url:    s.poster_path ? `${CONFIG.tmdb.imageBase}${s.poster_path}` : null,
        description:  s.overview || null,
        release_year: s.first_air_date ? Number.parseInt(s.first_air_date.slice(0, 4), 10) : null,
        release_date: s.first_air_date || null,
        ...tmdbGenreData(s.genre_ids, "tv"),
        author:       null,
        platform:     null,
        source_api:   "tmdb",
        subtype:      "tv",
        upcoming_type:"tv",
        availability_label: isDirectlyAvailable
          ? "Diffusion France"
          : (isFrenchOrigin ? "Production française" : (isFranceBroadcaster ? "Diffuseur présent en France" : null)),
        france_qualified: isDirectlyAvailable || isFrenchOrigin
          || (isFranceBroadcaster && (languageIsLocallyCommon || hasFrenchMetadata)),
        popularity:   s.popularity || 0,
      };
    });

    const unique = new Map();
    [...movies, ...shows].forEach(item => {
      // Une œuvre sans date précise dans la fenêtre ne doit pas remonter dans
      // Kulturo, même si la source la classe parmi ses nouveautés.
      if (!item.release_date || item.release_date < startDate || item.release_date > endDate) return;
      if (item.subtype === "tv" && !item.france_qualified) return;
      unique.set(`${item.subtype}:${item.external_id}`, item);
    });

    return [...unique.values()]
      .sort((a, b) => a.release_date.localeCompare(b.release_date) || b.popularity - a.popularity)
      .map(({ france_qualified, ...item }) => item);
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
    const data = await apiFetch(proxyUrl, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ query }),
    });
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

  async upcoming() {
    if (!this.available()) return [];
    const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
    const data = await apiFetch(proxyUrl, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ action: "upcoming" }),
      timeoutMs: 15000,
    });
    if (data?.error) throw new Error(data.error);

    const genreLabels = {
      "adventure": "Aventure",
      "arcade": "Arcade",
      "card & board game": "Cartes & plateau",
      "fighting": "Combat",
      "hack and slash/beat 'em up": "Hack'n slash",
      "indie": "Indépendant",
      "music": "Musique",
      "pinball": "Flipper",
      "platform": "Plateforme",
      "point-and-click": "Point & click",
      "puzzle": "Réflexion",
      "quiz/trivia": "Quiz",
      "racing": "Course",
      "real time strategy (rts)": "Stratégie temps réel",
      "role-playing (rpg)": "RPG",
      "shooter": "Tir",
      "simulator": "Simulation",
      "sport": "Sport",
      "strategy": "Stratégie",
      "tactical": "Tactique",
      "turn-based strategy (tbs)": "Stratégie au tour par tour",
      "visual novel": "Roman visuel",
    };
    const localizeGenre = value => genreLabels[String(value || "").toLocaleLowerCase("en-US")] || value;

    return (Array.isArray(data) ? data : []).map(g => {
      const genres = (g.genres || []).map(item => localizeGenre(item.name)).filter(Boolean);
      const releaseDate = typeof g.release_date === "string" ? g.release_date : null;
      const availabilityLabel = g.release_region === "Europe"
        ? "Sortie Europe"
        : g.release_region === "International"
          ? "Date internationale"
          : "Sortie mondiale";
      return {
        external_id:  String(g.id),
        title:        g.name,
        cover_url:    g.cover?.image_id
          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.webp`
          : null,
        // La traduction complète reste chargée uniquement à l'ouverture de la
        // fiche afin d'éviter des dizaines de requêtes Groq inutiles.
        description:  null,
        release_year: releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) : null,
        release_date: releaseDate,
        date_precision: g.date_precision === "month" ? "month" : "day",
        genres,
        genre:        genres.join(", ") || null,
        author:       g.involved_companies?.find(item => item.developer)?.company?.name
                      || g.involved_companies?.[0]?.company?.name || null,
        platform:     g.platforms?.map(item => item.name).filter(Boolean).join(", ") || null,
        source_api:   "igdb",
        media_type:   "game",
        subtype:      null,
        upcoming_type:"game",
        availability_label: availabilityLabel,
        popularity:   Number(g.hypes || 0),
      };
    }).filter(item => item.title && item.release_date);
  },
};

// ── Livres — Open Library ────────────────────────────────────
export const OpenLibrary = {
  available() { return true; }, // pas de clé requise

  async search(query) {
    const url = `${CONFIG.openLibrary.baseUrl}/search.json?q=${encodeURIComponent(query)}&limit=6&fields=key,title,author_name,first_publish_year,subject,cover_i`;
    const data = await apiFetch(url);
    return (data.docs || []).map(b => ({
      external_id:  b.key?.replace("/works/", "") || null,
      title:        b.title,
      cover_url:    b.cover_i
        ? `${CONFIG.openLibrary.coverBase}/${b.cover_i}-M.jpg`
        : null,
      // Le résumé complet et sa traduction sont chargés dans la fiche détail.
      description:  null,
      release_year: b.first_publish_year || null,
      genre:        b.subject?.slice(0, 3).join(", ") || null,
      author:       b.author_name?.[0] || null,
      platform:     null,
      source_api:   "openlibrary",
    }));
  },
};

// ── Parutions françaises — Google Books ─────────────────────
// Google Books est une source opportuniste : Kulturo conserve uniquement les
// éditions françaises futures dotées d'une date assez précise et n'invente
// aucun résultat lorsqu'aucune parution fiable n'est fournie. Lors de l'ajout,
// le livre reste enregistré avec la source "manual", déjà autorisée par le
// schéma Kulturo : aucune migration n'est nécessaire.
async function googleBooksProxy(payload, timeoutMs = 20000) {
  const functionName = CONFIG?.googleBooks?.proxyFunction || "google-books-proxy";
  const proxyUrl = `${CONFIG.supabase.url}/functions/v1/${functionName}`;
  const data = await apiFetch(proxyUrl, {
    method: "POST",
    headers: await edgeFunctionHeaders(),
    body: JSON.stringify(payload),
    timeoutMs,
  });
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.items) ? data.items : [];
}

export const GoogleBooks = {
  available() {
    return Boolean(CONFIG?.supabase?.url);
  },

  async upcoming() {
    if (!this.available()) return [];
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 183);
    const isoDate = date => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const startDate = isoDate(today);
    const endDate = isoDate(end);
    const items = await googleBooksProxy({ action: "upcoming" });

    const normalizePublishedDate = value => {
      const raw = String(value || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw, precision: "day" };
      if (/^\d{4}-\d{2}$/.test(raw)) return { date: `${raw}-01`, precision: "month" };
      return null;
    };
    const bookGenreLabels = {
      "art": "Arts",
      "biography & autobiography": "Biographie",
      "business & economics": "Économie",
      "comics & graphic novels": "BD & romans graphiques",
      "contemporary": "Contemporain",
      "fantasy": "Fantasy",
      "fantasy & magic": "Fantasy & magie",
      "fiction": "Fiction",
      "historical": "Historique",
      "history": "Histoire",
      "juvenile fiction": "Jeunesse",
      "juvenile nonfiction": "Jeunesse",
      "literary criticism": "Critique littéraire",
      "mystery & detective": "Mystère & policier",
      "poetry": "Poésie",
      "psychology": "Psychologie",
      "religion": "Religion",
      "romance": "Romance",
      "science": "Sciences",
      "science fiction": "Science-fiction",
      "self-help": "Développement personnel",
      "social science": "Sciences humaines",
      "thrillers": "Thriller",
    };
    const localizeBookCategory = value => String(value || "")
      .split("/")
      .map(part => part.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map(part => bookGenreLabels[part.toLocaleLowerCase("en-US")] || part)
      .join(" · ");
    const unique = new Map();
    items.forEach(item => {
      const info = item.volumeInfo || {};
      const publication = normalizePublishedDate(info.publishedDate);
      const image = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
      if (!publication || publication.date < startDate || publication.date > endDate) return;
      if (String(info.language || "").toLowerCase() !== "fr") return;
      if (!info.title || !image) return;

      const authors = (info.authors || []).filter(Boolean);
      const categories = [...new Set((info.categories || [])
        .map(localizeBookCategory)
        .filter(Boolean))].slice(0, 3);
      const identity = `${normalizeBookText(info.title)}|${normalizeBookText(authors.join(" "))}`;
      const normalized = {
        // L'identifiant Google reste transitoire. Les doublons en base sont
        // détectés par titre, sans introduire une nouvelle valeur source_api.
        external_id:  null,
        upcoming_id:  `googlebooks:${item.id}`,
        title:        info.title,
        cover_url:    String(image).replace(/^http:/, "https:"),
        description:  plainBookDescription(info.description),
        release_year: Number.parseInt(publication.date.slice(0, 4), 10),
        release_date: publication.date,
        date_precision: publication.precision,
        genres:       categories,
        genre:        categories.join(", ") || null,
        author:       authors.join(", ") || null,
        platform:     null,
        publisher:    info.publisher || null,
        source_api:   "manual",
        media_type:   "book",
        subtype:      null,
        upcoming_type:"book",
        availability_label: "Édition française",
        external_url: info.infoLink || `https://books.google.com/books?id=${encodeURIComponent(item.id)}`,
        external_label: "Google Books",
        popularity:   Number(info.ratingsCount || 0),
      };
      const current = unique.get(identity);
      if (!current || normalized.release_date < current.release_date) unique.set(identity, normalized);
    });

    return [...unique.values()].sort((a, b) =>
      a.release_date.localeCompare(b.release_date) || b.popularity - a.popularity
    );
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

    // Casting top 4. Les identifiants IMDb restent transitoires : ils servent
    // uniquement à produire des liens exacts et ne modifient pas le schéma SQL.
    const topCast = c?.cast?.slice(0, 4) || [];
    const cast_members = topCast.map(x => x.name).join(", ") || null;
    const castExternalIds = await Promise.allSettled(topCast.map(person =>
      apiFetch(`${base}/person/${person.id}/external_ids?api_key=${key}`)
    ));
    const cast_people = topCast.map((person, index) => ({
      id: person.id,
      name: person.name,
      imdb_id: castExternalIds[index]?.status === "fulfilled"
        ? (castExternalIds[index].value?.imdb_id || null)
        : null,
    }));

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

    return { backdrop_url, description, directors, cast_members, cast_people, duration, seasons_count, episodes_count, air_status, watch_providers };
  },
};

export const IGDBDetails = {
  async fetch(externalId) {
    if (!CONFIG?.supabase?.url || !CONFIG?.igdb?.clientId) return null;
    const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
    const data = await apiFetch(proxyUrl, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ id: Number(externalId) }),
    });
    const g = Array.isArray(data) ? data[0] : data;
    if (!g) return null;

    const developer  = g.involved_companies?.find(c => c.developer)?.company?.name || null;
    const publisher  = g.involved_companies?.find(c => c.publisher)?.company?.name || null;
    const platform   = g.platforms?.map(x => x.name).join(", ") || null;
    // Le proxy IGDB traduit normalement déjà le résumé. Ce second passage
    // couvre une ancienne version du proxy encore déployée ou un texte resté anglais.
    const description = g.summary ? await translateViaProxy(g.summary) : null;

    return { developer, publisher, platform, description };
  },
};

async function translateViaProxy(text) {
  if (!text || !CONFIG?.supabase?.url) return text;
  // Détection légère : suffisamment stricte pour ne pas conserver par erreur
  // un résumé IGDB anglais, mais évite une requête si le texte est déjà français.
  const sample = ` ${String(text).toLocaleLowerCase("fr-FR")} `;
  const frenchSignals = sample.match(/\b(le|la|les|un|une|des|du|de|dans|avec|pour|qui|que|est|sont|sur|aux)\b/g) || [];
  const looksFrench = /[àâçéèêëîïôùûüÿœ]/i.test(sample) || frenchSignals.length >= 3;
  if (looksFrench) return text;
  try {
    const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/groq-proxy`, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      // Le navigateur n'a pas le droit de choisir le prompt ou le modèle.
      // Le proxy applique lui-même une consigne de traduction fixe.
      body: JSON.stringify({ text }),
    });
    return data.translation?.trim() || text;
  } catch {
    return text;
  }
}

export const OpenLibraryDetails = {
  async fetch(externalId, fallback = {}) {
    const [workResult, editionsResult] = await Promise.allSettled([
      externalId ? apiFetch(`${CONFIG.openLibrary.baseUrl}/works/${externalId}.json`) : Promise.resolve(null),
      externalId ? apiFetch(`${CONFIG.openLibrary.baseUrl}/works/${externalId}/editions.json?limit=20`) : Promise.resolve({ entries: [] }),
    ]);
    const work = workResult.status === "fulfilled" ? workResult.value : null;
    const editions = editionsResult.status === "fulfilled" ? (editionsResult.value?.entries || []) : [];
    const descriptionValue = value => typeof value === "string" ? value : value?.value || null;
    const editionWithDescription = editions.find(edition => descriptionValue(edition.description));
    const editionWithPages = editions.find(edition => edition.number_of_pages);
    const editionWithIsbn = editions.find(edition => edition.isbn_13?.[0] || edition.isbn_10?.[0]);
    const editionWithPublisher = editions.find(edition => edition.publishers?.[0]);

    let rawDescription = descriptionValue(work?.description)
      || descriptionValue(editionWithDescription?.description)
      || null;
    let page_count = editionWithPages?.number_of_pages || null;
    let isbn = editionWithIsbn?.isbn_13?.[0] || editionWithIsbn?.isbn_10?.[0] || fallback.isbn || null;
    let publisher = editionWithPublisher?.publishers?.[0] || null;

    // Open Library ne possède pas de résumé pour toutes les œuvres. Google
    // Books sert uniquement de secours, en privilégiant une édition française.
    if (!rawDescription) {
      const google = await fetchGoogleBookDetails({
        title: fallback.title,
        author: fallback.author,
        isbn,
      });
      rawDescription = google?.description || null;
      page_count ||= google?.page_count || null;
      isbn ||= google?.isbn || null;
      publisher ||= google?.publisher || null;
    }

    if (!work && !editions.length && !rawDescription) return null;
    const cleanDescription = plainBookDescription(rawDescription);
    const description = cleanDescription ? await translateViaProxy(cleanDescription) : null;
    return { description, page_count, isbn, publisher };
  },
};

function normalizeBookText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function plainBookDescription(value) {
  if (!value) return null;
  const element = document.createElement("textarea");
  element.innerHTML = String(value).replace(/<[^>]*>/g, " ");
  return element.value.replace(/\s+/g, " ").trim() || null;
}

async function fetchGoogleBookDetails({ title, author, isbn }) {
  if (!title && !isbn) return null;

  try {
    const items = await googleBooksProxy({ action: "details", title, author, isbn });
    const expectedTitle = normalizeBookText(title);
    const expectedAuthor = normalizeBookText(author);
    const candidates = items
      .filter(item => item.volumeInfo?.description)
      .map(item => {
        const info = item.volumeInfo;
        const candidateTitle = normalizeBookText(info.title);
        const candidateAuthors = normalizeBookText((info.authors || []).join(" "));
        const score = (expectedTitle && candidateTitle === expectedTitle ? 6 : 0)
          + (expectedTitle && candidateTitle.includes(expectedTitle) ? 3 : 0)
          + (expectedAuthor && candidateAuthors.includes(expectedAuthor) ? 3 : 0)
          + (info.language === "fr" ? 2 : 0);
        return { info, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best?.info || (!isbn && best.score < 3)) return null;
    const info = best.info;
    const identifiers = info.industryIdentifiers || [];
    return {
      description: plainBookDescription(info.description),
      page_count: info.pageCount || null,
      publisher: info.publisher || null,
      isbn: identifiers.find(item => item.type === "ISBN_13")?.identifier
        || identifiers.find(item => item.type === "ISBN_10")?.identifier
        || null,
    };
  } catch {
    return null;
  }
}

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
    // On ignore les erreurs serveur (5xx) qui sont hors de notre contrôle
    if (!err.message?.includes("HTTP 5")) {
      console.error("[API] Erreur recherche :", err);
    }
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
