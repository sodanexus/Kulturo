// ============================================================
// Validation et planification sûre des restaurations Kulturo
// ============================================================

import { normalizeTitle, normalizedSubtype } from "../domain.js";

const MEDIA_TYPES = new Set(["movie", "game", "book"]);
const STATUSES = new Set(["wishlist", "playing", "finished", "paused", "dropped"]);
const IMMUTABLE_FIELDS = new Set(["id", "user_id", "updated_at"]);
const ALLOWED_FIELDS = new Set([
  "id", "title", "media_type", "status", "rating", "is_favorite", "repeat_count",
  "notes", "cover_url", "date_started", "date_finished", "external_id", "source_api",
  "subtype", "genre", "author", "release_year", "release_date", "release_date_precision",
  "platform", "description", "backdrop_url", "directors", "cast_members", "duration",
  "seasons_count", "episodes_count", "air_status", "watch_providers", "developer",
  "publisher", "page_count", "isbn", "created_at",
]);

function cloneSafeValue(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 200).map(cloneSafeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 200).map(([key, item]) => [key, cloneSafeValue(item)]));
  }
  return null;
}

export function parseKulturoBackup(text, { maxEntries = 10000 } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Le fichier de sauvegarde est vide.");
  let backup;
  try { backup = JSON.parse(text); }
  catch { throw new Error("Ce fichier n’est pas un JSON valide."); }
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) throw new Error("Format de sauvegarde invalide.");
  if (backup.app !== "Kulturo") throw new Error("Ce fichier n’est pas une sauvegarde Kulturo.");
  if (!Array.isArray(backup.entries)) throw new Error("La liste des médias est absente de la sauvegarde.");
  if (backup.entries.length > maxEntries) throw new Error(`La sauvegarde dépasse la limite de ${maxEntries} médias.`);
  return { ...backup, entries: backup.entries };
}

export function sanitizeBackupEntry(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const entry = {};
  for (const field of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    entry[field] = cloneSafeValue(source[field]);
  }
  entry.title = String(entry.title || "").trim().slice(0, 500);
  if (!entry.title || !MEDIA_TYPES.has(entry.media_type)) return null;
  if (entry.status != null && !STATUSES.has(entry.status)) entry.status = "wishlist";
  if (entry.rating != null) entry.rating = Math.max(0, Math.min(10, Number(entry.rating) || 0)) || null;
  if (entry.repeat_count != null) entry.repeat_count = Math.max(0, Math.min(999, Number.parseInt(entry.repeat_count, 10) || 0));
  entry.is_favorite = Boolean(entry.is_favorite);
  if (entry.release_date_precision != null && !["day", "month", "year"].includes(entry.release_date_precision)) {
    entry.release_date_precision = "day";
  }
  return entry;
}

function comparable(value) {
  if (value === undefined) return "__undefined__";
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return JSON.stringify(value.map(comparable));
    return JSON.stringify(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
  }
  return JSON.stringify(value);
}

export function findBackupMatch(candidate, currentEntries = []) {
  if (candidate.id) {
    const sameId = currentEntries.find(entry => String(entry.id) === String(candidate.id));
    if (sameId) return sameId;
  }
  const candidateSubtype = normalizedSubtype(candidate);
  if (candidate.external_id && candidate.source_api) {
    const external = currentEntries.find(entry =>
      entry.media_type === candidate.media_type &&
      normalizedSubtype(entry) === candidateSubtype &&
      entry.source_api === candidate.source_api &&
      String(entry.external_id || "") === String(candidate.external_id)
    );
    if (external) return external;
  }
  const title = normalizeTitle(candidate.title);
  return currentEntries.find(entry => {
    if (entry.media_type !== candidate.media_type || normalizedSubtype(entry) !== candidateSubtype) return false;
    if (normalizeTitle(entry.title) !== title) return false;
    const sourceYear = Number(candidate.release_year) || null;
    const currentYear = Number(entry.release_year) || null;
    return !sourceYear || !currentYear || sourceYear === currentYear;
  }) || null;
}

export function buildRestorePlan(backupEntries, currentEntries = []) {
  const plan = { added: [], updated: [], unchanged: [], invalid: [] };
  const virtualEntries = currentEntries.map(entry => ({ ...entry }));
  for (const raw of backupEntries || []) {
    const candidate = sanitizeBackupEntry(raw);
    if (!candidate) {
      plan.invalid.push({ title: String(raw?.title || "Média invalide") });
      continue;
    }
    const existing = findBackupMatch(candidate, virtualEntries);
    if (String(existing?.id || "").startsWith("restore-preview-")) {
      plan.invalid.push({ title: candidate.title, reason: "duplicate" });
      continue;
    }
    if (!existing) {
      const payload = Object.fromEntries(Object.entries(candidate).filter(([field]) => !IMMUTABLE_FIELDS.has(field)));
      plan.added.push({ title: candidate.title, payload });
      virtualEntries.push({ ...payload, id: candidate.id || `restore-preview-${plan.added.length}` });
      continue;
    }
    const changes = {};
    for (const [field, value] of Object.entries(candidate)) {
      if (IMMUTABLE_FIELDS.has(field) || field === "created_at") continue;
      if (comparable(existing[field]) !== comparable(value)) changes[field] = value;
    }
    if (Object.keys(changes).length) {
      plan.updated.push({ id: existing.id, title: candidate.title, changes });
      Object.assign(existing, changes);
    }
    else plan.unchanged.push({ id: existing.id, title: candidate.title });
  }
  return plan;
}
