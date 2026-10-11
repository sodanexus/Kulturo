import test from "node:test";
import assert from "node:assert/strict";

import {
  LIBRARY_STATUSES, librarySortOptions, normalizeLegacyEntries, repeatInfo,
  replayFilterLabel, replayProfileCopy, resolveLibrarySort, statusLabelFor,
} from "../domain.js";
import { buildAppRoute, parseAppRoute } from "../features/app-route.js";
import { ADD_PRIMARY_STATUSES, ADD_SECONDARY_STATUSES } from "../features/add-flow.js";

test("le tri automatique suit le statut affiché", () => {
  assert.equal(resolveLibrarySort({ sort: "auto", status: "finished" }), "date_finished");
  assert.equal(resolveLibrarySort({ sort: "auto", status: "wishlist" }), "created_at");
  assert.equal(resolveLibrarySort({ sort: "auto", status: "playing" }), "created_at");
  assert.equal(resolveLibrarySort({ sort: "auto", status: "dropped" }), "created_at");
  assert.equal(resolveLibrarySort({ sort: "auto", status: "all" }), "created_at");
});

test("un tri explicite est respecté, sauf « Fins récentes » sans date de fin", () => {
  assert.equal(resolveLibrarySort({ sort: "title", status: "wishlist" }), "title");
  assert.equal(resolveLibrarySort({ sort: "date_finished", status: "finished" }), "date_finished");
  assert.equal(resolveLibrarySort({ sort: "date_finished", status: "wishlist" }), "created_at");
  assert.equal(resolveLibrarySort({ sort: "inconnu", status: "finished" }), "date_finished");
});

test("« Fins récentes » n'est proposé que pour Terminé", () => {
  assert.ok(librarySortOptions("finished").some(([value]) => value === "date_finished"));
  assert.ok(!librarySortOptions("wishlist").some(([value]) => value === "date_finished"));
});

test("le statut « En pause » n'existe plus", () => {
  assert.ok(!LIBRARY_STATUSES.includes("paused"));
  const all = [...ADD_PRIMARY_STATUSES, ...ADD_SECONDARY_STATUSES].map(item => item.value);
  assert.ok(!all.includes("paused"));
  assert.deepEqual(
    normalizeLegacyEntries([{ id: "1", status: "paused" }, { id: "2", status: "finished" }]).map(item => item.status),
    ["playing", "finished"],
  );
});

test("l'URL accepte « auto » par défaut et refuse un statut supprimé", () => {
  assert.equal(parseAppRoute("#/library").filters.sort, "auto");
  assert.equal(parseAppRoute("#/library?status=paused").filters.status, "finished");
  assert.equal(buildAppRoute({ filters: { sort: "auto", status: "finished" } }), "#/library");
  assert.equal(parseAppRoute(buildAppRoute({ filters: { sort: "title", status: "wishlist" } })).filters.sort, "title");
});

test("un seul vocabulaire par type de média", () => {
  assert.equal(statusLabelFor("finished", "book"), "Lu");
  assert.equal(statusLabelFor("finished", "movie"), "Vu");
  assert.equal(statusLabelFor("finished", "game"), "Terminé");
  assert.equal(statusLabelFor("wishlist", "book"), "Wishlist");
  assert.equal(repeatInfo({ media_type: "book", repeat_count: 1 }).removeLabel, "Retirer une relecture");
  assert.equal(repeatInfo({ media_type: "movie", repeat_count: 1 }).removeLabel, "Retirer un revisionnage");
  assert.equal(repeatInfo({ media_type: "game", repeat_count: 1 }).removeLabel, "Retirer une nouvelle partie");
  assert.equal(replayFilterLabel("all"), "Replays");
  assert.equal(replayFilterLabel("book"), "Relectures");
  const book = replayProfileCopy("book", 2);
  assert.equal(book.noun, "relectures");
  assert.equal(book.description, "Relectures terminées sur cette période.");
  assert.equal(replayProfileCopy("film", 1).noun, "revisionnage");
  assert.equal(replayProfileCopy("all", 1).noun, "replay");
});
