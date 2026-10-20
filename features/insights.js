// ============================================================
// Tendances personnelles — Journal et Profil
// ============================================================

import { eventsForPeriod, isCompletionEvent, isProfileTopEvent, isRevokedEvent, yearMonthOf } from "../domain.js";

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
  const monthEvents = (events || []).filter(event => !isRevokedEvent(event) && yearMonthOf(event?.occurred_at) === monthKey);
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

// ============================================================
// Temps passé — films et jeux : durée connue ; séries : épisodes × durée d'un
// épisode (45 min par défaut) ; livres : ≈ 40 pages/heure.
// ============================================================
const FALLBACK_FILM_MIN = 110;
const FALLBACK_EPISODE_MIN = 45;
const MINUTES_PER_PAGE = 1.5;

export function watchTimeKey(entry) {
  if (entry?.media_type === "movie") return entry.subtype === "tv" ? "tv" : "film";
  return entry?.media_type === "game" || entry?.media_type === "book" ? entry.media_type : null;
}

export function entryWatchTime(entry) {
  const key = watchTimeKey(entry);
  const duration = Number(entry?.duration) > 0 ? Number(entry.duration) : 0;
  if (key === "film") return { key, minutes: duration || FALLBACK_FILM_MIN, estimated: !duration };
  if (key === "tv") {
    const episodes = Number(entry.episodes_count) > 0 ? Number(entry.episodes_count) : 0;
    return episodes ? { key, minutes: episodes * (duration || FALLBACK_EPISODE_MIN), estimated: true } : null;
  }
  if (key === "book") {
    const pages = Number(entry.page_count) > 0 ? Number(entry.page_count) : 0;
    return pages ? { key, minutes: Math.round(pages * MINUTES_PER_PAGE), estimated: true } : null;
  }
  if (key === "game") return duration ? { key, minutes: duration, estimated: true } : null;
  return null;
}

// Les œuvres sans durée exploitable sont exclues du total et comptées dans `missing`.
export function watchTimeByMedia(entries) {
  const result = { film: 0, tv: 0, game: 0, book: 0, total: 0, missing: 0 };
  for (const entry of entries || []) {
    const time = entryWatchTime(entry);
    if (!time) { result.missing++; continue; }
    result[time.key] += time.minutes;
    result.total += time.minutes;
  }
  return result;
}

export function formatWatchTime(minutes) {
  const value = Math.round(Number(minutes) || 0);
  if (value < 60) return `${value} min`;
  const hours = value / 60;
  return hours < 10 ? `${hours.toFixed(1).replace(".", ",")} h` : `${Math.round(hours)} h`;
}
