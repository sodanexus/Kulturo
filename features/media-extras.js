// ============================================================
// Extras de fiche : bande-annonce directe et saga/collection.
// Fonctions pures (testables). Les données restent transitoires :
// elles ne sont jamais enregistrées dans la base.
// ============================================================

const YOUTUBE_KEY = /^[\w-]{6,20}$/;

export function youtubeWatchUrl(key) {
  return YOUTUBE_KEY.test(String(key || "")) ? `https://www.youtube.com/watch?v=${key}` : null;
}

// Seuls les liens YouTube « watch » produits par youtubeWatchUrl sont acceptés.
export function safeTrailerUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const key = url.searchParams.get("v");
    return url.protocol === "https:" && url.hostname === "www.youtube.com" && url.pathname === "/watch" && YOUTUBE_KEY.test(key || "")
      ? youtubeWatchUrl(key) : null;
  } catch { return null; }
}

// TMDb : bande-annonce française en priorité, puis anglaise ; officielle d'abord.
export function tmdbTrailerUrl(results = []) {
  const typeRank = { Trailer: 0, Teaser: 1 };
  const langRank = { fr: 0, en: 1 };
  const candidates = (Array.isArray(results) ? results : []).filter(video =>
    video?.site === "YouTube" && YOUTUBE_KEY.test(String(video.key || "")) && video.type in typeRank);
  candidates.sort((a, b) =>
    typeRank[a.type] - typeRank[b.type] ||
    (langRank[a.iso_639_1] ?? 2) - (langRank[b.iso_639_1] ?? 2) ||
    Number(Boolean(b.official)) - Number(Boolean(a.official)));
  return youtubeWatchUrl(candidates[0]?.key);
}

// IGDB : préférer une vidéo nommée « trailer », sinon la première.
export function igdbTrailerUrl(videos = []) {
  const list = (Array.isArray(videos) ? videos : []).filter(video => YOUTUBE_KEY.test(String(video?.video_id || "")));
  const pick = list.find(video => /trailer|bande.?annonce|announce|reveal|launch/i.test(String(video.name || ""))) || list[0];
  return youtubeWatchUrl(pick?.video_id);
}

// Films : les parties d'une collection TMDb, dans l'ordre de sortie.
export function tmdbCollection(collection, imageBase = "") {
  const parts = Array.isArray(collection?.parts) ? collection.parts : [];
  const items = parts.filter(part => part?.id && part.title).map(part => ({
    external_id: String(part.id),
    title: part.title,
    cover_url: part.poster_path && /^\/[\w.-]+$/.test(part.poster_path) ? `${imageBase}${part.poster_path}` : null,
    release_year: part.release_date ? Number.parseInt(String(part.release_date).slice(0, 4), 10) || null : null,
    release_date: part.release_date || null,
    media_type: "movie",
    subtype: "movie",
    source_api: "tmdb",
  })).sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"));
  return items.length >= 2 ? { name: collection.name || "", items } : null;
}

// Jeux : les jeux d'une collection IGDB (hors éditions), dans l'ordre de sortie.
export function igdbCollection(collection, currentId) {
  const games = Array.isArray(collection?.games) ? collection.games : [];
  const seen = new Set();
  const items = games.filter(game => Number.isSafeInteger(Number(game?.id)) && game.name && !game.version_parent && !seen.has(game.id) && seen.add(game.id))
    .map(game => ({
      external_id: String(game.id),
      title: game.name,
      cover_url: /^[a-z0-9]+$/i.test(game.cover?.image_id || "") ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.webp` : null,
      release_year: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : null,
      release_date: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10) : null,
      media_type: "game",
      source_api: "igdb",
    })).sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999")).slice(0, 14);
  if (!items.some(item => item.external_id === String(currentId))) return null;
  return items.length >= 2 ? { name: collection.name || "", items } : null;
}

// « Collection Harry Potter », « Saga Matrix », « Matrix Collection » → nom court.
export function collectionLabel(name) {
  const clean = String(name || "").trim()
    .replace(/^(?:collection|saga)\s+(?:de\s+|du\s+|des\s+|d['’])?/i, "")
    .replace(/\s*[-–:]?\s*\b(?:collection|saga|trilogie|trilogy|franchise)\b\s*$/i, "")
    .trim();
  return clean || String(name || "").trim();
}
