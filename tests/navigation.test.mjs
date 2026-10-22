import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
const css = read("../styles/navigation.css");
const app = read("../app.js");

test("la navigation modernisée est chargée en dernier et mise en cache hors ligne", () => {
  const html = read("../index.html");
  assert.ok(html.indexOf("styles/navigation.css") > html.indexOf("styles/interactions.css"));
  assert.match(read("../sw.js"), /styles\/navigation\.css/);
});

test("desktop : le rail se déploie au survol et au clavier, sans décaler le contenu", () => {
  assert.match(css, /@media \(hover: hover\) \{\s*#sidebar:hover \{ width: var\(--rail-open\)/);
  assert.match(css, /#sidebar:has\(:focus-visible\)/);
  assert.doesNotMatch(css, /#main\s*\{[^}]*margin-left/, "le rail est superposé au contenu");
  assert.match(app, /class="add-label">Ajouter/);
});

test("mobile : barre flottante avec indicateur positionné sur l'onglet actif", () => {
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*grid-template-columns: 1fr 1fr 74px 1fr 1fr/);
  assert.match(app, /id="bottom-nav-indicator"/);
  assert.match(app, /function positionBottomNavIndicator/);
  assert.match(app, /positionBottomNavIndicator\(\);/);
});

test("les mouvements sont coupés si l'appareil demande moins d'animations", () => {
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*transition-duration: \.01s/);
});
