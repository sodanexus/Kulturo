// ============================================================
// Fiche média — fusion non destructive des détails récupérés
// ============================================================

export const DETAIL_ENRICHMENT_FIELDS = Object.freeze([
  "backdrop_url",
  "description",
  "directors",
  "cast_members",
  "duration",
  "seasons_count",
  "episodes_count",
  "air_status",
  "watch_providers",
  "developer",
  "publisher",
  "page_count",
  "isbn",
  "platform",
]);

export function collectDetailUpdates(entry, details) {
  if (!entry || !details) return {};
  const updates = {};
  DETAIL_ENRICHMENT_FIELDS.forEach(field => {
    const translatedDescription = field === "description" &&
      ["openlibrary", "igdb"].includes(entry.source_api) &&
      details[field] && details[field] !== entry[field];
    if (details[field] != null && (!entry[field] || translatedDescription)) {
      updates[field] = details[field];
    }
  });
  return updates;
}
