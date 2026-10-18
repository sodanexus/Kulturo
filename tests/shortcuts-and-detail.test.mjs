import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildAppRoute, parseAppRoute } from "../features/app-route.js";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("les raccourcis du manifeste mènent à des routes que l'application comprend", () => {
  const manifest = JSON.parse(read("../manifest.json"));
  const version = read("../VERSION").trim();
  const byName = Object.fromEntries(manifest.shortcuts.map(item => [item.short_name, item]));
  assert.deepEqual(Object.keys(byName).sort(), ["Ajouter", "Journal", "Sorties"]);
  for (const shortcut of manifest.shortcuts) {
    assert.ok(shortcut.name && shortcut.url.startsWith("./#/"), `${shortcut.name} reste dans le périmètre de la PWA`);
    const route = parseAppRoute(shortcut.url.slice(2));
    assert.ok(route, `${shortcut.name} produit une route valide`);
    assert.ok(shortcut.icons.length && shortcut.icons.every(icon => icon.type === "image/png" && icon.src.endsWith(`?v=${version}`)));
  }
  assert.equal(parseAppRoute(byName.Journal.url.slice(2)).page, "journal");
  assert.equal(parseAppRoute(byName.Sorties.url.slice(2)).page, "upcoming");
  const add = parseAppRoute(byName.Ajouter.url.slice(2));
  assert.equal(add.page, "library");
  assert.equal(add.add, true);
});

test("l'ajout par raccourci est ponctuel : l'URL reconstruite ne le contient jamais", () => {
  assert.equal(parseAppRoute("#/library").add, false);
  assert.equal(parseAppRoute("#/library?add=0").add, false);
  assert.equal(buildAppRoute({ page: "library" }), "#/library");
  const source = read("../app.js");
  assert.match(source, /function openAddFromRoute\(route\)[\s\S]+history\.replaceState\(appHistoryState\(_currentPage\), "", historyUrl\(_currentPage\)\)[\s\S]+UI\.openAddModal\(\)/);
  assert.match(source, /if \(!restorePendingRouteDetail\(\)\) openAddFromRoute\(route\)/);
});

test("la barre compacte de la fiche garde l'or de la note et montre cœur et revisionnage", () => {
  const css = read("../styles/finesse.css");
  const rating = css.match(/\.detail-compact-rating \{[^}]+\}/)[0];
  assert.match(rating, /color: var\(--brand-gold\)/);
  assert.doesNotMatch(rating, /var\(--accent\)/);
  assert.match(css, /\.detail-compact-fav \{[^}]*var\(--brand-coral\)/);
  assert.match(css, /\.detail-compact-repeat \{[^}]*var\(--brand-teal\)/);
  const source = read("../features/media-detail.js");
  assert.match(source, /function compactBadgesHTML\(entry\)[\s\S]+entry\.is_favorite[\s\S]+isReplayEntry\(entry\)/);
  assert.match(source, /id="detail-compact-badges-\$\{e\.id\}">\$\{compactBadgesHTML\(e\)\}/);
});

test("le cœur de la fiche pop à l'ouverture comme l'étoile, sauf en mouvement réduit", () => {
  const source = read("../features/media-detail.js");
  assert.match(source, /if \(!options\.restoreView\) popFavoriteHeart\(root\.querySelector\(`#detail-fav-/);
  assert.match(source, /function popFavoriteHeart\(el, delay = 0\)\s*\{\s*if \(!el \|\| !el\.classList\.contains\("is-active"\) \|\| prefersReducedMotion\(\)\) return;/);
  const css = read("../styles/finesse.css");
  assert.match(css, /@keyframes favHeartPop/);
  assert.match(css, /\.detail-fav\.is-fav-pop \{[^}]*favHeartPop[^}]*both/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .detail-fav.is-fav-pop"));
  assert.match(reduced, /\.detail-fav\.is-fav-pop \{ animation: none; \}/);
});
