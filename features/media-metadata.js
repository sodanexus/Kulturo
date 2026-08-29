const DEFINITIONS = Object.freeze({
  cast: Object.freeze({ label: "Acteur ou actrice", fields: ["cast_members"], mediaTypes: ["movie"], external: "imdb" }),
  director: Object.freeze({ label: "Réalisation", fields: ["directors"], mediaTypes: ["movie"], external: "imdb" }),
  author: Object.freeze({ label: "Auteur ou autrice", fields: ["author"], mediaTypes: ["book"], external: "goodreads" }),
  developer: Object.freeze({ label: "Développement", fields: ["developer", "author"], mediaTypes: ["game"], external: "steam" }),
  publisher: Object.freeze({ label: "Édition", fields: ["publisher"], mediaTypes: ["game", "book"], external: null }),
  genre: Object.freeze({ label: "Genre", fields: ["genre"], external: null }),
  platform: Object.freeze({ label: "Plateforme", fields: ["platform"], mediaTypes: ["game"], external: null }),
  provider: Object.freeze({ label: "Disponibilité", fields: ["watch_providers"], mediaTypes: ["movie"], external: null }),
});

export function metadataDefinition(kind) {
  return DEFINITIONS[kind] || null;
}

export function splitMetadataValues(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(splitMetadataValues).filter(Boolean))];
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
  return [...new Set(raw.split(/\s*(?:,|;|\|)\s*/).map(item => item.trim()).filter(Boolean))];
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
      splitMetadataValues(entry?.[field]).some(item => normalizeMetadataValue(item) === expected)
    ))
    .sort((a, b) =>
      Number(b?.rating || 0) - Number(a?.rating || 0) ||
      String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity: "base" })
    );
}

export function metadataExternalLink(kind, value, directUrl = null) {
  const definition = metadataDefinition(kind);
  if (!definition) return null;
  if (directUrl) return { url: directUrl, label: "Voir sur IMDb" };
  const query = encodeURIComponent(String(value || "").trim());
  if (!query) return null;
  if (definition.external === "imdb") {
    return { url: `https://www.imdb.com/find/?q=${query}&s=nm`, label: "Rechercher sur IMDb" };
  }
  if (definition.external === "goodreads") {
    return { url: `https://www.goodreads.com/search?q=${query}`, label: "Rechercher sur Goodreads" };
  }
  if (definition.external === "steam") {
    return { url: `https://store.steampowered.com/search/?term=${query}`, label: "Rechercher sur Steam" };
  }
  return null;
}
