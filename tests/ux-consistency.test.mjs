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
test("les livres ouvrent directement leur source et ne suivent pas des URLs tierces", () => {
  const hardcover = mediaLinks({title:"Dune", media_type:"book", source_api:"hardcover", external_id:"123:456"});
  assert.equal(hardcover[0]?.url, "https://hardcover.app/book/123");
  const open = mediaLinks({title:"Dune", media_type:"book", source_api:"openlibrary", external_id:"OL123W", external_url:"https://example.com/livre"});
  assert.equal(open[0]?.url, "https://openlibrary.org/works/OL123W");
  assert.deepEqual(mediaLinks({title:"Dune",media_type:"book",source_api:"manual"}), []);
});
test("les jeux pointent vers IGDB, les films vers TMDB et les bandes-annonces sont directes", () => {
  assert.ok(mediaLinks({ title: "Jeu", media_type: "game", platform: "PC" })[0].url.includes("igdb.com"));
  assert.equal(mediaLinks({ title: "Jeu", media_type: "game", igdb_url: "https://www.igdb.com/games/portal-2" })[0].url, "https://www.igdb.com/games/portal-2");
  assert.ok(mediaLinks({ title: "Jeu", media_type: "game", platform: "PS5" }).every(link => !link.url.includes("steampowered.com")));
  assert.equal(mediaLinks({ title: "Dune", media_type: "movie", source_api: "tmdb", external_id: "438631" })[0].url, "https://www.themoviedb.org/movie/438631");
  assert.equal(mediaLinks({ title: "Série", media_type: "movie", subtype: "tv", source_api: "tmdb", external_id: "44" })[0].url, "https://www.themoviedb.org/tv/44");
  const links = mediaLinks({ title: '<Film & série>', media_type: "movie", external_url: "javascript:alert(1)" });
  assert.ok(links.every(link => link.url.startsWith("https://")));
  assert.ok(!links.some(link => link.label === "Bande-annonce"));
  assert.ok(mediaLinks({ title: "Jeu", media_type: "game", trailer_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }).some(link => link.kind === "video"));
});
