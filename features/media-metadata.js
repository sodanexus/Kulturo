import { cleanBookGenres } from "./book-search.js";
const DEFINITIONS = Object.freeze({
  cast: Object.freeze({ label: "Acteur ou actrice", fields: ["cast_members"], mediaTypes: ["movie"], external: "tmdb" }),
  director: Object.freeze({ label: "Réalisation", fields: ["directors", "author"], mediaTypes: ["movie"], external: "tmdb" }),
  author: Object.freeze({ label: "Auteur ou autrice", fields: ["author"], mediaTypes: ["book"], external: "goodreads" }),
  developer: Object.freeze({ label: "Développement", fields: ["developer", "author"], mediaTypes: ["game"], external: null }),
  publisher: Object.freeze({ label: "Édition", fields: ["publisher"], mediaTypes: ["game", "book"], external: null }),
  genre: Object.freeze({ label: "Genre", fields: ["genre"], external: null }),
});

export function metadataDefinition(kind) {
  return DEFINITIONS[kind] || null;
}

export function splitMetadataValues(value) {
  if (Array.isArray(value)) {
    return uniqueMetadataValues(value.flatMap(splitMetadataValues));
  }
  if (value == null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return splitMetadataValues(parsed);
    } catch {}
  }
  return uniqueMetadataValues(raw.split(/\s*(?:,|;|\|)\s*/));
}

function uniqueMetadataValues(values) {
  const seen = new Set();
  return values.map(value => String(value).trim().replace(/\s+/g, " ")).filter(value => {
    const key = normalizeMetadataValue(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeMetadataValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function entriesForMetadata(entries, kind, value) {
  const definition = metadataDefinition(kind);
  const expected = normalizeMetadataValue(value);
  if (!definition || !expected) return [];
  return (entries || [])
    .filter(entry => (!definition.mediaTypes || definition.mediaTypes.includes(entry?.media_type)) && definition.fields.some(field =>
      (kind === "genre" && entry?.media_type === "book" && entry?.source_api === "openlibrary"
        ? cleanBookGenres(entry[field]) : splitMetadataValues(entry?.[field])).some(item => normalizeMetadataValue(item) === expected)
    ))
    .sort((a, b) =>
      Number(b?.rating || 0) - Number(a?.rating || 0) ||
      String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity: "base" })
    );
}

export function metadataExternalLink(kind, value, directUrl = null) {
  const definition = metadataDefinition(kind);
  if (!definition) return null;
  if (directUrl) return { url: directUrl, label: "Voir sur TMDB" };
  // Aucun lien de recherche approximatif pour les personnes sans identifiant.
  return null;
}
