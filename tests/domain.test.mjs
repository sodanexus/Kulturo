import test from "node:test";
import assert from "node:assert/strict";

import {
  entryActivityMonth,
  eventsForPeriod,
  isCompletionEvent,
  journalEventPresentation,
  latestEventMonth,
  repeatInfo,
  statusTransitionChanges,
  uniqueEntriesForEvents,
} from "../domain.js";

test("un média terminé sans date n'est pas attribué à son mois d'ajout", () => {
  assert.equal(entryActivityMonth({
    status: "finished",
    date_finished: null,
    created_at: "2026-08-12T10:00:00Z",
  }), null);
});

test("un média terminé utilise exclusivement sa vraie date de fin", () => {
  assert.equal(entryActivityMonth({
    status: "finished",
    date_finished: "2026-07-18",
    created_at: "2026-08-12T10:00:00Z",
  }), "2026-07");
});

test("une première fin enregistre la date sans ajouter de revisionnage", () => {
  const result = statusTransitionChanges({ status: "playing", repeat_count: 0 }, "finished", "2026-08-26");
  assert.deepEqual(result.changes, { status: "finished", date_finished: "2026-08-26" });
  assert.equal(result.repeatCompleted, false);
});

test("relancer un média déjà terminé conserve le compteur", () => {
  const entry = { status: "finished", media_type: "game", date_started: "2026-06-01", date_finished: "2026-07-01", repeat_count: 0 };
  const result = statusTransitionChanges(entry, "playing", "2026-08-20");
  assert.deepEqual(result.changes, { status: "playing" });
  assert.equal(result.repeatStarted, true);
  assert.equal(repeatInfo({ ...entry, ...result.changes }).total, 1);
});

test("terminer une nouvelle partie incrémente exactement une fois", () => {
  const entry = { status: "playing", media_type: "game", date_finished: "2026-07-01", repeat_count: 0 };
  const result = statusTransitionChanges(entry, "finished", "2026-08-26");
  assert.deepEqual(result.changes, { status: "finished", repeat_count: 1 });
  assert.equal(result.repeatCompleted, true);
  assert.equal(repeatInfo({ ...entry, ...result.changes }).total, 2);
});

test("les événements mensuels ne débordent pas sur un autre mois", () => {
  const events = [
    { id: "a", occurred_at: "2026-07-15T12:00:00Z" },
    { id: "b", occurred_at: "2026-08-12T12:00:00Z" },
    { id: "c", occurred_at: "2025-08-12T12:00:00Z" },
  ];
  assert.deepEqual(eventsForPeriod(events, 2026, "08").map(event => event.id), ["b"]);
});

test("les médias du profil sont dédupliqués même avec plusieurs événements", () => {
  const entries = [{ id: "one" }, { id: "two" }];
  const events = [{ media_id: "one" }, { media_id: "one" }];
  assert.deepEqual(uniqueEntriesForEvents(entries, events), [{ id: "one" }]);
});

test("une nouvelle partie terminée est reconnue comme achèvement", () => {
  assert.equal(isCompletionEvent({ event_type: "repeat_finished" }), true);
  assert.equal(isCompletionEvent({ event_type: "rated" }), false);
});

test("le mois automatique choisit le dernier mois antérieur avec un Top", () => {
  const entries = [
    { id: "july", rating: 9 },
    { id: "june", rating: null },
  ];
  const events = [
    { media_id: "july", occurred_at: "2026-07-14T12:00:00Z" },
    { media_id: "june", occurred_at: "2026-06-14T12:00:00Z" },
  ];
  const month = latestEventMonth(events, entries, "2026-08", entry => Boolean(entry.rating));
  assert.equal(month, "2026-07");
});

test("le Journal adapte le libellé au type de média", () => {
  const result = journalEventPresentation(
    { event_type: "repeat_finished", metadata: { occurrence: 2 } },
    { media_type: "book" },
  );
  assert.deepEqual(result, { icon: "↻", label: "Relecture terminée · 2e fois" });
});
