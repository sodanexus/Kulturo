// ============================================================
// Validation et planification sûre des restaurations Kulturo
// ============================================================

import { normalizeTitle, normalizedSubtype } from "../domain.js";

const MEDIA_TYPES = new Set(["movie", "game", "book"]);
const STATUSES = new Set(["wishlist", "playing", "finished", "paused", "dropped"]);
const SOURCE_APIS = new Set(["tmdb", "igdb", "rawg", "openlibrary", "manual"]);
const SUBTYPES = new Set(["movie", "tv"]);
const EVENT_TYPES = new Set([
  "added", "started", "repeat_started", "finished",
  "repeat_finished", "rated", "status_changed",
]);
const IMMUTABLE_FIELDS = new Set(["id", "user_id", "updated_at"]);
const STRING_LIMITS = Object.freeze({
  title: 500,
  notes: 20_000,
  description: 40_000,
  cover_url: 2_048,
  backdrop_url: 2_048,
  watch_providers: 10_000,
  default: 2_000,
});
const STRING_FIELDS = new Set([
  "title", "notes", "cover_url", "external_id", "genre", "author", "platform",
  "description", "backdrop_url", "directors", "cast_members", "air_status",
  "watch_providers", "developer", "publisher", "isbn",
]);
const INTEGER_LIMITS = Object.freeze({
  repeat_count: [0, 999],
  release_year: [1, 9999],
  duration: [0, 2_147_483_647],
  seasons_count: [0, 2_147_483_647],
  episodes_count: [0, 2_147_483_647],
  page_count: [0, 2_147_483_647],
});
const ALLOWED_FIELDS = new Set([
  "id", "title", "media_type", "status", "rating", "is_favorite", "repeat_count",
  "notes", "cover_url", "date_started", "date_finished", "external_id", "source_api",
  "subtype", "genre", "author", "release_year", "release_date", "release_date_precision",
  "platform", "description", "backdrop_url", "directors", "cast_members", "duration",
  "seasons_count", "episodes_count", "air_status", "watch_providers", "developer",
  "publisher", "page_count", "isbn", "created_at",
]);

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isISODate(value) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTimestamp(value) {
  return typeof value === "string" && value.length <= 80 && !Number.isNaN(new Date(value).getTime());
}

function boundedString(value, field) {
  if (value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`Champ ${field} invalide`);
  const limit = STRING_LIMITS[field] || STRING_LIMITS.default;
  return String(value).trim().slice(0, limit) || null;
}

function boundedInteger(value, field) {
  if (value === null) return null;
  const number = Number(value);
  const [minimum, maximum] = INTEGER_LIMITS[field];
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`Champ ${field} invalide`);
  return number;
}

function cloneMetadata(value, depth = 0) {
  if (depth > 6) throw new Error("Métadonnées trop imbriquées");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 4_000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => cloneMetadata(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      String(key).slice(0, 100),
      cloneMetadata(item, depth + 1),
    ]));
  }
  return null;
}

export function parseKulturoBackup(text, { maxEntries = 10_000, maxEvents = 100_000 } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Le fichier de sauvegarde est vide.");
  let backup;
  try { backup = JSON.parse(text); }
  catch { throw new Error("Ce fichier n’est pas un JSON valide."); }
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) throw new Error("Format de sauvegarde invalide.");
  if (backup.app !== "Kulturo") throw new Error("Ce fichier n’est pas une sauvegarde Kulturo.");
  if (!Array.isArray(backup.entries)) throw new Error("La liste des médias est absente de la sauvegarde.");
  if (backup.entries.length > maxEntries) throw new Error(`La sauvegarde dépasse la limite de ${maxEntries} médias.`);
  if (backup.events != null && !Array.isArray(backup.events)) throw new Error("Le Journal de la sauvegarde est invalide.");
  if ((backup.events?.length || 0) > maxEvents) throw new Error(`La sauvegarde dépasse la limite de ${maxEvents} événements.`);
  return { ...backup, entries: backup.entries, events: backup.events || [] };
}

export function sanitizeBackupEntry(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  try {
    const entry = {};
    for (const field of ALLOWED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
      const value = source[field];
      if (field === "id") {
        if (isUuid(value)) entry.id = String(value);
      } else if (STRING_FIELDS.has(field)) {
        entry[field] = boundedString(value, field);
      } else if (Object.prototype.hasOwnProperty.call(INTEGER_LIMITS, field)) {
        entry[field] = boundedInteger(value, field);
      } else if (["date_started", "date_finished", "release_date"].includes(field)) {
        if (value !== null && !isISODate(value)) throw new Error(`Champ ${field} invalide`);
        entry[field] = value;
      } else if (field === "created_at") {
        if (value !== null && !isTimestamp(value)) throw new Error("Date de création invalide");
        entry.created_at = value;
      } else {
        entry[field] = value;
      }
    }

    entry.title = boundedString(entry.title, "title") || "";
    if (!entry.title || !MEDIA_TYPES.has(entry.media_type)) return null;
    if (entry.status != null && !STATUSES.has(entry.status)) return null;
    if (entry.source_api != null && !SOURCE_APIS.has(entry.source_api)) return null;
    if (entry.subtype != null && !SUBTYPES.has(entry.subtype)) return null;
    if (entry.media_type !== "movie" && entry.subtype != null) return null;
    if (entry.release_date_precision != null && !["day", "month"].includes(entry.release_date_precision)) return null;
    if (Object.prototype.hasOwnProperty.call(entry, "rating")) {
      if (entry.rating === null || entry.rating === "") entry.rating = null;
      else {
        const rating = Number(entry.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 10) return null;
        entry.rating = rating;
      }
    }
    if (Object.prototype.hasOwnProperty.call(entry, "is_favorite") && typeof entry.is_favorite !== "boolean") return null;
    return entry;
  } catch {
    return null;
  }
}

