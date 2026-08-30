// ============================================================
// Tendances personnelles — Journal, Profil et recommandations
// ============================================================

import { eventsForPeriod, isCompletionEvent, isProfileTopEvent, yearMonthOf } from "../domain.js";

export function normalizeInsightValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function splitInsightValues(value) {
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(/[,;|/]+/).map(item => item.trim()).filter(Boolean))];
}

function entryWeight(entry) {
  const rating = Number(entry?.rating || 0);
  return 1
    + (entry?.status === "finished" ? 1 : 0)
    + (rating >= 7 ? 2 : 0)
    + (rating >= 9 ? 2 : 0)
    + (entry?.is_favorite ? 4 : 0);
}

function addAffinity(target, kind, label, weight) {
  const key = normalizeInsightValue(label);
  if (!key || key.length < 2) return;
  const mapKey = `${kind}:${key}`;
  const current = target.get(mapKey) || { kind, key, label: String(label).trim(), count: 0, weight: 0 };
  current.count++;
  current.weight += weight;
  target.set(mapKey, current);
}

export function buildLibraryAffinity(entries) {
  const affinity = new Map();
  for (const entry of entries || []) {
    const weight = entryWeight(entry);
    splitInsightValues(entry.genre).forEach(value => addAffinity(affinity, "genre", value, weight));
    if (entry.media_type === "book") {
      splitInsightValues(entry.author).forEach(value => addAffinity(affinity, "author", value, weight));
    } else if (entry.media_type === "game") {
      splitInsightValues(entry.developer || entry.author).forEach(value => addAffinity(affinity, "studio", value, weight));
    } else {
      splitInsightValues(entry.directors || entry.author).forEach(value => addAffinity(affinity, "director", value, weight));
    }
    splitInsightValues(entry.developer).forEach(value => addAffinity(affinity, "studio", value, weight));
    splitInsightValues(entry.publisher).forEach(value => addAffinity(affinity, entry.media_type === "book" ? "publisher" : "studio", value, weight));
    splitInsightValues(entry.studio || entry.production_companies).forEach(value => addAffinity(affinity, "studio", value, weight));
  }
  return affinity;
}

const REASON_LABELS = {
  genre: "le genre",
  director: "la réalisation de",
  author: "les œuvres de",
  studio: "le studio",
  publisher: "la maison",
};

export function recommendationForUpcoming(item, affinity) {
  if (!item || !(affinity instanceof Map)) return null;
  const candidates = [];
  const add = (kind, value) => splitInsightValues(value).forEach(label => {
    const match = affinity.get(`${kind}:${normalizeInsightValue(label)}`);
    if (!match) return;
    const strong = kind === "genre"
      ? match.count >= 2 && match.weight >= 6
      : match.weight >= 4;
    if (strong) candidates.push({ ...match, itemLabel: label });
  });
  add("genre", item.genres || item.genre);
  add("director", item.directors || item.director);
  if (item.media_type === "game" || item.upcoming_type === "game") {
    add("studio", item.studio || item.developer || item.author || item.production_companies);
  } else {
    add("author", item.author);
    add("studio", item.studio || item.developer || item.production_companies);
  }
  add("publisher", item.publisher);

  const best = candidates.sort((a, b) => b.weight - a.weight || b.count - a.count)[0];
  if (!best) return null;
  return {
    label: "Pour vous",
    reason: `${REASON_LABELS[best.kind] || "vos goûts pour"} ${best.itemLabel}`,
    kind: best.kind,
    value: best.itemLabel,
    score: best.weight,
  };
}

export function exploredGenres(entries, limit = 6) {
  const counts = new Map();
  for (const entry of entries || []) {
    for (const label of splitInsightValues(entry.genre)) {
      const key = normalizeInsightValue(label);
      if (!key) continue;
      const current = counts.get(key) || { label, count: 0 };
      current.count++;
      counts.set(key, current);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
    .slice(0, Math.max(1, limit));
}

export function journalMonthSummary(events, entries, monthKey) {
  const entryById = new Map((entries || []).map(entry => [entry.id, entry]));
  const monthEvents = (events || []).filter(event => yearMonthOf(event?.occurred_at) === monthKey);
  const completed = monthEvents.filter(isCompletionEvent).length;
  const topIds = new Set(monthEvents.filter(isProfileTopEvent).map(event => event.media_id));
  const rated = [...topIds]
    .map(id => entryById.get(id))
    .filter(entry => Number(entry?.rating) >= 1 && Number(entry?.rating) <= 10);
  const average = rated.length
    ? rated.reduce((sum, entry) => sum + Number(entry.rating), 0) / rated.length
    : null;
  const favorite = [...rated].sort((a, b) =>
    Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite))
    || Number(b.rating || 0) - Number(a.rating || 0)
  )[0] || monthEvents.map(event => entryById.get(event.media_id)).find(entry => entry?.is_favorite) || null;
  return { completed, rated: rated.length, average, favorite };
}

export function repeatCountForPeriod(events, entries, year, month = "all", predicate = () => true) {
  const byId = new Map((entries || []).filter(predicate).map(entry => [entry.id, entry]));
  const periodEvents = eventsForPeriod(events || [], year, month);
  const datedRepeats = periodEvents.filter(event => event.event_type === "repeat_finished" && byId.has(event.media_id));
  if (datedRepeats.length || (events || []).length) return datedRepeats.length;
  return [...byId.values()].reduce((sum, entry) => sum + Math.max(0, Number.parseInt(entry.repeat_count, 10) || 0), 0);
}

export function annualMosaicEntries(entries, year, activityYear, limit = 24) {
  return (entries || [])
    .filter(entry => Number(activityYear(entry)) === Number(year) && entry.cover_url)
    .sort((a, b) => new Date(b.date_finished || b.date_started || b.created_at || 0) - new Date(a.date_finished || a.date_started || a.created_at || 0))
    .slice(0, Math.max(1, limit));
}
