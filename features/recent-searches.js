const PREFIX = 'kulturo-recent-searches-v1:';
export function normalizeRecentSearches(values) {
  const result = [];
  for (const raw of Array.isArray(values) ? values : []) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (value.length < 2 || result.some(item => item.toLocaleLowerCase('fr') === value.toLocaleLowerCase('fr'))) continue;
    result.push(value);
    if (result.length === 6) break;
  }
  return result;
}
export function recentSearches(storage, owner) {
  if (!owner) return [];
  try { return normalizeRecentSearches(JSON.parse(storage.getItem(PREFIX + owner) || '[]')); } catch { return []; }
}
export function rememberSearch(storage, owner, query) {
  if (!owner) return;
  try { storage.setItem(PREFIX + owner, JSON.stringify(normalizeRecentSearches([query, ...recentSearches(storage, owner)]))); } catch {}
}
export function clearRecentSearches(storage, owner) {
  if (!owner) return;
  try { storage.removeItem(PREFIX + owner); } catch {}
}
