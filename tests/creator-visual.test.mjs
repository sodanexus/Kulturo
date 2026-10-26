import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/mobile-polish.css', import.meta.url), 'utf8');
test('les créateurs sans image conservent un avatar local avec initiales', () => {
  assert.match(js, /function creatorInitials\(/);
  assert.match(js, /function creatorVisual\(/);
  assert.match(js, /creatorVisual\(value, photo/);
  assert.match(js, /creatorVisual\(value, person\.profile_url\)/);
  assert.match(css, /\.creator-visual-fallback/);
});
test('les logos sont contenus et les images apparaissent en fondu après chargement', () => {
  assert.match(css, /\.creator-visual--logo img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.creator-visual img\.is-loaded\s*\{\s*opacity:\s*1/s);
  assert.match(js, /image\.addEventListener\("error", onError/);
  assert.match(js, /image\.addEventListener\("load", onLoad/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("les logos noirs restent lisibles sur un fond neutre après chargement", () => {
  assert.match(js, /image\.parentElement\.classList\.add\("has-loaded-logo"\)/);
  assert.match(css, /\.creator-visual--logo\.has-loaded-logo\s*\{[^}]*background:\s*#e9e9e7/s);
  assert.match(css, /\.creator-visual--logo img\s*\{[^}]*object-fit:\s*contain/s);
});
