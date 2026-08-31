// ============================================================
// Regroupements du Journal — règles pures et testables
// ============================================================

function eventMetadata(event) {
  return event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
}

function mediaKind(entry) {
  if (entry?.media_type === "movie") return entry?.subtype === "tv" ? "tv" : "movie";
  if (entry?.media_type === "game") return "game";
  if (entry?.media_type === "book") return "book";
  return "media";
}

function actionKind(event) {
  const metadata = eventMetadata(event);
  if (event?.event_type === "added") return metadata.status === "wishlist" ? "wishlist" : "added";
  if (event?.event_type === "status_changed") {
    if (["wishlist", "paused", "dropped"].includes(metadata.to)) return metadata.to;
    return "status";
  }
  if (["started", "repeat_started", "finished", "repeat_finished"].includes(event?.event_type)) {
    return event.event_type;
  }
  return null;
}

function dayKeyOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

const MEDIA_WORDS = Object.freeze({
  movie: { plural: "films", added: "ajoutés", started: "commencés", finished: "vus", repeated: "revus", paused: "mis en pause", dropped: "abandonnés" },
  tv:    { plural: "séries", added: "ajoutées", started: "commencées", finished: "vues", repeated: "revues", paused: "mises en pause", dropped: "abandonnées" },
  game:  { plural: "jeux", added: "ajoutés", started: "commencés", finished: "terminés", repeated: "rejoués", paused: "mis en pause", dropped: "abandonnés" },
  book:  { plural: "livres", added: "ajoutés", started: "commencés", finished: "lus", repeated: "relus", paused: "mis en pause", dropped: "abandonnés" },
  media: { plural: "médias", added: "ajoutés", started: "commencés", finished: "terminés", repeated: "repris", paused: "mis en pause", dropped: "abandonnés" },
});

/**
 * Condense uniquement les séries d'au moins trois actions similaires.
 * L'ordre du fil reste celui du premier événement rencontré.
 */
export function groupJournalDayEvents(events, entries, threshold = 3) {
  const entryById = new Map((entries || []).map(entry => [entry.id, entry]));
  const buckets = new Map();

  for (const event of events || []) {
    const entry = entryById.get(event?.media_id);
    const action = actionKind(event);
    if (!entry || !action) continue;
    const kind = mediaKind(entry);
    const key = `${dayKeyOf(event.occurred_at)}:${action}:${kind}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(event);
  }

  const emitted = new Set();
  const result = [];
  for (const event of events || []) {
    const entry = entryById.get(event?.media_id);
    const action = actionKind(event);
    if (!entry || !action) {
      result.push({ kind: "event", event });
      continue;
    }
    const kind = mediaKind(entry);
    const key = `${dayKeyOf(event.occurred_at)}:${action}:${kind}`;
    const bucket = buckets.get(key) || [];
    if (bucket.length < Math.max(3, Number(threshold) || 3)) {
      result.push({ kind: "event", event });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push({ kind: "group", key, action, mediaKind: kind, events: bucket });
  }
  return result;
}

export function journalGroupPresentation(group) {
  const count = group?.events?.length || 0;
  const words = MEDIA_WORDS[group?.mediaKind] || MEDIA_WORDS.media;
  const labels = {
    added: `${count} ${words.plural} ${words.added} à la bibliothèque`,
    wishlist: `${count} ${words.plural} ${words.added} à la wishlist`,
    started: `${count} ${words.plural} ${words.started}`,
    repeat_started: `${count} ${words.plural} repris`,
    finished: `${count} ${words.plural} ${words.finished}`,
    repeat_finished: `${count} ${words.plural} ${words.repeated}`,
    paused: `${count} ${words.plural} ${words.paused}`,
    dropped: `${count} ${words.plural} ${words.dropped}`,
    status: `${count} statuts mis à jour`,
  };
  const icons = {
    added: "＋", wishlist: "＋", started: "▶", repeat_started: "↻",
    finished: "✓", repeat_finished: "↻", paused: "Ⅱ", dropped: "•", status: "•",
  };
  return {
    icon: icons[group?.action] || "•",
    label: labels[group?.action] || `${count} actions regroupées`,
  };
}
