import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const section = detail.slice(detail.indexOf('async function openDetailPanel('), detail.indexOf('\nasync function ', detail.indexOf('async function openDetailPanel(') + 10));
test('une fiche déjà ajoutée conserve history none lors de la navigation créateur', () => {
  assert.match(section, /renderDetailPanel\(e,\s*\{[^}]*history:\s*options\.history/);
});
