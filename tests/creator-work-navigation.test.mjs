import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/mobile-polish.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const click = detail.slice(detail.indexOf('async function openCreatorWorkFromElement('), detail.indexOf('\nfunction openMetadataFromElement('));

test('5.0.1 : l’œuvre choisie remplace réellement l’entrée créateur', () => {
  assert.match(click, /replaceCreatorHistory\(previewId\)/);
  assert.match(click, /closeMetadataPanel\(\{ restoreFocus: false, immediate: true \}\)/);
  assert.match(click, /openUnownedCatalogueDetail\(item, "creator", \{ history: "none" \}\)/);
  assert.match(click, /openDetailPanel\(target\.id, \{ history: "none" \}\)/);
  assert.match(app, /replaceCreatorHistory: mediaId => \{[\s\S]*?history\.replaceState\(/);
  assert.doesNotMatch(click, /history\.back\(\)|setTimeout\(/);
});
test('5.0.1 : une réponse tardive ne rouvre pas l’œuvre d’origine', () => {
  assert.match(click, /const selection = \+\+creatorWorkSelection/);
  assert.match(click, /const valid = \(\) => selection === creatorWorkSelection/);
  assert.match(click, /if \(!valid\(\)\) return/);
});
test('5.0.1 : montée mobile similaire aux fiches œuvres et mouvement réduit', () => {
  assert.match(css, /metadata-overlay \.metadata-sheet \{[\s\S]*?translateY\(40px\)/);
  assert.match(css, /metadata-overlay\.is-closing \.metadata-sheet \{ transform: translateY\(40px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
test('5.0.1 : cache renouvelé et nouvelle version', () => {
  assert.match(sw, /kulturo-static-v5\.0\.1/);
  assert.match(sw, /"features\/media-detail\.js"/);
});
