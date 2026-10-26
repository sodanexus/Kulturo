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
    const id = String(entry.external_id || "").trim();
    if (entry.source_api === "hardcover") {
      const match = /^(\d+)(?::\d+)?$/.exec(id);
      if (match) add(`https://hardcover.app/book/${match[1]}`, "Voir sur Hardcover");
      else if (direct && new URL(direct).hostname === "hardcover.app") add(direct, "Voir sur Hardcover");
    } else if (entry.source_api === "openlibrary") {
      const openId = id.replace(/^\/(?:works|books)\//, "");
      if (/^OL\d+W$/i.test(openId)) add(`https://openlibrary.org/works/${openId}`, "Voir sur Open Library");
      else if (/^OL\d+M$/i.test(openId)) add(`https://openlibrary.org/books/${openId}`, "Voir sur Open Library");
      else if (direct && new URL(direct).hostname === "openlibrary.org") add(direct, "Voir sur Open Library");
      else if (/^(?:97[89])?\d{9}[\dX]$/i.test(String(entry.isbn || "").replace(/[-\s]/g, ""))) {
        add(`https://openlibrary.org/isbn/${String(entry.isbn).replace(/[-\s]/g, "")}`, "Voir sur Open Library");
      }
    }
    return links;
  }

  if (entry.media_type === "game") {
    const igdbDirect = webUrl(entry.igdb_url);
    if (igdbDirect && /(^|\.)igdb\.com$/i.test(new URL(igdbDirect).hostname) && /^\/games\/[a-z0-9][a-z0-9-]*\/?$/i.test(new URL(igdbDirect).pathname)) {
      add(igdbDirect, "Voir sur IGDB");
    } else if (direct && /(^|\.)igdb\.com$/i.test(new URL(direct).hostname) && /^\/games\/[a-z0-9][a-z0-9-]*\/?$/i.test(new URL(direct).pathname)) {
      add(direct, "Voir sur IGDB");
    }
    // IGDB utilise des slugs pour ses URL de jeux. Une recherche approximative
    // ou un identifiant numérique dans le chemin peut pointer vers une mauvaise page.
    // Le lien n'est montré qu'après récupération de l'URL officielle du jeu.
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