export function sanitizeBackupEvent(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  try {
    if (!isUuid(source.id) || !isUuid(source.media_id) || !EVENT_TYPES.has(source.event_type) || !isTimestamp(source.occurred_at)) {
      return null;
    }
    const metadata = source.metadata == null ? {} : cloneMetadata(source.metadata);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return {
      id: String(source.id),
      media_id: String(source.media_id),
      event_type: source.event_type,
      occurred_at: source.occurred_at,
      metadata,
    };
  } catch {
    return null;
  }
}

export function sanitizeBackupEvents(events = []) {
  const valid = [];
  const invalid = [];
  for (const raw of events || []) {
    const event = sanitizeBackupEvent(raw);
    if (event) valid.push(event);
    else invalid.push({ id: String(raw?.id || "Événement invalide") });
  }
  return { valid, invalid };
}

function comparable(value) {
  if (value === undefined) return "__undefined__";
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return JSON.stringify(value.map(comparable));
    return JSON.stringify(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
  }
  return JSON.stringify(value);
}

function titleCandidates(candidate, currentEntries) {
  const title = normalizeTitle(candidate.title);
  return currentEntries.filter(entry =>
    entry.media_type === candidate.media_type &&
    normalizedSubtype(entry) === normalizedSubtype(candidate) &&
    normalizeTitle(entry.title) === title
  );
}

export function resolveBackupMatch(candidate, currentEntries = []) {
  if (candidate.id) {
    const sameId = currentEntries.find(entry => String(entry.id) === String(candidate.id));
    if (sameId) return { match: sameId, conflict: false };
  }

  if (candidate.external_id && candidate.source_api) {
    const external = currentEntries.filter(entry =>
      entry.media_type === candidate.media_type &&
      normalizedSubtype(entry) === normalizedSubtype(candidate) &&
      entry.source_api === candidate.source_api &&
      String(entry.external_id || "") === String(candidate.external_id)
    );
    if (external.length === 1) return { match: external[0], conflict: false };
    if (external.length > 1) return { match: null, conflict: true, candidates: external };
  }

  let candidates = titleCandidates(candidate, currentEntries);
  if (!candidates.length) return { match: null, conflict: false };

  const candidateYear = Number(candidate.release_year) || null;
  if (candidateYear) {
    const sameYear = candidates.filter(entry => Number(entry.release_year) === candidateYear);
    if (sameYear.length) candidates = sameYear;
    else if (candidates.some(entry => !entry.release_year)) return { match: null, conflict: true, candidates };
    else return { match: null, conflict: false };
  }

  const candidateAuthor = normalizeTitle(candidate.author);
  if (candidateAuthor) {
    const sameAuthor = candidates.filter(entry => normalizeTitle(entry.author) === candidateAuthor);
    if (sameAuthor.length) candidates = sameAuthor;
    else if (candidates.some(entry => !entry.author)) return { match: null, conflict: true, candidates };
    else return { match: null, conflict: false };
  }

  return candidates.length === 1
    ? { match: candidates[0], conflict: false }
    : { match: null, conflict: true, candidates };
}

export function findBackupMatch(candidate, currentEntries = []) {
  return resolveBackupMatch(candidate, currentEntries).match || null;
}

export function buildRestorePlan(backupEntries, currentEntries = []) {
  const plan = { added: [], updated: [], unchanged: [], conflicts: [], invalid: [] };
  const virtualEntries = currentEntries.map(entry => ({ ...entry }));
  for (const raw of backupEntries || []) {
    const candidate = sanitizeBackupEntry(raw);
    if (!candidate) {
      plan.invalid.push({ title: String(raw?.title || "Média invalide") });
      continue;
    }
    const resolution = resolveBackupMatch(candidate, virtualEntries);
    const existing = resolution.match;
    if (resolution.conflict) {
      plan.conflicts.push({
        sourceId: candidate.id || null,
        title: candidate.title,
        candidates: (resolution.candidates || []).map(item => ({ id: item.id, title: item.title })),
      });
      continue;
    }
    if (String(existing?.id || "").startsWith("restore-preview-")) {
      plan.invalid.push({ title: candidate.title, reason: "duplicate" });
      continue;
    }
    if (!existing) {
      const payload = Object.fromEntries(Object.entries(candidate).filter(([field]) => !IMMUTABLE_FIELDS.has(field)));
      const previewId = `restore-preview-${plan.added.length + 1}`;
      plan.added.push({ sourceId: candidate.id || null, title: candidate.title, payload });
      virtualEntries.push({ ...payload, id: previewId });
      continue;
    }
    const changes = {};
    for (const [field, value] of Object.entries(candidate)) {
      if (IMMUTABLE_FIELDS.has(field) || field === "created_at") continue;
      if (comparable(existing[field]) !== comparable(value)) changes[field] = value;
    }
    if (Object.keys(changes).length) {
      plan.updated.push({ id: existing.id, sourceId: candidate.id || null, title: candidate.title, changes });
      Object.assign(existing, changes);
    } else {
      plan.unchanged.push({ id: existing.id, sourceId: candidate.id || null, title: candidate.title });
    }
  }
  return plan;
}
