import test from "node:test";
import assert from "node:assert/strict";
import { filterLibraryEntries } from "../domain.js";
import { createAddDraft, selectManualAdd, selectAddResult } from "../features/add-flow.js";
import { buildAppRoute, parseAppRoute } from "../features/app-route.js";
import { mediaLinks } from "../features/media-links.js";

const entries = [
  { id: "film", title: "Dune", media_type: "movie", subtype: "movie", status: "finished", is_favorite: true },
  { id: "series", title: "Dune", media_type: "movie", subtype: "tv", status: "wishlist" },
  { id: "book", title: "Dune", media_type: "book", status: "playing" },
  { id: "legacy", title: "Dune ancien", media_type: "movie", status: "finished" },
];
test("la recherche respecte catégorie, statut et favoris sans muter les critères", () => {
  const filters = { search: "dûne", type: "movie", subtype: "tv", status: "wishlist" };
  assert.deepEqual(filterLibraryEntries(entries, filters).map(e => e.id), ["series"]);
  assert.equal(filters.search, "dûne");
  assert.deepEqual(filterLibraryEntries(entries, { search: "Dune", favorite: true }).map(e => e.id), ["film"]);
  assert.equal(filterLibraryEntries(entries, { ...filters, status: "finished" }).length, 0);
  assert.equal(filterLibraryEntries(entries, { search: "Dune", status: "all" }).length, 4);
  assert.deepEqual(filterLibraryEntries(entries, { type: "movie", subtype: "movie" }).map(e => e.id), ["film", "legacy"]);
});
test("l’ajout manuel d’une série conserve le modèle movie / tv", () => {
  const series = selectManualAdd(createAddDraft(), " Ma série ", "tv");
  assert.equal(series.type, "movie"); assert.equal(series.subtype, "tv"); assert.equal(series.title, "Ma série");
  assert.equal(selectManualAdd(series, "Un livre", "book").subtype, null);
  assert.equal(selectAddResult(series, { title: "Un film", media_type: "movie" }).subtype, "movie");
});
test("la route conserve les recherches indépendantes et le filtre Séries", () => {
  const route = parseAppRoute(buildAppRoute({ page: "upcoming", filters: { search: "Dune", type: "movie", subtype: "tv" }, views: { upcoming: { search: "été", type: "book", hideAdded: false } } }));
  assert.equal(route.filters.search, "Dune"); assert.equal(route.filters.subtype, "tv");
  assert.equal(route.views.upcoming.search, "été"); assert.equal(route.views.upcoming.type, "book");
});
test("les livres ont des liens de livre et ne reçoivent pas de bande-annonce", () => {
  const links = mediaLinks({ title: "Dune", media_type: "book", source_api: "openlibrary", external_id: "OL123W", isbn: "9781234567890" });
  assert.equal(links[0].url, "https://openlibrary.org/works/OL123W");
  assert.ok(links.some(link => link.label === "Chercher un extrait"));
  assert.ok(!links.some(link => link.kind === "video"));
  const manual = mediaLinks({ title: "Livre", media_type: "book", source_api: "manual", external_id: "autre-id" });
  assert.ok(manual.every(link => !link.url.includes("/works/")));
  assert.ok(mediaLinks({ title: "Livre", media_type: "book", preview_url: "https://example.com/extrait", publisher_url: "https://example.com/editeur" }).some(link => link.label === "Lire un extrait"));
});
test("les jeux console ne sont pas envoyés sur Steam et les liens dangereux sont ignorés", () => {
  assert.ok(mediaLinks({ title: "Jeu", media_type: "game", platform: "PC" })[0].url.includes("steampowered.com"));
  assert.ok(mediaLinks({ title: "Jeu", media_type: "game", platform: "PS5" })[0].url.includes("playstation.com"));
  assert.ok(mediaLinks({ title: "Jeu", media_type: "game", platform: "Nintendo Switch" }).every(link => !link.url.includes("steampowered.com")));
  const links = mediaLinks({ title: '<Film & série>', media_type: "movie", external_url: "javascript:alert(1)" });
  assert.ok(links.every(link => link.url.startsWith("https://")));
  assert.ok(links.some(link => link.label === "Bande-annonce"));
});
