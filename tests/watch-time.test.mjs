import test from "node:test";
import assert from "node:assert/strict";
import { entryWatchTime, formatWatchTime, watchTimeByMedia } from "../features/insights.js";

test("temps passé : durée exacte pour un film, repli sinon", () => {
  assert.deepEqual(entryWatchTime({ media_type: "movie", subtype: "movie", duration: 120 }), { key: "film", minutes: 120, estimated: false });
  assert.equal(entryWatchTime({ media_type: "movie", subtype: "movie" }).estimated, true);
});
test("temps passé : série terminée = épisodes × durée d'épisode", () => {
  assert.equal(entryWatchTime({ media_type: "movie", subtype: "tv", episodes_count: 10, duration: 50 }).minutes, 500);
  assert.equal(entryWatchTime({ media_type: "movie", subtype: "tv", episodes_count: 10 }).minutes, 450);
  assert.equal(entryWatchTime({ media_type: "movie", subtype: "tv" }), null);
});
test("temps passé : livres à 40 pages/h, jeux seulement si durée connue", () => {
  assert.equal(entryWatchTime({ media_type: "book", page_count: 400 }).minutes, 600);
  assert.equal(entryWatchTime({ media_type: "game" }), null);
  assert.equal(entryWatchTime({ media_type: "game", duration: 900 }).minutes, 900);
});
test("temps passé : total par média et œuvres sans durée", () => {
  const r = watchTimeByMedia([{ media_type: "book", page_count: 40 }, { media_type: "game" }]);
  assert.equal(r.book, 60); assert.equal(r.total, 60); assert.equal(r.missing, 1);
  assert.equal(formatWatchTime(45), "45 min"); assert.equal(formatWatchTime(90), "1,5 h"); assert.equal(formatWatchTime(1380), "23 h");
});
