// Ajout rapide : reconnaît un lien TMDb, IMDb, Steam, Goodreads ou Hardcover.
// Retourne null si le texte n'est pas un lien, sinon l'un de :
//   { provider, mediaType, subtype, externalId }  → TMDb, fiche identifiée exactement
//   { provider: "imdb", mediaType: "movie", imdbId } → à résoudre via TMDb
//   { provider, mediaType, query }                 → titre déduit du lien, à chercher
//   { unsupported: true, reason }                  → lien reconnu mais inexploitable
const HOSTS = [
  ["tmdb", /(^|\.)themoviedb\.org$/i],
  ["imdb", /(^|\.)imdb\.com$/i],
  ["steam", /^store\.steampowered\.com$/i],
  ["goodreads", /(^|\.)goodreads\.com$/i],
  ["hardcover", /(^|\.)hardcover\.app$/i],
];
const KNOWN_START = /^(?:www\.|m\.)?(?:themoviedb\.org|imdb\.com|store\.steampowered\.com|goodreads\.com|hardcover\.app)(?:[/?#]|$)/i;

function toUrl(text) {
  const value = String(text || "").trim();
  if (!value || /\s/.test(value)) return null;
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value);
    if (KNOWN_START.test(value)) return new URL(`https://${value}`);
  } catch { /* lien invalide */ }
  return null;
}

function humanize(slug) {
  let text = String(slug || "");
  try { text = decodeURIComponent(text); } catch { /* garde le texte brut */ }
  return text.replace(/[_+-]+/g, " ").replace(/\s+/g, " ").trim();
}

const unsupported = reason => ({ unsupported: true, reason });

export function parseMediaLink(text) {
  const url = toUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const provider = HOSTS.find(([, pattern]) => pattern.test(host))?.[0];
  if (!provider) return unsupported("host");
  const path = url.pathname;

  if (provider === "tmdb") {
    const match = path.match(/^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?(movie|tv)\/(\d+)(?:[-/]|$)/);
    if (!match) return unsupported("path");
    return { provider, mediaType: "movie", subtype: match[1], externalId: match[2] };
  }

  if (provider === "imdb") {
    const match = path.match(/\/title\/(tt\d{5,10})(?:\/|$)/);
    if (!match) return unsupported("path");
    return { provider, mediaType: "movie", imdbId: match[1] };
  }

  if (provider === "steam") {
    const match = path.match(/^\/app\/(\d+)(?:\/([^/?#]+))?/);
    const query = humanize(match?.[2]);
    if (!match || query.length < 2) return unsupported("title");
    return { provider, mediaType: "game", query };
  }

  if (provider === "goodreads") {
    const isbn = path.match(/^\/book\/isbn\/([0-9Xx-]{10,17})/);
    if (isbn) return { provider, mediaType: "book", query: isbn[1].replace(/-/g, "") };
    const match = path.match(/^\/book\/show\/\d+(?:[.-]([^/?#]+))?/);
    const query = humanize(match?.[1]);
    if (!match || query.length < 2) return unsupported("title");
    return { provider, mediaType: "book", query };
  }

  const match = path.match(/^\/books\/([^/?#]+)/);
  const query = humanize(match?.[1]);
  if (!match || query.length < 2) return unsupported("title");
  return { provider, mediaType: "book", query };
}

export function linkProblemMessage(link) {
  if (link?.reason === "host") return "Ce lien n’est pas pris en charge. Collez un lien TMDb, IMDb, Steam, Goodreads ou Hardcover, ou tapez le titre.";
  return "Ce lien ne désigne pas une fiche précise. Ouvrez la page de l’œuvre, copiez son lien, ou tapez le titre.";
}
