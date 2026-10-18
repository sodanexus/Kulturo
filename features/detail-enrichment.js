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
  "release_year",
]);

export function collectDetailUpdates(entry, details) {
  if (!entry || !details) return {};
  const updates = {};
  DETAIL_ENRICHMENT_FIELDS.forEach(field => {
    // Un synopsis existant peut avoir été saisi par l’utilisateur.
    // Traduire les nouveaux textes avant enrichissement, sans écraser sa saisie.
    if (details[field] != null && !entry[field]) {
      updates[field] = details[field];
    }
  });
  return updates;
}

// La sauvegarde locale peut renvoyer un ancien instantané. Les notes/cast
// fraîchement reçus et l'état de la requête active restent prioritaires.
export function mergeDetailResponse(entry, updated, details = entry) {
  const transient = Object.fromEntries(['external_ratings', 'cast_people']
    .filter(key => Array.isArray(details?.[key])).map(key => [key, details[key]]));
  const fields = Object.fromEntries(Object.entries(updated || {}).filter(([key]) =>
    !key.startsWith('_') && !['external_ratings', 'cast_people'].includes(key)));
  Object.assign(entry, fields, transient);
  return entry;
}
