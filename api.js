import { tmdbLogoCandidates, igdbLogoCandidates, steamGridLogoCandidates, manualLogoUrl } from "./features/title-logo.js";
import { startMeasurement } from "./features/performance.js";
import { searchBooksWithFallback } from "./features/hardcover.js";
import { normalizeISBN, isLatinTitle, preferredBookTitle, cleanBookGenres } from "./features/book-search.js";
import { isLikelyFrench } from "./features/text-language.js";
import { igdbMediaData, igdbPlayMinutes } from "./features/igdb-media.js";
import { tmdbTrailerUrl, tmdbCollection, igdbTrailerUrl, igdbCollection } from "./features/media-extras.js";
// ============================================================
// api.js — Intégrations APIs médias
// TMDb · IGDB · Hardcover · Open Library
// ============================================================

import { Auth } from "./supabase.js";
import { requestJSON } from "./features/request-client.js";

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
  return requestJSON(url, options);
}

async function edgeFunctionHeaders() {
  const accessToken = await Auth.getAccessToken();
  if (!accessToken) throw new Error("Session expirée");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
  };
}

// ── Jaquettes via cover-proxy ────────────────────────────────
// Certains hébergeurs d'images n'envoient pas d'en-tête CORS : leurs pixels ne
// sont lisibles (couleur d'accent) qu'en passant par la fonction cover-proxy.
export const CoverProxy = {
  async fetchBlob(url, options = {}) {
    if (!CONFIG?.supabase?.url) throw new Error("Supabase non configuré");
    const response = await fetch(`${CONFIG.supabase.url}/functions/v1/cover-proxy`, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ url }),
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`cover-proxy HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("cover-proxy : réponse non image");
    return blob;
  },
};

// ── Normalisation commune ────────────────────────────────────
// Chaque adaptateur retourne un tableau d'objets normalisés :
// { external_id, title, cover_url, description, release_year,
//   genre, author, platform, source_api }

// ── Films — TMDb ─────────────────────────────────────────────
function tmdbNormalizeMovie(m) {
  return {
    external_id:  String(m.id),
    title:        m.title,
    cover_url:    m.poster_path ? `${CONFIG.tmdb.imageBase}${m.poster_path}` : null,
    description:  m.overview,
    release_year: m.release_date ? Number.parseInt(m.release_date.slice(0, 4), 10) : null,
    ...tmdbGenreData(m.genre_ids || (m.genres || []).map(genre => genre.id), "movie"),
    author:       null,
    platform:     null,
    source_api:   "tmdb",
    subtype:      "movie",
  };
}

function tmdbNormalizeShow(s) {
  return {
    external_id:  String(s.id),
    title:        s.name,
    cover_url:    s.poster_path ? `${CONFIG.tmdb.imageBase}${s.poster_path}` : null,
    description:  s.overview,
    release_year: s.first_air_date ? Number.parseInt(s.first_air_date.slice(0, 4), 10) : null,
    ...tmdbGenreData(s.genre_ids || (s.genres || []).map(genre => genre.id), "tv"),
    author:       null,
    platform:     null,
    source_api:   "tmdb",
    subtype:      "tv",
  };
}

// Ouvrir une œuvre exacte depuis les catalogues créateurs.
export const CreatorCatalogWorks = {
  async hardcoverBook(id) {
    return Hardcover.fetch(id);
  },
  async openLibraryWork(id) {
    if (!/^OL\d+W$/.test(String(id || ""))) return null;
    const work = await apiFetch(`https://openlibrary.org/works/${id}.json`, { cachePolicy: "detail" });
    if (!work?.title) return null;
    return { external_id: id, title: work.title, media_type: "book", source_api: "openlibrary",
      cover_url: work.covers?.[0] ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-M.jpg` : null,
      description: typeof work.description === "string" ? work.description : work.description?.value || null,
      author: null, release_year: null };
  },
  async igdbGame(id) {
    const game = await fetchIgdbGame(id);
    if (!game) return null;
    return { external_id: String(game.id), title: game.name, media_type: "game", source_api: "igdb",
      cover_url: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.webp` : null,
      description: game.summary || null, release_year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
      author: game.involved_companies?.find(item => item.developer)?.company?.name || null };
  },
};

// Fiches créateurs et filmographies : informations publiques TMDb, jamais IMDb.
// Profils auteurs Open Library : correspondance stricte du nom pour éviter les homonymes.
// Hardcover est prioritaire pour les créateurs littéraires ; Open Library reste le repli.
export const HardcoverAuthors = {
  async find(name, options = {}) {
    const query = String(name || "").trim();
    if (!query) return null;
    const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/hardcover-proxy`, {
      method: "POST", headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ action: "author", query }), cachePolicy: "detail", signal: options.signal,
    });
    if (data?.error) throw new Error(data.error);
    return data?.profile || null;
  },
};

// Les éditeurs de livres sont des entités Hardcover, jamais des sociétés IGDB.
export const HardcoverPublishers = {
  async find(name, options = {}) {
    const query = String(name || "").trim();
    if (!query) return null;
    const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/hardcover-proxy`, {
      method: "POST", headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ action: "publisher", query }), cachePolicy: "detail", signal: options.signal,
    });
    if (data?.error) throw new Error(data.error);
    return data?.profile || null;
  },
};

