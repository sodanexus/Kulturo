import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { repeatInfo, statusTransitionChanges } from "../domain.js";
import { DETAIL_ENRICHMENT_FIELDS } from "../features/detail-enrichment.js";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("la fiche n'a plus d'actions rapides : consulter d'un côté, gérer dans Modifier", () => {
  const detail = read("../features/media-detail.js");
  assert.doesNotMatch(detail, /quickActionsHTML|quickSetStatus|quickAdjustRepeat|persistQuickEntryChange/);
  const app = read("../app.js");
  assert.doesNotMatch(app, /quickSetStatus|quickAdjustRepeat/);
  // Le pied de fiche garde Supprimer et Modifier.
  assert.match(detail, /uiAction\("deleteEntry", \[e\.id\]\)/);
  assert.match(detail, /uiAction\("openEditFromDetail", \[e\.id\]\)/);
});

test("le badge de statut s'affiche aussi pour le propriétaire, sans être un bouton", () => {
  const detail = read("../features/media-detail.js");
  assert.match(detail, /: e\.status\s*\?\s*`<span class="badge badge-\$\{e\.status\}" id="detail-status-/);
  assert.match(read("../styles/finesse.css"), /\.detail-modal \.detail-badges \.badge \{ cursor: default; pointer-events: none; \}/);
});

test("la fiche présente Informations, Crédits, Casting, Notes externes et Historique", () => {
  const detail = read("../features/media-detail.js");
  for (const label of ["Informations", "Crédits", "Casting", "Notes externes", "Historique"]) {
    assert.match(detail, new RegExp(`detailSectionHTML\\("${label}"`), label);
  }
  // L'historique personnel n'apparaît pas sur les fiches partagées.
  assert.match(detail, /if \(!options\.readOnly\) \{[\s\S]+detailSectionHTML\("Historique"/);
});

test("les notes externes sont transitoires et nommées par leur source", () => {
  assert.ok(!DETAIL_ENRICHMENT_FIELDS.includes("external_ratings"));
  const api = read("../api.js");
  assert.match(api, /externalRating\("tmdb", "TMDb"/);
  assert.match(api, /externalRating\("igdb", "IGDB"[^)]*kind: "joueurs"/);
  assert.match(api, /externalRating\("igdb", "IGDB"[^)]*kind: "presse"/);
  assert.match(read("../app.js"), /"cast_people", "external_ratings"/);
  assert.match(read("../features/media-detail.js"), /e\.external_ratings = details\.external_ratings/);
});

test("Modifier : la section Relecture est regroupée avec le statut et enregistrée par Enregistrer", () => {
  const app = read("../app.js");
  assert.match(app, /id="edit-repeat"/);
  assert.match(app, /adjustEditRepeat,\n/);
  assert.match(app, /function adjustEditRepeat[\s\S]+markModalDirty\(\)[\s\S]+renderEditRepeat\(\)/);
  // Le pas manuel n'écrit rien en base : il n'est envoyé que par saveEntry.
  assert.doesNotMatch(app.slice(app.indexOf("function adjustEditRepeat"), app.indexOf("function syncEditDetailsSummary")), /Media\.update/);
  assert.match(app, /if \(existing && _editRepeatDelta !== 0\)/);
  assert.match(app, /repeatInfo\(savedEntry\)\.repeats < previousRepeats\) void revokeStaleRepeatEvents/);
});

test("une reprise terminée n'est comptée qu'une fois (statut + pas manuel)", () => {
  // Terminé deux fois, nouvelle partie en cours : repeat_count = 1, statut « playing ».
  const entry = { id: "a", status: "playing", media_type: "game", repeat_count: 1, date_finished: "2026-01-01" };
  const automatic = statusTransitionChanges(entry, "finished").changes.repeat_count;
  assert.equal(automatic, 2);
  // Le résultat final = automatique + pas manuel : sans pas, 2 et non 3.
  const final = Math.max(0, Math.min(999, automatic + 0));
  assert.equal(final, 2);
  assert.equal(repeatInfo({ ...entry, status: "finished", repeat_count: final }).total, 3);
  // Un pas manuel de −1 annule l'ajout automatique.
  assert.equal(Math.max(0, Math.min(999, automatic - 1)), 1);
});

test("passer de Terminé à En cours démarre une reprise sans toucher au compteur", () => {
  const entry = { id: "b", status: "finished", media_type: "movie", repeat_count: 0, date_finished: "2026-02-01" };
  const transition = statusTransitionChanges(entry, "playing");
  assert.equal(transition.repeatStarted, true);
  assert.ok(!Object.prototype.hasOwnProperty.call(transition.changes, "repeat_count"));
});
