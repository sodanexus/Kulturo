import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSeriesProgress, seriesProgress, isSeries } from "../features/reading-progress.js";
import { statusTransitionChanges } from "../domain.js";
import { mergeDetailResponse } from "../features/detail-enrichment.js";
import { sanitizeBackupEntry } from "../features/backup-restore.js";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("la saisie saison / épisode est validée", () => {
  assert.deepEqual(parseSeriesProgress("", ""), { current_season: null, current_episode: null });
  assert.deepEqual(parseSeriesProgress("2", ""), { current_season: 2, current_episode: null });
  assert.deepEqual(parseSeriesProgress("2", "5"), { current_season: 2, current_episode: 5 });
  assert.throws(() => parseSeriesProgress("", "5"), /saison/);
  assert.throws(() => parseSeriesProgress("0", "1"), /saison/);
  assert.throws(() => parseSeriesProgress("2", "0"), /pisode/);
  assert.throws(() => parseSeriesProgress("2.5", ""), /entier/);
  assert.throws(() => parseSeriesProgress("1000", ""), /valide/);
});

test("la jauge indique la saison atteinte, jamais plus", () => {
  assert.deepEqual(seriesProgress({ current_season: 2, current_episode: 5, seasons_count: 4, episodes_count: 40 }), { season: 2, episode: 5, seasons: 4, percent: 38 });
  assert.equal(seriesProgress({ current_season: 2 }).percent, null);
  assert.equal(seriesProgress({ current_season: 9, seasons_count: 4 }).percent, 100);
  assert.equal(seriesProgress({ current_season: 1, current_episode: 60, seasons_count: 4, episodes_count: 40 }).percent, 99);
  // Saison 1/1, épisode 3 sur 8 : la jauge ne doit pas être pleine.
  assert.equal(seriesProgress({ current_season: 1, current_episode: 3, seasons_count: 1, episodes_count: 8 }).percent, 38);
  assert.equal(seriesProgress({ current_season: 1, current_episode: 3, seasons_count: 1 }).percent, 0);
  assert.equal(seriesProgress({}).season, null);
});

test("seules les séries sont concernées", () => {
  assert.equal(isSeries({ media_type: "movie", subtype: "tv" }), true);
  assert.equal(isSeries({ media_type: "movie", subtype: "movie" }), false);
  assert.equal(isSeries({ media_type: "book" }), false);
});

test("une série revue repart sans progression ; ni le reste ni les films n'y touchent", () => {
  const entry = { media_type: "movie", subtype: "tv", status: "finished", date_finished: "2026-10-10", current_season: 3, current_episode: 8, seasons_count: 3 };
  const changes = statusTransitionChanges(entry, "playing").changes;
  assert.equal(changes.current_season, null);
  assert.equal(changes.current_episode, null);
  assert.equal(statusTransitionChanges({ ...entry, status: "playing" }, "playing").changes.current_season, undefined);
  assert.equal(statusTransitionChanges({ ...entry, subtype: "movie" }, "playing").changes.current_season, undefined);
});

test("un catalogue tardif ne rembobine pas la progression", () => {
  const entry = { current_season: 2, current_episode: 5, description: "Résumé" };
  mergeDetailResponse(entry, { current_season: 1, current_episode: 1, seasons_count: 4 });
  assert.equal(entry.current_season, 2);
  assert.equal(entry.current_episode, 5);
  assert.equal(entry.seasons_count, 4);
});

test("la sauvegarde conserve et contrôle la progression des séries", () => {
  const series = { title: "Série", media_type: "movie", subtype: "tv", status: "playing", current_season: 2, current_episode: 5 };
  assert.equal(sanitizeBackupEntry(series).current_season, 2);
  assert.equal(sanitizeBackupEntry(series).current_episode, 5);
  assert.equal(sanitizeBackupEntry({ ...series, current_season: 0 }), null);
  assert.equal(sanitizeBackupEntry({ ...series, current_episode: -3 }), null);
  const { current_season, current_episode, ...old } = series;
  assert.equal(sanitizeBackupEntry(old).current_season, undefined);
});

test("SQL : colonnes, restauration et migration sont synchronisées", () => {
  const schema = read("../schema.sql");
  const migration = read("../migrations/4.4.0-series-progress.sql");
  for (const text of [schema, migration]) {
    assert.match(text, /ADD COLUMN IF NOT EXISTS current_season INTEGER CHECK \(current_season >= 1\)/);
    assert.match(text, /ADD COLUMN IF NOT EXISTS current_episode INTEGER CHECK \(current_episode >= 1\)/);
    assert.match(text, /current_season = v_candidate\.current_season/);
    assert.match(text, /v_candidate\.current_season, v_candidate\.current_episode/);
    assert.match(text, /GRANT EXECUTE ON FUNCTION public\.restore_kulturo_backup/);
  }
});
