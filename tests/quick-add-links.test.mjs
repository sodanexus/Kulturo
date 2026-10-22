import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMediaLink, linkProblemMessage } from "../features/quick-add-links.js";

test("un texte ordinaire n'est pas un lien", () => {
  for (const text of ["", "Dune", "9780441172719", "the matrix 1999", "tt0133093"]) assert.equal(parseMediaLink(text), null, text);
});

test("TMDb : film et série identifiés exactement, avec ou sans langue et slug", () => {
  assert.deepEqual(parseMediaLink("https://www.themoviedb.org/movie/693134-dune-part-two"),
    { provider: "tmdb", mediaType: "movie", subtype: "movie", externalId: "693134" });
  assert.deepEqual(parseMediaLink("https://www.themoviedb.org/tv/94997?language=fr-FR"),
    { provider: "tmdb", mediaType: "movie", subtype: "tv", externalId: "94997" });
  assert.equal(parseMediaLink("themoviedb.org/fr/movie/27205/").externalId, "27205");
  assert.equal(parseMediaLink("https://www.themoviedb.org/person/6193").unsupported, true);
});

test("IMDb : identifiant tt… extrait, y compris depuis un lien mobile ou localisé", () => {
  assert.equal(parseMediaLink("https://www.imdb.com/title/tt0133093/?ref_=nv_sr_srsg_0").imdbId, "tt0133093");
  assert.equal(parseMediaLink("https://m.imdb.com/fr/title/tt1160419/").imdbId, "tt1160419");
  assert.equal(parseMediaLink("https://www.imdb.com/name/nm0000206/").unsupported, true);
});

test("Steam : le titre vient du lien", () => {
  assert.deepEqual(parseMediaLink("https://store.steampowered.com/app/1245620/ELDEN_RING/"),
    { provider: "steam", mediaType: "game", query: "ELDEN RING" });
  assert.equal(parseMediaLink("https://store.steampowered.com/app/1245620/").unsupported, true);
  assert.equal(parseMediaLink("https://store.steampowered.com/app/1086940/Baldurs_Gate_3?l=french").query, "Baldurs Gate 3");
});

test("Goodreads et Hardcover : titre ou ISBN déduits du lien", () => {
  assert.equal(parseMediaLink("https://www.goodreads.com/book/show/234225.Dune").query, "Dune");
  assert.equal(parseMediaLink("https://www.goodreads.com/book/show/44767458-dune?from_search=true").query, "dune");
  assert.equal(parseMediaLink("https://www.goodreads.com/book/isbn/978-0-441-17271-9").query, "9780441172719");
  assert.equal(parseMediaLink("https://www.goodreads.com/book/show/234225").unsupported, true);
  assert.deepEqual(parseMediaLink("https://hardcover.app/books/the-hobbit"), { provider: "hardcover", mediaType: "book", query: "the hobbit" });
  assert.equal(parseMediaLink("hardcover.app/books/fahrenheit-451").query, "fahrenheit 451");
});

test("liens inconnus ou mal formés : message clair, jamais d'exception", () => {
  assert.equal(parseMediaLink("https://example.com/film/12").unsupported, true);
  assert.equal(parseMediaLink("https://"), null);
  assert.match(linkProblemMessage({ reason: "host" }), /pris en charge/);
  assert.match(linkProblemMessage({ reason: "title" }), /fiche précise/);
  assert.equal(parseMediaLink("http://%zz"), null);
});

test("l'ajout rapide est branché sans toucher aux liens externes des fiches", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /parseMediaLink\(query\)/);
  assert.match(app, /TMDb\.byImdb/);
  assert.match(app, /wzOpenScanner/);
  assert.match(fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"), /features\/quick-add-links\.js/);
  assert.match(fs.readFileSync(new URL("../features/media-links.js", import.meta.url), "utf8"), /export function mediaLinks/);
});
