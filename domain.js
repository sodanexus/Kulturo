// ============================================================
// domain.js — règles métier pures et testables de Kulturo
// ============================================================

// Une fin initiale et une reprise terminée restent deux événements distincts.
// Les statistiques « Terminé » ne doivent jamais absorber les replays.
export const COMPLETION_EVENT_TYPES = new Set(["finished"]);
export const REPLAY_COMPLETION_EVENT_TYPES = new Set(["repeat_finished"]);

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

// Un bilan mensuel n'est définitif qu'une fois le mois entièrement écoulé.
// La comparaison sur YYYY-MM reste volontairement locale afin de ne pas faire
// apparaître le récapitulatif quelques heures trop tôt sur mobile.
export function isClosedMonth(monthKey, now = new Date()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ""))) return false;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return monthKey < currentMonth;
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

export function formatReleaseDate(value, precision = "day") {
  if (!value) return "Date à confirmer";
  const options = precision === "month"
    ? { month: "long", year: "numeric" }
    : precision === "year"
      ? { year: "numeric" }
      : { day: "numeric", month: "long", year: "numeric" };
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isNaN(date.getTime()) ? "Date à confirmer" : new Intl.DateTimeFormat("fr-FR", options).format(date);
}

// La recherche tolère les accents, les apostrophes et la ponctuation. Les
// données restent intactes : seule leur représentation de recherche change.
export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchableEntryParts(entry) {
  return {
    title: normalizeSearchText(entry?.title),
    creators: normalizeSearchText([
      entry?.directors,
      entry?.author,
      entry?.developer,
      entry?.publisher,
    ].filter(Boolean).join(" ")),
    cast: normalizeSearchText(entry?.cast_members),
    details: normalizeSearchText([
      entry?.genre,
      entry?.platform,
      entry?.release_year,
    ].filter(value => value !== null && value !== undefined).join(" ")),
  };
}

// Le score sert à la fois de filtre et de tri. Tous les mots saisis doivent
// être présents quelque part, tandis qu'un titre exact reste toujours premier.
export function librarySearchScore(entry, query) {
  const expected = normalizeSearchText(query);
  if (!expected) return 0;

  const parts = searchableEntryParts(entry);
  const haystack = `${parts.title} ${parts.creators} ${parts.cast} ${parts.details}`.trim();
  const tokens = expected.split(" ").filter(Boolean);
  if (!tokens.every(token => haystack.includes(token))) return 0;

  let score = 100;
  if (parts.title === expected) score += 1000;
  else if (parts.title.startsWith(expected)) score += 850;
  else if (parts.title.includes(expected)) score += 700;
  if (parts.creators.includes(expected)) score += 480;
  if (parts.cast.includes(expected)) score += 360;
  if (parts.details.includes(expected)) score += 240;
  return score;
}

// La barre principale explore toujours la collection entière. Les filtres
// restent dans l'état de l'interface, mais n'entrent de nouveau en jeu qu'une
// fois la recherche effacée.
export function filterLibraryEntries(entries, filters = {}) {
  const source = [...(entries || [])];
  const search = String(filters.search || "").trim();
  if (search) {
    return source.filter(entry => librarySearchScore(entry, search) > 0);
  }

  return source.filter(entry => {
    if (filters.type && filters.type !== "all" && entry.media_type !== filters.type) return false;
    if (filters.subtype && filters.subtype !== "all") {
      if (entry.media_type !== "movie" || normalizedSubtype(entry) !== filters.subtype) return false;
    }
    if (filters.status && filters.status !== "all" && entry.status !== filters.status) return false;
    if (filters.favorite && !entry.is_favorite) return false;
    if (filters.replay && !isReplayEntry(entry)) return false;
    if (filters.year && filters.year !== "all" && entryActivityYear(entry) !== Number(filters.year)) return false;
    if (filters.month && filters.month !== "all" && entryActivityMonth(entry) !== String(filters.month)) return false;
    if (filters.rating && filters.rating !== "all" && Number(entry.rating) !== Number(filters.rating)) return false;
    return true;
  });
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

// Règle unique utilisée par la fiche, la Bibliothèque, le Journal et les filtres.
// Un premier replay est déjà un replay dès son démarrage, avant l'incrément du
// compteur qui intervient seulement lorsqu'il est terminé.
export function isReplayEntry(entry) {
  const info = repeatInfo(entry);
  return info.repeats > 0 || Boolean(repeatProgressLabel(entry, info));
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

export function isReplayCompletionEvent(event) {
  return REPLAY_COMPLETION_EVENT_TYPES.has(event?.event_type);
}

// Le Top mensuel doit refléter une note réellement donnée pendant la période,
// pas la note actuelle d'un média qui aurait seulement été commencé ce mois-là.
// Lors de la création d'un média, la migration 3.0 range toutefois la note
// initiale dans l'événement principal (added/started/finished) : on la conserve.
export function isRatingActivityEvent(event) {
  const metadata = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const rating = Number.parseInt(metadata.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return false;
  if (event?.event_type === "rated" || event?.event_type === "added") return true;
  if (event?.event_type === "started" || event?.event_type === "finished") {
    return !Object.prototype.hasOwnProperty.call(metadata, "from");
  }
  return false;
}

export function isProfileTopEvent(event) {
  return isCompletionEvent(event) || isReplayCompletionEvent(event) || isRatingActivityEvent(event);
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

export function latestEventMonth(
  events,
  entries,
  anchorMonth,
  entryPredicate = () => true,
  eventPredicate = () => true,
) {
  const byId = new Map((entries || []).map(entry => [entry.id, entry]));
  const candidates = new Set();
  for (const event of events || []) {
    const entry = byId.get(event?.media_id);
    const key = yearMonthOf(event?.occurred_at);
    if (!entry || !key || key >= anchorMonth || !entryPredicate(entry) || !eventPredicate(event)) continue;
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
