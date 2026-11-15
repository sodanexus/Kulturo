import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("« Commentaire » : un seul commentaire privé par œuvre, dans la colonne notes existante", () => {
  const detail = read("features/media-detail.js");
  // Réservé au propriétaire : ni fiche partagée (readOnly), ni aperçu, ni saga.
  assert.match(detail, /if \(!options\.readOnly && !options\.preview\) \{\s*html \+= `<div class="detail-note-slot"/);
  assert.match(detail, /preview: isPreview \|\| isSagaPreview/);
  // Juste après le synopsis, dans un emplacement à part : jamais reconstruit par
  // l'enrichissement de la fiche (qui ne remplace que le synopsis et les infos).
  const body = detail.slice(detail.indexOf("function renderDetailBody"));
  const order = ["detail-synopsis-slot-", "detail-info-slot-", "detail-note-slot", "detail-history-slot-"].map(name => body.indexOf(name));
  assert.ok(order.every(index => index > -1) && order.every((index, i) => i === 0 || order[i - 1] < index), "synopsis, informations, commentaire, puis historique");
  // Enregistrement par le même mécanisme que le reste (hors ligne compris), colonne notes.
  assert.match(detail, /Media\.update\(entry\.id, \{ notes: value \}\)/);
  // Texte brut échappé, longueur bornée.
  assert.match(detail, /<div class="detail-note-bubble"><p class="detail-note-text">\$\{esc\(note\)\}<\/p><\/div>/);
  assert.match(detail, /function renderDetailHistoryHTML/);
  assert.match(detail, /Commentaire/);
  assert.match(detail, /NOTE_MAX_LENGTH = 500/);
  assert.match(detail, /maxlength="\$\{NOTE_MAX_LENGTH\}"/);
});

test("« Commentaire » : les actions sont branchées de la fiche au répartiteur", () => {
  const app = read("app.js");
  const detail = read("features/media-detail.js");
  for (const action of ["editDetailNote", "cancelDetailNote", "saveDetailNote"]) {
    assert.match(app, new RegExp(`${action}: id => mediaDetailFeature\\.${action}\\(id\\)`));
    assert.ok(detail.includes(`uiAction("${action}"`), `${action} est utilisée dans la fiche`);
    assert.match(detail, new RegExp(`^\\s+${action},$`, "m")); // exportée par la fonctionnalité
  }
});

test("les notes personnelles restent hors du fil communautaire et du partage", () => {
  const schema = read("schema.sql");
  const feed = schema.slice(schema.indexOf("CREATE FUNCTION public.get_activity_feed"));
  assert.doesNotMatch(feed.slice(0, feed.indexOf("$$;") > 0 ? feed.indexOf("$$;") : 4000), /\bnotes\b/);
  assert.doesNotMatch(read("migrations/4.9.11-community-details.sql").replace(/^--.*$/gm, ""), /\bnotes\b/);
});

test("le champ de saisie évite le zoom iOS et ne passe jamais sous la barre d'actions", () => {
  const css = read("styles/finesse.css");
  assert.match(css, /\.detail-note-input \{[^}]*font-size: 16px/);
  assert.match(css, /scroll-margin-bottom/);
  // Texte en italique dans une bulle ; filet dégradé avant le commentaire.
  assert.match(css, /\.detail-note-text \{[^}]*font-style: italic/);
  assert.match(css, /\.detail-note-bubble::after/);
  assert.match(css, /\.detail-note-slot::before[\s\S]*linear-gradient\(90deg, var\(--accent\)/);
  assert.doesNotMatch(css.match(/\.detail-note-text \{[^}]*\}/)[0], /border-left/);
});
