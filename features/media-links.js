// Liens contextuels. Aucun identifiant de livre n’est supposé être un identifiant Open Library.
import { safeTrailerUrl } from "./media-extras.js";

function webUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function mediaLinks(entry) {
  const links = [];
  const title = String(entry.title || "").trim();
  const query = encodeURIComponent(title);
  const add = (url, label, kind = "external") => {
    const safe = webUrl(url);
    if (safe && !links.some(link => link.url === safe)) links.push({ url: safe, label, kind });
  };
  const direct = webUrl(entry.external_url);
  if (entry.media_type === "book") {
    if (entry.source_api === "hardcover" && title) {
      add(`https://hardcover.app/search?q=${query}`, "Chercher sur Hardcover");
      return links;
    }
    if (title) {
      const bookQuery = entry.isbn ? `isbn:${entry.isbn}` : `${title} ${entry.author || ""}`.trim();
      add(`https://openlibrary.org/search?q=${encodeURIComponent(bookQuery)}`, "Chercher le livre");
    }
    return links;
  }

  if (entry.media_type === "game") {
    const igdbDirect = webUrl(entry.igdb_url);
    if (igdbDirect && /(^|\.)igdb\.com$/i.test(new URL(igdbDirect).hostname)) {
      add(igdbDirect, "Voir sur IGDB");
    } else if (direct && /(^|\.)igdb\.com$/i.test(new URL(direct).hostname)) {
      add(direct, "Voir sur IGDB");
    } else if (title) {
      add(`https://www.igdb.com/search?type=1&q=${query}`, "Rechercher sur IGDB");
    }
  } else if (entry.media_type === "movie") {
    if (entry.source_api === "tmdb" && /^\d+$/.test(String(entry.external_id || ""))) {
      add(`https://www.themoviedb.org/${entry.subtype === "tv" ? "tv" : "movie"}/${entry.external_id}`, "Voir sur TMDB");
    } else if (direct && /(^|\.)themoviedb\.org$/i.test(new URL(direct).hostname)) {
      add(direct, "Voir sur TMDB");
    } else if (title) {
      add(`https://www.themoviedb.org/search?query=${query}`, "Rechercher sur TMDB");
    }
  }
  if (["movie", "game"].includes(entry.media_type)) {
    const trailer = safeTrailerUrl(entry.trailer_url);
    if (trailer) add(trailer, "Bande-annonce", "video");
  }
  return links;
}
