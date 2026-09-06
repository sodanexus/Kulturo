// ============================================================
// Bibliothèque — instantané local et comparaison avec Supabase
// ============================================================

export function entriesForStorage(entries) {
  return (entries || []).map(entry => Object.fromEntries(
    Object.entries(entry || {}).filter(([field]) => !field.startsWith("_") && field !== "user_id")
  ));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter(key => !key.startsWith("_") && key !== "user_id")
    .sort()
    .map(key => [key, stableValue(value[key])]));
}

// L'ordre des lignes ou des propriétés JSON n'a aucune incidence sur le rendu.
// Cette empreinte ne change que lorsque le contenu utile de la bibliothèque change.
export function entriesFingerprint(entries) {
  return JSON.stringify([...(entries || [])]
    .sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")))
    .map(stableValue));
}
