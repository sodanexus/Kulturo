// Liens contextuels. Aucun identifiant de livre n’est supposé être un identifiant Open Library.
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
    if (title) {
      const bookQuery = entry.isbn ? `isbn:${entry.isbn}` : `${title} ${entry.author || ""}`.trim();
      add(`https://openlibrary.org/search?q=${encodeURIComponent(bookQuery)}`, "Chercher le livre");
    }
    return links;
  }

  if (entry.media_type === "game") {
    if (direct) add(direct, entry.external_label || "Site du jeu");
    else if (title) {
      const platform = String(entry.platform || "");
      if (/\b(PC|Windows|Linux|Mac|Steam)\b/i.test(platform)) add(`https://store.steampowered.com/search/?term=${query}`, "Chercher sur Steam");
      else if (/PlayStation|PS[345]/i.test(platform)) add(`https://store.playstation.com/fr-fr/search/${query}`, "PlayStation Store");
      else if (/Xbox/i.test(platform)) add(`https://www.xbox.com/fr-FR/Search/Results?q=${query}`, "Chercher sur Xbox");
      else add(`https://www.igdb.com/search?type=1&q=${query}`, "Fiche du jeu");
    }
  } else if (entry.media_type === "movie") {
    if (direct) add(direct, entry.external_label || "Fiche officielle");
    else if (title) add(`https://www.imdb.com/find/?q=${query}`, "Chercher sur IMDb");
  }
  if (title && ["movie", "game"].includes(entry.media_type)) {
    const qualifier = entry.media_type === "game" ? "jeu" : entry.subtype === "tv" ? "série" : "film";
    add(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${entry.release_year || ""} ${qualifier} bande annonce`.replace(/\s+/g, " "))}`, "Bande-annonce", "video");
  }
  return links;
}
