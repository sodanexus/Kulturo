import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../app.js");

test("Modifier : le type est un sélecteur, les onglets d'origine restent pour l'action", () => {
  assert.match(app, /id="f-type-select"/);
  assert.match(app, /modal-type-tabs edit-type-legacy/);
  // Les quatre actions setModalType sont conservées.
  for (const type of ["movie", "tv", "game", "book"]) {
    assert.match(app, new RegExp(`data-type="${type}" \\$\\{uiAction\\("setModalType", \\["${type}"\\]\\)\\}`));
  }
  assert.match(app, /function setupEditTypeSelect/);
});

test("Modifier : Mon avis précède les étoiles, avec le libellé standard", () => {
  const view = app.slice(app.indexOf('<div class="edit-primary-view">'), app.indexOf('class="edit-details-trigger"'));
  assert.ok(view.indexOf("Mon avis") > view.indexOf('id="f-status"'));
  assert.ok(view.indexOf("Mon avis") < view.indexOf('id="rating-stars"'));
  assert.match(view, /<label>Mon avis <span id="rating-tooltip"/);
  assert.ok(view.indexOf('class="edit-avis-grid"') < view.indexOf('id="edit-repeat"'));
  assert.ok(view.indexOf('id="edit-repeat"') < view.indexOf('id="f-favorite"'));
});

test("Modifier : Supprimer garde son action mais devient un lien à gauche du pied", () => {
  assert.match(app, /btn-danger btn-sm edit-delete-link" \$\{uiAction\("deleteEntry", \[entry\.id\]\)\}/);
  assert.match(read("../styles/finesse.css"), /\.edit-delete-link \{\s*margin-right: auto;/);
});

test("Modifier : sur mobile le focus initial ne tombe pas sur le sélecteur", () => {
  assert.match(app, /compactEdit \? "\.edit-modal \.modal-footer \.btn-secondary"/);
});

test("Ma lecture suit le gabarit de la grille Mon avis", () => {
  const view = app.slice(app.indexOf('<div class="edit-primary-view">'), app.indexOf('class="edit-details-trigger"'));
  assert.ok(view.indexOf('class="edit-avis-grid"') < view.indexOf('id="edit-reading"'));
  assert.match(view, /<label for="f-current-page">Ma lecture<\/label>/);
  assert.match(view, /class="edit-reading-tile"/);
  assert.match(read("../styles/enhancements.css"), /\.edit-avis-grid \.edit-reading \{ grid-column: 1 \/ -1; \}/);
});
