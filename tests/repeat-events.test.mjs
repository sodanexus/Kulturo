import test from "node:test";
import assert from "node:assert/strict";

import {
  eventsForPeriod, isCompletionEvent, isReplayCompletionEvent, staleRepeatEvents,
} from "../domain.js";
import { journalMonthSummary, repeatCountForPeriod } from "../features/insights.js";

const MEDIA = "11111111-1111-4111-8111-111111111111";
const event = (id, type, occurrence, extra = {}, occurred = "2026-10-05T10:00:00Z") => ({
  id, media_id: MEDIA, event_type: type, occurred_at: occurred,
  metadata: { ...(occurrence ? { occurrence } : {}), ...extra },
});

test("retirer l’unique relecture annule son début et sa fin", () => {
  const events = [
    event("a", "finished", 1, {}, "2026-09-01T10:00:00Z"),
    event("b", "repeat_started", 2, {}, "2026-10-01T10:00:00Z"),
    event("c", "repeat_finished", 2, {}, "2026-10-05T10:00:00Z"),
  ];
  const stale = staleRepeatEvents({ id: MEDIA, repeat_count: 0 }, events);
  assert.deepEqual(stale.map(item => item.id).sort(), ["b", "c"]);
});

test("seule la relecture la plus récente est annulée quand il en reste", () => {
  const events = [
    event("s2", "repeat_started", 2), event("f2", "repeat_finished", 2),
    event("s3", "repeat_started", 3), event("f3", "repeat_finished", 3),
  ];
  const stale = staleRepeatEvents({ id: MEDIA, repeat_count: 1 }, events);
  assert.deepEqual(stale.map(item => item.id).sort(), ["f3", "s3"]);
});

test("rien n’est annulé quand le compteur correspond aux événements", () => {
  const events = [event("s2", "repeat_started", 2), event("f2", "repeat_finished", 2)];
  assert.deepEqual(staleRepeatEvents({ id: MEDIA, repeat_count: 1 }, events), []);
});

test("les événements déjà annulés et ceux d’un autre média sont ignorés", () => {
  const events = [
    event("f2", "repeat_finished", 2, { revoked: true }),
    { ...event("x", "repeat_finished", 2), media_id: "22222222-2222-4222-8222-222222222222" },
  ];
  assert.deepEqual(staleRepeatEvents({ id: MEDIA, repeat_count: 0 }, events), []);
});

test("un événement annulé ne compte plus dans les statistiques", () => {
  const revoked = event("f2", "repeat_finished", 2, { revoked: true, hidden_from_journal: true });
  const done = event("a", "finished", 1, { revoked: true });
  assert.equal(isReplayCompletionEvent(revoked), false);
  assert.equal(isCompletionEvent(done), false);
  assert.deepEqual(eventsForPeriod([revoked], 2026), []);
  assert.equal(repeatCountForPeriod([revoked], [{ id: MEDIA, repeat_count: 0 }], 2026), 0);
  assert.equal(journalMonthSummary([done], [{ id: MEDIA }], "2026-10").completed, 0);
});

test("un événement actif compte toujours", () => {
  const active = event("f2", "repeat_finished", 2);
  assert.equal(repeatCountForPeriod([active], [{ id: MEDIA, repeat_count: 1 }], 2026), 1);
});
