import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../styles/finesse.css", import.meta.url), "utf8");
const profile = fs.readFileSync(new URL("../features/profile.js", import.meta.url), "utf8");

test("Profil desktop : largeur bornée, temps et notes côte à côte, couvertures plafonnées", () => {
  assert.match(css, /@media \(min-width: 1100px\)[\s\S]*#dashboard-content[\s\S]*max-width: 1180px/);
  assert.match(css, /profile-time-card:has\(\+ \.profile-ratings-card\)/);
  assert.match(css, /\.profile-top-track \{ grid-template-columns: repeat\(6, minmax\(0, 150px\)\)/);
  assert.ok(profile.indexOf("${ratingsHTML}") < profile.indexOf('data-ui-key="profile-top"') + 400 &&
    profile.indexOf("${ratingsHTML}") > profile.indexOf('data-ui-key="profile-time"'),
    "les notes suivent directement le bloc temps");
});

test("Profil mobile : le mois se replie en largeur sans retour à la ligne", () => {
  const block = css.slice(css.indexOf("Profil mobile"));
  assert.match(block, /\.profile-date-controls \{ flex-wrap: nowrap/);
  assert.match(block, /is-collapsed \{[^}]*flex: 0 0 0/);
});
