import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("la détection du français est partagée et exportée", () => {
  const api = read("../api.js");
  assert.match(api, /export \{ isLikelyFrench \}/);
  assert.match(read("../features/text-language.js"), /export function isLikelyFrench/);
  assert.match(api, /export async function translateText/);
  // La traduction et les biographies générées réutilisent le même proxy Groq.
  assert.equal((api.match(/functions\/v1\/groq-proxy/g) || []).length, 2);
});

test("un synopsis ISBN étranger n'est pas enregistré tel quel", () => {
  const api = read("../api.js");
  assert.match(api, /isLikelyFrench\(text\) \? text : null/);
});

test("le bouton Traduire propose sans enregistrer et permet de rétablir", () => {
  const app = read("../app.js");
  assert.match(app, /id="f-description-translate"/);
  assert.match(app, /Rétablir l’original/);
  // Le bouton ne touche qu'au champ : la sauvegarde reste le geste habituel.
  const fn = app.slice(app.indexOf("function setupSynopsisTranslation"), app.indexOf("function syncEditDetailsSummary"));
  assert.doesNotMatch(fn, /Media\.update|saveEntry/);
});

test("un synopsis déjà renseigné n'est jamais remplacé par l'enrichissement", () => {
  const src = read("../features/detail-enrichment.js");
  assert.match(src, /details\[field\] != null && !entry\[field\]/);
});

test("le bouton Traduire ne dépend pas de la détection de langue", () => {
  const app = read("../app.js");
  const fn = app.slice(app.indexOf("function setupSynopsisTranslation"), app.indexOf("function syncEditDetailsSummary"));
  assert.doesNotMatch(fn, /isLikelyFrench/);
  assert.match(fn, /force: true/);
  assert.match(read("../api.js"), /options\.force/);
});