export const OpenLibraryAuthors = {
  async find(name, options = {}) {
    const query = String(name || "").trim();
    if (!query) return null;
    const data = await apiFetch(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(query)}&limit=20`, { cachePolicy: "search", signal: options.signal });
    const norm = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return (data.docs || []).find(item => norm(item.name) === norm(query)) || null;
  },
  async details(key, options = {}) {
    const id = String(key || "").replace(/^\/authors\//, "");
    if (!/^OL\d+A$/.test(id)) return null;
    const [author, catalog] = await Promise.all([
      apiFetch(`https://openlibrary.org/authors/${id}.json`, { cachePolicy: "detail", signal: options.signal }),
      apiFetch(`https://openlibrary.org/authors/${id}/works.json?limit=100`, { cachePolicy: "detail", signal: options.signal }),
    ]);
    const description = typeof author.bio === "string" ? author.bio : author.bio?.value || "";
    return { id, name: author.name, biography: description, birthplace: author.birth_date ? `Naissance : ${author.birth_date}` : "",
      profile_url: author.photos?.[0] ? `https://covers.openlibrary.org/a/id/${author.photos[0]}-M.jpg` : null,
      url: `https://openlibrary.org/authors/${id}`,
      works: (catalog.entries || []).filter(work => /^\/works\/OL\d+W$/.test(work.key || "")).map(work => ({
        id: work.key.split("/").pop(), title: work.title, subtype: "book", external_id: work.key.split("/").pop(), source_api: "openlibrary",
        cover_url: work.covers?.[0] ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-M.jpg` : null,
        release_year: work.first_publish_date ? Number(String(work.first_publish_date).match(/\d{4}/)?.[0]) || null : null,
      })) };
  },
};

export const IGDBCompanies = {
  async find(name, role = "developer", options = {}) {
    if (!IGDB.available() || !String(name || "").trim()) return null;
    const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/igdb-proxy`, {
      method: "POST", headers: await edgeFunctionHeaders(), body: JSON.stringify({ action: "company", query: name, role }), cachePolicy: "detail", signal: options.signal,
    });
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

// Traductions et présentations manquantes via Groq,
// uniquement à partir du nom, du rôle et des œuvres réellement renvoyées.
export const CreatorDescriptions = {
  async enrich(profile, { name, role, signal } = {}) {
    if (!profile) return { text: "", generated: false };
    const source = String(profile.description || profile.biography || "").trim();
    if (source) {
      const result = await translateText(source.slice(0, 4500), { signal });
      return { text: result.text || source, generated: false };
    }
    const works = (profile.works || []).filter(work => work?.title).slice(0, 12)
      .map(work => String(work.title).slice(0, 130));
    if (!works.length || !CONFIG?.supabase?.url) return { text: "", generated: false };
    try {
      const result = await apiFetch(`${CONFIG.supabase.url}/functions/v1/groq-proxy`, {
        method: "POST", headers: await edgeFunctionHeaders(),
        body: JSON.stringify({ action: "creator-description", name: String(name || profile.name || "").slice(0, 140),
          role: String(role || "Créateur").slice(0, 80), works }),
        cachePolicy: "detail", timeoutMs: 20000, signal,
      });
      const text = String(result?.description || "").trim();
      return { text: text.slice(0, 900), generated: Boolean(text) };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("[Kulturo] Présentation Groq indisponible", error);
      return { text: "", generated: false };
    }
  },
};

export const TMDbPeople = {
  available() { return Boolean(CONFIG?.tmdb?.apiKey && !CONFIG.tmdb.apiKey.includes("VOTRE_")); },
  async find(name, options = {}) {
    if (!this.available() || !String(name || "").trim()) return null;
    const data = await apiFetch(`${CONFIG.tmdb.baseUrl}/search/person?api_key=${CONFIG.tmdb.apiKey}&language=fr-FR&query=${encodeURIComponent(name)}`, { cachePolicy: "search", signal: options.signal });
    const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
    return (data?.results || []).find(person => normalize(person.name) === normalize(name)) || null;
  },
  async details(id, options = {}) {
    if (!this.available() || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) return null;
    const base = `${CONFIG.tmdb.baseUrl}/person/${encodeURIComponent(id)}`;
    const query = `api_key=${CONFIG.tmdb.apiKey}&language=fr-FR`;
    const [person, credits] = await Promise.all([
      apiFetch(`${base}?${query}`, { cachePolicy: "detail", signal: options.signal }),
      apiFetch(`${base}/combined_credits?${query}`, { cachePolicy: "detail", signal: options.signal }),
    ]);
    if (!person?.id) return null;
    return {
      id: person.id, name: person.name, biography: person.biography || "",
      profile_url: person.profile_path ? `${CONFIG.tmdb.imageBase}${person.profile_path}` : null,
      known_for: person.known_for_department || "", birthplace: person.place_of_birth || "",
      works: [...(credits?.cast || []).map(item => ({ ...item, credit_role: "cast" })),
        ...(credits?.crew || []).filter(item => ["Director", "Creator", "Writer", "Screenplay"].includes(item.job)).map(item => ({ ...item, credit_role: "crew" }))]
        .filter(item => (item.media_type === "tv" || item.media_type === "movie") && item.id)
        .filter((item, index, items) => items.findIndex(other => other.id === item.id && other.media_type === item.media_type) === index)
        .sort((a, b) => (b.release_date || b.first_air_date || "").localeCompare(a.release_date || a.first_air_date || ""))
        .slice(0, 120).map(item => ({ id: item.id, subtype: item.media_type, title: item.title || item.name || "",
          release_year: Number((item.release_date || item.first_air_date || "").slice(0, 4)) || null,
          cover_url: item.poster_path ? `${CONFIG.tmdb.imageBase}${item.poster_path}` : null,
          role: item.credit_role === "crew" ? (item.job || "Création") : (item.character || "Interprétation") })),
    };
  },
};

export const TMDb = {
  available() {
    return CONFIG?.tmdb?.apiKey && !CONFIG.tmdb.apiKey.includes("VOTRE_");
  },

  async search(query, options = {}) {
    if (!this.available()) return [];
    const base = CONFIG.tmdb.baseUrl;
    const key  = CONFIG.tmdb.apiKey;
    const lang = "language=fr-FR";

    const [movies, shows] = await Promise.allSettled([
      apiFetch(`${base}/search/movie?api_key=${key}&query=${encodeURIComponent(query)}&${lang}`, { cachePolicy: "search", signal: options.signal }),
      apiFetch(`${base}/search/tv?api_key=${key}&query=${encodeURIComponent(query)}&${lang}`, { cachePolicy: "search", signal: options.signal }),
    ]);

    if (options.throwOnError && movies.status === "rejected" && shows.status === "rejected") throw movies.reason;
    const movieResults = movies.status === "fulfilled" ? (movies.value.results || []).slice(0, 4).map(tmdbNormalizeMovie) : [];
    const showResults  = shows.status  === "fulfilled" ? (shows.value.results  || []).slice(0, 4).map(tmdbNormalizeShow)  : [];

    // Entrelace films et séries pour avoir un mix équilibré
    const merged = [];
    const max = Math.max(movieResults.length, showResults.length);
    for (let i = 0; i < max; i++) {
      if (movieResults[i]) merged.push(movieResults[i]);
      if (showResults[i])  merged.push(showResults[i]);
    }
    return merged.slice(0, 8);
  },

  // Ajout rapide : fiche exacte à partir d'un lien TMDb ou IMDb.
  async byId(externalId, subtype = "movie", options = {}) {
    if (!this.available()) return null;
    const kind = subtype === "tv" ? "tv" : "movie";
    const base = CONFIG.tmdb.baseUrl;
    const data = await apiFetch(`${base}/${kind}/${encodeURIComponent(externalId)}?api_key=${CONFIG.tmdb.apiKey}&language=fr-FR`, { cachePolicy: "search", signal: options.signal });
    if (!data?.id) return null;
    return kind === "tv" ? tmdbNormalizeShow(data) : tmdbNormalizeMovie(data);
  },

  async byImdb(imdbId, options = {}) {
    if (!this.available()) return null;
    const base = CONFIG.tmdb.baseUrl;
    const data = await apiFetch(`${base}/find/${encodeURIComponent(imdbId)}?api_key=${CONFIG.tmdb.apiKey}&external_source=imdb_id&language=fr-FR`, { cachePolicy: "search", signal: options.signal });
    const movie = data?.movie_results?.[0];
    if (movie) return tmdbNormalizeMovie(movie);
    const show = data?.tv_results?.[0];
    return show ? tmdbNormalizeShow(show) : null;
  },

  // Sorties cinéma et nouvelles séries prévues dans les 6 prochains mois.
  // Les films exigent une date de sortie française. Pour les séries, TMDb ne
  // possède pas de date régionale équivalente : on exige donc soit une offre
  // de diffusion référencée en France, soit une production d'origine française.
  async upcoming(options = {}) {
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
      apiFetch(movieUrl(1), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }), apiFetch(movieUrl(2), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }),
      apiFetch(tvFranceUrl(1), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }), apiFetch(tvFranceUrl(2), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }),
      apiFetch(tvBroadcasterUrl(1), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }), apiFetch(tvBroadcasterUrl(2), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }), apiFetch(tvBroadcasterUrl(3), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }),
      apiFetch(tvFrenchOriginUrl(1), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }), apiFetch(tvFrenchOriginUrl(2), { cachePolicy: "upcoming", timeoutMs: 10_000, signal: options.signal }),
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
    return Boolean(CONFIG?.supabase?.url);
  },

  async search(query, options = {}) {
    if (!this.available()) return [];
    const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
    const data = await apiFetch(proxyUrl, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ query }),
      cachePolicy: "search",
      signal: options.signal,
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
      igdb_url: g.url || (g.slug ? `https://www.igdb.com/games/${g.slug}` : null),
    }));
  },

  async upcoming(options = {}) {
    if (!this.available()) return [];
    const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
    const data = await apiFetch(proxyUrl, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      body: JSON.stringify({ action: "upcoming" }),
      timeoutMs: 15000,
      cachePolicy: "upcoming",
      signal: options.signal,
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

  async search(query, options = {}) {
    const isbn = normalizeISBN(query);
    if (isbn) {
      let edition;
      try {
        edition = await apiFetch(`${CONFIG.openLibrary.baseUrl}/isbn/${isbn}.json`, { cachePolicy: "search", signal: options.signal });
      } catch (error) {
        if (error?.message?.includes("404")) return [];
        throw error;
      }
      const authors = await Promise.all((edition.authors || []).slice(0, 2).map(async author => {
        if (!/^\/authors\/OL\d+A$/.test(author.key || "")) return null;
        try { return (await apiFetch(`${CONFIG.openLibrary.baseUrl}${author.key}.json`, { cachePolicy: "detail", signal: options.signal })).name; }
        catch (error) { if (error?.name === "AbortError") throw error; return null; }
      }));
      return edition.title ? [{
        external_id: (edition.works?.[0]?.key || edition.key || '').replace(/^\/(works|books)\//, ''),
        title: edition.title, author: authors.filter(Boolean).join(', ') || null,
        cover_url: edition.covers?.find(id => id > 0) ? `${CONFIG.openLibrary.coverBase}/${edition.covers.find(id => id > 0)}-M.jpg` : null,
        // Un synopsis étranger n'est pas enregistré tel quel : il resterait en
        // version originale, car les textes déjà renseignés ne sont jamais
        // remplacés. La fiche le récupère et le traduit à l'ouverture, en un
        // seul fondu, comme pour les autres livres.
        description: (text => text && isLikelyFrench(text) ? text : null)(plainBookDescription(typeof edition.description === "string" ? edition.description : edition.description?.value)),
        isbn, page_count: edition.number_of_pages || null, publisher: edition.publishers?.[0] || null,
        release_year: Number(String(edition.publish_date || '').match(/\d{4}/)?.[0]) || null,
        source_api: 'openlibrary', genre: null, platform: null,
      }] : [];
    }
    const fields = 'key,title,author_name,first_publish_year,subject,cover_i,editions,editions.title,editions.language';
    const search = lang => apiFetch(`${CONFIG.openLibrary.baseUrl}/search.json?q=${encodeURIComponent(query)}&lang=${lang}&limit=6&fields=${fields}`, { cachePolicy: "search", signal: options.signal });
    const data = await search('fr');
    const docs = data.docs || [];
    let alternatives = [];
    if (docs.some(b => !isLatinTitle(preferredBookTitle(b)))) {
      try { alternatives = (await search('en')).docs || []; }
      catch (error) { if (error?.name === 'AbortError') throw error; }
    }
    return docs.map(b => ({
      external_id: b.key?.replace("/works/", "") || null,
      title: preferredBookTitle(b, alternatives.find(a => a.key === b.key)),
      cover_url: b.cover_i ? `${CONFIG.openLibrary.coverBase}/${b.cover_i}-M.jpg` : null,
      description: null,
      release_year: b.first_publish_year || null,
      genre: cleanBookGenres(b.subject).join(", ") || null,
      author: b.author_name?.[0] || null,
      platform: null, source_api: "openlibrary",
    }));
  },
};

// Hardcover : seuls les résultats publics normalisés passent par le proxy.
const hardcoverDetailsCache = new Map();
async function hardcoverRequest(payload, options = {}) {
  const key = payload.action === 'details' ? String(payload.id || '') : '';
  const cached = key && hardcoverDetailsCache.get(key);
  if (cached && cached.until > Date.now()) return [cached.item];
  const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/hardcover-proxy`, {
    method: "POST", headers: await edgeFunctionHeaders(), body: JSON.stringify(payload),
    timeoutMs: 22000, cachePolicy: payload.action === "search" ? "search" : "detail", signal: options.signal,
  });
  if (data?.error) throw new Error(data.error);
  const items = Array.isArray(data?.items) ? data.items : [];
  for (const item of payload.action === "search" ? [] : items) {
    if (hardcoverDetailsCache.size >= 100) hardcoverDetailsCache.delete(hardcoverDetailsCache.keys().next().value);
    hardcoverDetailsCache.set(item.external_id, { item, until: Date.now() + 600000 });
  }
  return items;
}
export const Hardcover = {
  async search(query, options = {}) {
    const items = await hardcoverRequest({ action: "search", query: normalizeISBN(query) || query }, options);
    // Ne pas sauvegarder un synopsis anglais avant sa traduction.
    return items.map(item => ({ ...item, genre: cleanBookGenres(item.genre).join(", ") || null, description: item.description && isLikelyFrench(item.description) ? plainBookDescription(item.description) : null }));
  },
  async select(id, options = {}) {
    const finish = startMeasurement("book:selection");
    try {
    const item = (await hardcoverRequest({action:"select",id},options))[0];
    if (!item) throw new Error("Livre introuvable");
    void Hardcover.fetch(item.external_id).catch(() => {});
    return {...item,description:item.description && isLikelyFrench(item.description) ? plainBookDescription(item.description) : null};
    } finally { finish(); }
  },
  async fetch(id, options = {}) {
    const item = (await hardcoverRequest({ action: "details", id }, options))[0];
    if (!item) return null;
    const clean = plainBookDescription(item.description);
    return { ...item, description: clean ? await translateViaProxy(clean, options) : null };
  },
};
export const Books = {
  search(query, options = {}) {
    return searchBooksWithFallback(query, options, Hardcover.search, OpenLibrary.search);
  },
  async fetch(entry, options = {}) {
    if (entry.source_api === "hardcover") {
      try {
        const details = await Hardcover.fetch(entry.external_id, options);
        if (details?.description || !entry.isbn) return details;
        const fallback = await OpenLibrary.search(entry.isbn, options);
        const extra = fallback[0] ? await OpenLibraryDetails.fetch(fallback[0].external_id, entry, options) : null;
        return { ...details, description: extra?.description || null };
      } catch (error) {
        if (error?.name === "AbortError" || !entry.isbn) throw error;
        const items = await OpenLibrary.search(entry.isbn, options);
        return items[0] ? OpenLibraryDetails.fetch(items[0].external_id, entry, options) : null;
      }
    }
    let details = null;
    try { details = await OpenLibraryDetails.fetch(entry.external_id, entry, options); }
    catch (error) { if (error?.name === "AbortError") throw error; }
    if (details?.description || entry.description) return details;
    try {
      const isbn = normalizeISBN(entry.isbn);
      const matches = await Hardcover.search(isbn || `${entry.title} ${entry.author || ''}`, options);
      const match = matches.find(item => isbn ? item.isbn === isbn : entry.author &&
        normalizeBookText(item.title) === normalizeBookText(entry.title) &&
        normalizeBookText(item.author) === normalizeBookText(entry.author));
      if (!match) return details;
      const extra = await Hardcover.fetch(match.external_id, options);
      // Une correspondance d'œuvre ne permet pas de remplacer les données d'édition.
      return { ...details, description: extra?.description || details?.description };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return details;
    }
  },
};

// ── Livres — BnF pour les parutions ─
// La fonction Supabase consulte à la volée les flux Nouveautés Éditeurs de la
// BnF pour cette installation personnelle. Aucun appel Google Books.
async function bookReleasesProxy(payload, timeoutMs = 20000, options = {}) {
  const functionName = CONFIG?.bookReleases?.proxyFunction || "book-releases-proxy";
  const proxyUrl = `${CONFIG.supabase.url}/functions/v1/${functionName}`;
  const data = await apiFetch(proxyUrl, {
    method: "POST",
    headers: await edgeFunctionHeaders(),
    body: JSON.stringify(payload),
    timeoutMs,
    cachePolicy: payload?.action === "upcoming" ? "upcoming" : "detail",
    signal: options.signal,
  });
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.items) ? data.items : [];
}

export const BookReleases = {
  available() {
    return Boolean(CONFIG?.supabase?.url);
  },

  async upcoming(options = {}) {
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
    const items = await bookReleasesProxy({ action: "upcoming" }, 20_000, options);
    const unique = new Map();
    items.forEach(item => {
      const releaseDate = String(item?.release_date || "");
      if (!item?.title || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return;
      if (releaseDate < startDate || releaseDate > endDate) return;
      const normalized = {
        ...item,
        external_id: null,
        source_api: "manual",
        media_type: "book",
        subtype: null,
        upcoming_type: "book",
        date_precision: "day",
      };
      const identity = item.upcoming_id || `${normalizeBookText(item.title)}|${normalizeBookText(item.author)}|${releaseDate}`;
      if (!unique.has(identity)) unique.set(identity, normalized);
    });

    return [...unique.values()].sort((a, b) =>
      a.release_date.localeCompare(b.release_date) || b.popularity - a.popularity
    );
  },
};

// ── Détails enrichis ────────────────────────────────────────

export const TMDbDetails = {
  async fetch(externalId, subtype = "movie", options = {}) {
    if (!CONFIG?.tmdb?.apiKey) return null;
    const key  = CONFIG.tmdb.apiKey;
    const base = CONFIG.tmdb.baseUrl;
    const ep   = subtype === "tv" ? "tv" : "movie";
    const lang = "language=fr-FR";
    const detailRequest = options.fresh
      ? { cachePolicy: "detail", fresh: true, signal: options.signal }
      : { cachePolicy: "detail", signal: options.signal };
    const catalogue = (part, policy) => ({ ...detailRequest, persistentFresh: options.persistentFresh, persistentCache: { key: `tmdb:${ep}:${externalId}:fr:${part}:v1`, policy } });

    const [main, credits, providers, videos] = await Promise.allSettled([
      apiFetch(`${base}/${ep}/${externalId}?api_key=${key}&${lang}`, catalogue("main", "daily")),
      apiFetch(`${base}/${ep}/${externalId}/credits?api_key=${key}&${lang}`, catalogue("credits", "metadata")),
      apiFetch(`${base}/${ep}/${externalId}/watch/providers?api_key=${key}`, catalogue("providers", "daily")),
      apiFetch(`${base}/${ep}/${externalId}/videos?api_key=${key}&${lang}&include_video_language=fr,en`, catalogue("videos", "metadata")),
    ]);

    const d = main.status === "fulfilled" ? main.value : null;
    const c = credits.status === "fulfilled" ? credits.value : null;
    const p = providers.status === "fulfilled" ? providers.value : null;
    const v = videos.status === "fulfilled" ? videos.value : null;

    if (options.signal?.aborted) {
      const error = new Error("Requête annulée");
      error.name = "AbortError";
      throw error;
    }

    if (!d) return null;

    // Bande-annonce directe et saga : transitoires, jamais enregistrées.
    const trailer_url = tmdbTrailerUrl(v?.results);
    let collection = null;
    if (ep === "movie" && d.belongs_to_collection?.id) {
      try {
        const data = await apiFetch(`${base}/collection/${d.belongs_to_collection.id}?api_key=${key}&${lang}`, detailRequest);
        collection = tmdbCollection(data, CONFIG.tmdb.imageBase);
      } catch { /* Facultatif : la fiche reste complète sans la saga. */ }
    }

    // Réalisateur (film) ou créateur (série)
    let directors = null;
    if (ep === "movie" && c?.crew) {
      directors = c.crew.filter(x => x.job === "Director").map(x => x.name).slice(0, 2).join(", ") || null;
    } else if (ep === "tv" && d.created_by) {
      directors = d.created_by.map(x => x.name).slice(0, 2).join(", ") || null;
    }

    // Identifiants natifs TMDb : pas de requêtes supplémentaires vers IMDb.
    const topCast = c?.cast?.slice(0, 4) || [];
    const cast_members = topCast.map(x => x.name).join(", ") || null;
    const cast_people = topCast.map(person => ({ id: person.id, name: person.name }));

    // Durée / saisons / épisodes
    // Films : durée du film. Séries : durée d'un épisode (le Profil la multiplie par episodes_count).
    const duration       = ep === "movie"
      ? (d.runtime || null)
      : (d.episode_run_time?.find(Boolean) || d.last_episode_to_air?.runtime || d.next_episode_to_air?.runtime || null);
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

    const external_ratings = [
      Number(d.vote_count) > 0 ? externalRating("tmdb", "TMDb", d.vote_average, 10, { votes: Number(d.vote_count) }) : null,
    ].filter(Boolean);

    const releaseDate = ep === "movie" ? d.release_date : d.first_air_date;
    const release_year = releaseDate ? Number.parseInt(String(releaseDate).slice(0, 4), 10) || null : null;

    return { backdrop_url, description, directors, cast_members, cast_people, duration, seasons_count, episodes_count, air_status, watch_providers, external_ratings, release_year, trailer_url, collection };
  },
};

// Notes externes : transitoires (jamais enregistrées), distinctes de la note
// personnelle. Échelle commune /10, source toujours nommée.
function externalRating(source, label, value, scale = 10, extra = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const outOf10 = scale === 100 ? number / 10 : number;
  if (outOf10 > 10) return null;
  return { source, label, value: Math.round(outOf10 * 10) / 10, scale: 10, ...extra };
}

// Images de fond supplémentaires (sans texte, les mieux notées d'abord).
export const TMDbImages = {
  async fetch(externalId, subtype = "movie", options = {}) {
    if (!CONFIG?.tmdb?.apiKey || !externalId) return [];
    const ep = subtype === "tv" ? "tv" : "movie";
    const size = options.size || "w1280";
    const data = await apiFetch(
      `${CONFIG.tmdb.baseUrl}/${ep}/${externalId}/images?api_key=${CONFIG.tmdb.apiKey}`,
      { cachePolicy: "detail", signal: options.signal, persistentCache: { key: `tmdb:${ep}:${externalId}:backdrops:v1`, policy: "images" } }
    );
    return (data?.backdrops || [])
      .filter(b => b?.file_path && !b.iso_639_1 && (b.width || 0) >= 1280)
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 8)
      .map(b => `https://image.tmdb.org/t/p/${size}${b.file_path}`);
  },
};

// Captures d'écran IGDB : t_1080p pour le bureau, t_screenshot_big (889 × 500)
// pour le mobile.
function igdbScreenshotUrls(game, size = "t_1080p", limit = 4) {
  return igdbMediaData(game).screenshots
    .map(shot => shot?.image_id)
    .filter(id => typeof id === "string" && /^[a-z0-9]+$/i.test(id))
    .slice(0, limit)
    .map(id => `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg`);
}

async function fetchIgdbGame(externalId, options = {}) {
  if (!CONFIG?.supabase?.url || !Number.isSafeInteger(Number(externalId)) || Number(externalId) <= 0) return null;
  const proxyUrl = `${CONFIG.supabase.url}/functions/v1/igdb-proxy`;
  const data = await apiFetch(proxyUrl, {
    method: "POST",
    headers: await edgeFunctionHeaders(),
    body: JSON.stringify({ id: Number(externalId) }),
    persistentFresh: options.persistentFresh,
    persistentCache: { key: `igdb:${CONFIG.supabase.url}:${Number(externalId)}:game:v1`, policy: "daily" },
    cachePolicy: "detail",
    fresh: Boolean(options.fresh),
    timeoutMs: 12_000,
    signal: options.signal,
  });
  if (data?.error) throw new Error(String(data.error));
  const game = Array.isArray(data) ? data[0] : data;
  if (game && (!Number.isSafeInteger(Number(game.id)) || Number(game.id) <= 0)) {
    throw new Error("Réponse IGDB invalide : identifiant du jeu absent");
  }
  return game || null;
}

export const IGDBDetails = {
  async fetch(externalId, options = {}) {
    const g = await fetchIgdbGame(externalId, options);
    if (!g) return null;

    const developer  = g.involved_companies?.find(c => c.developer)?.company?.name || null;
    const publisher  = g.involved_companies?.find(c => c.publisher)?.company?.name || null;
    const platform   = g.platforms?.map(x => x.name).join(", ") || null;
    // Une seule route traduit les textes externes : groq-proxy est partagée
    // avec les livres et reste indépendante du catalogue IGDB.
    const description = g.summary ? await translateViaProxy(g.summary, options) : null;
    // La première capture sert de bannière enregistrée (comme TMDb).
    const backdrop_url = igdbScreenshotUrls(g, "t_1080p", 1)[0] || null;

    // Les éditions peuvent ne noter que le jeu de base : le libellé le précise.
    const media = igdbMediaData(g);
    const external_ratings = [
      media.players ? externalRating("igdb", "IGDB", media.players.value, 100, { kind: media.players.fromParent ? "public · jeu de base" : "public", votes: Number(media.players.votes) || null }) : null,
      media.critics ? externalRating("igdb", "IGDB", media.critics.value, 100, { kind: media.critics.fromParent ? "presse · jeu de base" : "presse", votes: Number(media.critics.votes) || null }) : null,
    ].filter(Boolean);

    const release_year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null;

    // Temps de jeu (minutes) stocké dans `duration`, comme la durée d'un film.
    const duration = igdbPlayMinutes(g);

    return { backdrop_url, developer, publisher, platform, description, external_ratings, release_year, duration,
      trailer_url: igdbTrailerUrl(g.videos), igdb_url: g.url || (g.slug ? `https://www.igdb.com/games/${g.slug}` : null), collection: igdbCollection(g.collection_details, g.id) };
  },
};

// Captures supplémentaires pour le défilement de la bannière (même requête que
// les détails : la réponse est déjà en cache).
export const IGDBImages = {
  async fetch(externalId, options = {}) {
    const g = await fetchIgdbGame(externalId, options);
    return igdbScreenshotUrls(g, options.size || "t_1080p", 4);
  },
};

export { isLikelyFrench };

// Renvoie { text, translated }. En cas d'échec, le texte d'origine est conservé
// (translated: false) : l'appelant décide s'il faut le signaler.
export async function translateText(text, options = {}) {
  // options.force : demande explicite de l'utilisateur, la détection de langue est ignorée.
  if (!text || !CONFIG?.supabase?.url || (!options.force && isLikelyFrench(text))) return { text, translated: false };
  try {
    const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/groq-proxy`, {
      method: "POST",
      headers: await edgeFunctionHeaders(),
      // Le navigateur n'a pas le droit de choisir le prompt ou le modèle.
      // Le proxy applique lui-même une consigne de traduction fixe.
      body: JSON.stringify({ text }),
      cachePolicy: "translation",
      timeoutMs: 15_000,
      signal: options.signal,
    });
    const translation = data.translation?.trim();
    return translation ? { text: translation, translated: true } : { text, translated: false };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    console.warn("[Traduction] groq-proxy indisponible, texte original conservé :", error);
    return { text, translated: false };
  }
}

async function translateViaProxy(text, options = {}) {
  return (await translateText(text, options)).text;
}

export const OpenLibraryDetails = {
  async fetch(externalId, fallback = {}, options = {}) {
    const editionOnly = /^OL\d+M$/.test(externalId || "");
    const [workResult, editionsResult] = await Promise.allSettled([
      externalId ? apiFetch(`${CONFIG.openLibrary.baseUrl}/${editionOnly ? "books" : "works"}/${externalId}.json`, { cachePolicy: "detail", signal: options.signal }) : Promise.resolve(null),
      externalId && !editionOnly ? apiFetch(`${CONFIG.openLibrary.baseUrl}/works/${externalId}/editions.json?limit=20`, { cachePolicy: "detail", signal: options.signal }) : Promise.resolve({ entries: [] }),
    ]);
    if (options.signal?.aborted) {
      const error = new Error("Requête annulée");
      error.name = "AbortError";
      throw error;
    }
    const work = workResult.status === "fulfilled" ? workResult.value : null;
    const editions = editionOnly && work ? [work] : editionsResult.status === "fulfilled" ? (editionsResult.value?.entries || []) : [];
    const descriptionValue = value => typeof value === "string" ? value : value?.value || null;
    const expectedIsbn = normalizeISBN(fallback.isbn);
    const edition = expectedIsbn
      ? editions.find(e => [...(e.isbn_13 || []), ...(e.isbn_10 || [])].includes(expectedIsbn))
      : editions.find(e => e.languages?.some(l => l.key === "/languages/fre")) || editions[0];
    const rawDescription = descriptionValue(work?.description) || descriptionValue(edition?.description) || null;
    const page_count = edition?.number_of_pages || null;
    const isbn = expectedIsbn || edition?.isbn_13?.[0] || edition?.isbn_10?.[0] || null;
    const publisher = edition?.publishers?.[0] || null;

    if (!work && !editions.length && !rawDescription) return null;
    const cleanDescription = plainBookDescription(rawDescription);
    const description = cleanDescription ? await translateViaProxy(cleanDescription, options) : null;
    const release_year = Number.parseInt(String(work?.first_publish_date || "").match(/\d{4}/)?.[0], 10) || null;
    return { description, page_count, isbn, publisher, release_year };
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

async function searchMediaRequest(query, mediaType, options = {}) {
  if (!query || query.length < 2) return [];
  try {
    switch (mediaType) {
      case "movie": return await TMDb.search(query, options);
      case "game":  return await IGDB.search(query, options);
      case "book":  return await Books.search(query, options);
      default:      return [];
    }
  } catch (err) {
    if (options.throwOnError) throw err;
    // On ignore les erreurs serveur (5xx) qui sont hors de notre contrôle
    if (err?.name === "AbortError") return [];
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

export async function searchMedia(query, mediaType, options = {}) {
  const finish = startMeasurement(`search:${mediaType}`);
  try { return await searchMediaRequest(query, mediaType, options); }
  finally { finish(); }
}

// Mémoire locale des logos de jeux : 30 jours si trouvés, 3 jours si aucun.
const LOGO_CACHE_VERSION = 3;
const logoCacheKey = entry => `kulturo:title-logos:${LOGO_CACHE_VERSION}:${entry.source_api}:${entry.external_id}`;
function readLogoCache(entry) {
  try {
    const saved = JSON.parse(localStorage.getItem(logoCacheKey(entry)) || "null");
    if (!saved || !Array.isArray(saved.logos)) return null;
    const maxAge = saved.logos.length ? 30 * 86400_000 : 3 * 86400_000;
    return Date.now() - saved.at < maxAge ? saved.logos : null;
  } catch { return null; }
}
function writeLogoCache(entry, logos) {
  try { localStorage.setItem(logoCacheKey(entry), JSON.stringify({at:Date.now(), logos})); } catch { /* facultatif */ }
}

// Indépendant des notes/synopsis : un logo ne bloque jamais leur chargement.
export const TitleLogos = {
  async fetch(entry, options = {}) {
    // Logo saisi à la main : prioritaire et sans appel réseau d'API.
    const manual = manualLogoUrl(entry.logo_url);
    if (manual) return [{url:manual}];
    if (entry.source_api === "tmdb" && CONFIG?.tmdb?.apiKey) {
      const ep = entry.subtype === "tv" ? "tv" : "movie";
      const data = await apiFetch(`${CONFIG.tmdb.baseUrl}/${ep}/${encodeURIComponent(entry.external_id)}/images?api_key=${CONFIG.tmdb.apiKey}&include_image_language=fr,en,null`, {cachePolicy:"detail", signal:options.signal, persistentCache: { key: `tmdb:${ep}:${entry.external_id}:logos:fr-en:v1`, policy: "images" }});
      return tmdbLogoCandidates(data?.logos);
    }
    if (entry.source_api === "igdb" && CONFIG?.supabase?.url) {
      const cached = readLogoCache(entry);
      if (cached) return cached;
      // IGDB et SteamGridDB en parallèle : SteamGridDB est prioritaire, IGDB complète.
      const [igdb, steam] = await Promise.allSettled([
        apiFetch(`${CONFIG.supabase.url}/functions/v1/igdb-proxy`, {
          method:"POST", headers:await edgeFunctionHeaders(),
          body:JSON.stringify({action:"logos", id:Number(entry.external_id), logoRevision:3}),
          cachePolicy:"detail", signal:options.signal, timeoutMs:12000,
        }),
        this.fallback(entry, options),
      ]);
      if (igdb.status === "rejected" && igdb.reason?.name === "AbortError") throw igdb.reason;
      const igdbList = igdb.status === "fulfilled" ? igdbLogoCandidates(Array.isArray(igdb.value?.logos) ? igdb.value.logos : []) : [];
      const steamList = steam.status === "fulfilled" ? steam.value : null;
      const merged = [...(steamList || []), ...igdbList].slice(0, 6);
      // Un échec réseau n'est jamais mémorisé : seule une réponse fiable l'est.
      if (igdb.status === "fulfilled" && steamList) writeLogoCache(entry, merged);
      return merged;
    }
    return null;
  },

  // Secours facultatif pour les jeux. Retourne null en cas d'erreur (non mémorisée).
  async fallback(entry, options = {}) {
    if (entry.media_type !== "game" || !entry.title || !CONFIG?.supabase?.url) return [];
    try {
      const data = await apiFetch(`${CONFIG.supabase.url}/functions/v1/steamgriddb-proxy`, {
        method:"POST", headers:await edgeFunctionHeaders(),
        body:JSON.stringify({action:"logos", title:entry.title}),
        cachePolicy:"detail", signal:options.signal, timeoutMs:12000,
      });
      return steamGridLogoCandidates(data?.logos);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("[Logo secours]", error);
      return null;
    }
  },
};
