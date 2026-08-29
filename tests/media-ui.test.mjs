import test from "node:test";
import assert from "node:assert/strict";
import {
  ADD_PRIMARY_STATUSES,
  createAddDraft,
  isSecondaryAddStatus,
  selectAddResult,
  selectManualAdd,
  setAddDraftStatus,
} from "../features/add-flow.js";
import {
  entriesForMetadata,
  metadataDefinition,
  metadataExternalLink,
  normalizeMetadataValue,
  splitMetadataValues,
} from "../features/media-metadata.js";

test("le nouvel ajout commence par une recherche compacte et Terminé par défaut", () => {
  const draft = createAddDraft("  Magnolia  ");
  assert.equal(draft.step, 1);
  assert.equal(draft.title, "Magnolia");
  assert.equal(draft._status, "finished");
  assert.deepEqual(ADD_PRIMARY_STATUSES.map(status => status.value), ["wishlist", "playing", "finished"]);
});

test("toucher un résultat prépare directement l'écran final", () => {
  const item = { title: "Dune", media_type: "book", external_id: "work" };
  const draft = selectAddResult({ ...createAddDraft(), rating: 8, favorite: true }, item);
  assert.equal(draft.step, 2);
  assert.equal(draft.type, "book");
  assert.strictEqual(draft.apiSelected, item);
  assert.equal(draft.rating, 0);
  assert.equal(draft.favorite, false);
  assert.equal("notes" in draft, false);
});

test("l'ajout manuel exige un titre et un type reconnus", () => {
  const initial = createAddDraft();
  assert.strictEqual(selectManualAdd(initial, "", "movie"), initial);
  assert.strictEqual(selectManualAdd(initial, "Dune", "music"), initial);
  const manual = selectManualAdd(initial, " Dune ", "movie");
  assert.equal(manual.step, 2);
  assert.equal(manual.title, "Dune");
  assert.equal(manual.apiSelected, null);
});

test("les statuts secondaires restent accessibles sans devenir prioritaires", () => {
  const initial = createAddDraft();
  assert.strictEqual(setAddDraftStatus(initial, "unknown"), initial);
  assert.equal(setAddDraftStatus(initial, "paused")._status, "paused");
  assert.equal(isSecondaryAddStatus("paused"), true);
  assert.equal(isSecondaryAddStatus("finished"), false);
});

test("les valeurs de métadonnées sont découpées et normalisées", () => {
  assert.deepEqual(splitMetadataValues("Thriller, Drame ; Thriller"), ["Thriller", "Drame"]);
  assert.deepEqual(splitMetadataValues('["PC", "PlayStation 5"]'), ["PC", "PlayStation 5"]);
  assert.equal(normalizeMetadataValue("  CÉLINE Sciamma "), "celine sciamma");
});

test("les personnes et catégories retrouvent uniquement les médias concernés", () => {
  const entries = [
    { id: "1", title: "Prisoners", media_type: "movie", rating: 9, directors: "Denis Villeneuve", cast_members: "Jake Gyllenhaal, Hugh Jackman", genre: "Thriller, Drame" },
    { id: "2", title: "Enemy", media_type: "movie", rating: 7, directors: "Denis Villeneuve", cast_members: "Jake Gyllenhaal", genre: "Thriller" },
    { id: "3", title: "Dune", media_type: "movie", rating: 8, directors: "Denis Villeneuve", cast_members: "Timothée Chalamet", genre: "Science-fiction" },
  ];
  assert.deepEqual(entriesForMetadata(entries, "cast", "Jake Gyllenhaal").map(entry => entry.id), ["1", "2"]);
  assert.deepEqual(entriesForMetadata(entries, "genre", "Thriller").map(entry => entry.id), ["1", "2"]);
  assert.equal(metadataDefinition("director").label, "Réalisation");
});

test("les liens externes conservent IMDb et restent limités aux sources pertinentes", () => {
  assert.deepEqual(metadataExternalLink("cast", "Jake Gyllenhaal", "https://www.imdb.com/name/nm0350453/"), {
    url: "https://www.imdb.com/name/nm0350453/",
    label: "Voir sur IMDb",
  });
  assert.match(metadataExternalLink("director", "Denis Villeneuve").url, /imdb\.com\/find/);
  assert.match(metadataExternalLink("developer", "Remedy Entertainment").url, /store\.steampowered\.com\/search\/\?term=Remedy%20Entertainment/);
  assert.equal(metadataExternalLink("genre", "Drame"), null);
});
