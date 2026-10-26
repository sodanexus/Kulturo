import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/mobile-polish.css', import.meta.url), 'utf8');
test('sélecteur de fiche créateur avec indicateur doré coulissant', () => {
  assert.match(js, /\.classList\.toggle\("is-all", tab === "all"\)/);
  assert.match(css, /\.creator-tabs::after\s*\{/);
  assert.match(css, /\.creator-tabs\.is-all::after/);
});
test('entrée échelonnée, liste bornée et prise en compte de la réduction des mouvements', () => {
  assert.match(js, /prefersReducedMotion\(\)/);
  assert.match(js, /\.creator-visual, \.creator-role, \.creator-place, \.creator-bio/);
  assert.match(js, /index >= 12/);
  assert.match(js, /\.creator-work-card, \.metadata-media-row/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
