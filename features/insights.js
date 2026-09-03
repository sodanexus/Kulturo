// ============================================================
// Tendances personnelles — Journal et Profil
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
  // Une œuvre compte une seule fois parmi les « terminés », même en présence
  // de doublons historiques. Les repeat_finished restent réservés au replay.
  const completed = new Set(
    monthEvents.filter(isCompletionEvent).map(event => event.media_id).filter(Boolean)
  ).size;
  const topIds = new Set(monthEvents.filter(isProfileTopEvent).map(event => event.media_id));
  const rated = [...topIds]
    .map(id => entryById.get(id))
    .filter(entry => Number(entry?.rating) >= 1 && Number(entry?.rating) <= 10);
  const average = rated.length
    ? rated.reduce((sum, entry) => sum + Number(entry.rating), 0) / rated.length
    : null;
  // Le résumé doit refléter la collection telle qu'elle est maintenant :
  // une œuvre relancée et repassée « En cours » n'est plus un favori terminé.
  const finishedRated = rated.filter(entry => entry.status === "finished");
  const favorite = [...finishedRated].sort((a, b) =>
    Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite))
    || Number(b.rating || 0) - Number(a.rating || 0)
  )[0] || monthEvents
    .map(event => entryById.get(event.media_id))
    .find(entry => entry?.status === "finished" && entry.is_favorite) || null;
  return { completed, rated: rated.length, average, favorite };
}

export function repeatCountForPeriod(events, entries, year, month = "all", predicate = () => true) {
  const byId = new Map((entries || []).filter(predicate).map(entry => [entry.id, entry]));
  const periodEvents = eventsForPeriod(events || [], year, month);
  const datedRepeats = periodEvents.filter(event => event.event_type === "repeat_finished" && byId.has(event.media_id));
  if (datedRepeats.length || (events || []).length) return datedRepeats.length;
  return [...byId.values()].reduce((sum, entry) => sum + Math.max(0, Number.parseInt(entry.repeat_count, 10) || 0), 0);
}
