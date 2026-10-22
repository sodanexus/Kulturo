import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const css = read("../styles/navigation.css");
const app = read("../app.js");

test("la navigation est chargée en dernier et mise en cache hors ligne", () => {
  const html = read("../index.html");
  assert.ok(html.indexOf("styles/navigation.css") > html.indexOf("styles/interactions.css"));
  assert.match(read("../sw.js"), /styles\/navigation\.css/);
});

test("desktop : onglets dans la barre du haut, plus de rail latéral", () => {
  assert.doesNotMatch(app, /<nav id="sidebar"/);
  for (const key of ["library", "upcoming", "journal", "dashboard"]) {
    assert.match(app, new RegExp(`class="top-tab[^"]*" data-nav="${key}"`));
  }
  assert.match(app, /class="topbar-add-btn"/);
  assert.match(css, /#main \{ padding-left: max\(2rem/);
  assert.match(css, /\.topnav-indicator/);
});

test("la recherche et le bouton de filtres restent dans la barre du haut", () => {
  const header = app.slice(app.indexOf('<header id="topbar">'), app.indexOf("</header>"));
  assert.match(header, /id="global-search"/);
  assert.match(header, /id="btn-filter-toggle"/);
  assert.ok(header.indexOf('id="topnav"') < header.indexOf('id="global-search"'));
});

test("mobile : barre du bas conservée, indicateur positionné sur l'onglet actif", () => {
  assert.match(app, /id="bottom-nav-indicator"/);
  assert.match(app, /function positionNavIndicators/);
  assert.match(app, /positionNavIndicators\(\);/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*#topnav, \.topbar-add-btn \{ display: none; \}/);
});

test("animations sobres : un seul mouvement, sans ressort, coupé si mouvements réduits", () => {
  assert.doesNotMatch(css, /1\.56|spring|rotate|scale\(1\.1/);
  assert.match(css, /--nav-dur: \.22s/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
