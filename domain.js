// ============================================================
// domain.js — règles métier pures et testables de Kulturo
// ============================================================

export const COMPLETION_EVENT_TYPES = new Set(["finished", "repeat_finished"]);

export function localISODate(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function yearOf(value) {
  if (!value) return null;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);
  const year = date.getFullYear();
  return Number.isFinite(year) ? year : null;
}

export function yearMonthOf(value) {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Une œuvre terminée sans date de fin ne doit jamais être attribuée à son mois
// d'ajout : ce repli gonflait artificiellement certaines statistiques.
export function entryActivityValue(entry) {
  if (!entry) return null;
  if (entry.status === "finished") return entry.date_finished || null;
  return entry.date_started || entry.created_at || null;
}

export function entryActivityYear(entry) {
  return yearOf(entryActivityValue(entry));
}

export function entryActivityMonth(entry) {
  return yearMonthOf(entryActivityValue(entry));
}

export function normalizeTitle(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR");
}

export function normalizedSubtype(item) {
  return item?.media_type === "movie" || item?.subtype
    ? (item?.subtype === "tv" ? "tv" : "movie")
    : null;
}

export function repeatInfo(entry) {
  const repeats = Math.max(0, Number.parseInt(entry?.repeat_count, 10) || 0);
  const hasFirstCompletion = Boolean(entry?.date_finished || entry?.status === "finished" || repeats > 0);
  const total = hasFirstCompletion ? repeats + 1 : 0;
  if (entry?.media_type === "book") return { repeats, total, noun: "lecture", done: "Lu", action: "Relire" };
  if (entry?.media_type === "game") return { repeats, total, noun: "partie terminée", done: "Terminé", action: "Rejouer" };
  return { repeats, total, noun: "visionnage", done: "Vu", action: "Revoir" };
}

export function repeatProgressLabel(entry, info = repeatInfo(entry)) {
  if (entry?.status !== "playing" || info.total < 1) return "";
  if (entry.media_type === "book") return "Relecture en cours";
  if (entry.media_type === "game") return "Nouvelle partie en cours";
  return "Revisionnage en cours";
}

export function statusTransitionChanges(entry, nextStatus, today = localISODate()) {
  const previousStatus = entry?.status || null;
  const info = repeatInfo(entry || {});
  const hasPreviousCompletion = Boolean(entry && info.total > 0);
  const repeatStarted = nextStatus === "playing" && previousStatus !== "playing" && hasPreviousCompletion;
  const repeatCompleted = nextStatus === "finished" && previousStatus === "playing" && hasPreviousCompletion;
  const changes = { status: nextStatus };

  if (nextStatus === "playing" && !entry?.date_started && previousStatus !== "playing") {
    changes.date_started = today;
  }
  if (repeatStarted && !entry?.date_finished) changes.date_finished = today;

  if (nextStatus === "finished") {
    if (repeatCompleted) changes.repeat_count = Math.min(999, info.repeats + 1);
    else if (!entry?.date_finished && previousStatus !== "finished") changes.date_finished = today;
  }

  return { changes, repeatStarted, repeatCompleted };
}

export function isCompletionEvent(event) {
  return COMPLETION_EVENT_TYPES.has(event?.event_type);
}

export function eventsForPeriod(events, year, month = "all") {
  const expectedYear = Number(year);
  return (events || []).filter(event => {
    const key = yearMonthOf(event?.occurred_at);
    if (!key || Number(key.slice(0, 4)) !== expectedYear) return false;
    return month === "all" || key === `${expectedYear}-${String(month).padStart(2, "0")}`;
  });
}

export function uniqueEntriesForEvents(entries, events) {
  const ids = new Set((events || []).map(event => event?.media_id).filter(Boolean));
  return (entries || []).filter(entry => ids.has(entry.id));
}

export function latestEventMonth(events, entries, anchorMonth, entryPredicate = () => true) {
  const byId = new Map((entries || []).map(entry => [entry.id, entry]));
  const candidates = new Set();
  for (const event of events || []) {
    const entry = byId.get(event?.media_id);
    const key = yearMonthOf(event?.occurred_at);
    if (!entry || !key || key >= anchorMonth || !entryPredicate(entry)) continue;
    candidates.add(key);
  }
  return [...candidates].sort((a, b) => b.localeCompare(a))[0] || null;
}

export function journalEventPresentation(event, entry) {
  const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const occurrence = Math.max(1, Number.parseInt(metadata.occurrence, 10) || 1);
  const rating = Number.parseInt(metadata.rating, 10);
  const mediaType = entry?.media_type;
  const finished = mediaType === "book" ? "Lecture terminée" : mediaType === "game" ? "Partie terminée" : "Visionnage terminé";
  const started = mediaType === "book" ? "Lecture commencée" : mediaType === "game" ? "Partie commencée" : "Visionnage commencé";
  const repeatStarted = mediaType === "book" ? "Relecture commencée" : mediaType === "game" ? "Nouvelle partie commencée" : "Revisionnage commencé";
  const repeatFinished = mediaType === "book" ? "Relecture terminée" : mediaType === "game" ? "Nouvelle partie terminée" : "Revisionnage terminé";

  switch (event?.event_type) {
    case "started":
      return { icon: "▶", label: started };
    case "repeat_started":
      return { icon: "↻", label: `${repeatStarted} · ${occurrence}e fois` };
    case "finished": {
      const legacyTotal = Math.max(1, Number.parseInt(metadata.legacy_repeat_total, 10) || 1);
      return legacyTotal > 1
        ? { icon: "✓", label: `${finished} · ${legacyTotal} fois au total` }
        : { icon: "✓", label: finished };
    }
    case "repeat_finished":
      return { icon: "↻", label: `${repeatFinished} · ${occurrence}e fois` };
    case "rated":
      return Number.isInteger(rating) && rating >= 1
        ? { icon: "★", label: "Note enregistrée" }
        : { icon: "☆", label: "Note retirée" };
    case "status_changed": {
      const labels = { wishlist: "Ajouté à la wishlist", paused: "Mis en pause", dropped: "Abandonné" };
      return { icon: metadata.to === "wishlist" ? "＋" : "•", label: labels[metadata.to] || "Statut modifié" };
    }
    default:
      return {
        icon: metadata.status === "wishlist" ? "＋" : "•",
        label: metadata.status === "wishlist" ? "Ajouté à la wishlist" : "Ajouté à la bibliothèque",
      };
  }
}
