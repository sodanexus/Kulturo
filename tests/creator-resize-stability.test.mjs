import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');

test('créateurs : mesure la hauteur visible avant d’annuler une animation interrompue', () => {
  const start = source.indexOf('function transitionCreatorSurface(');
  const end = source.indexOf('function switchCreatorTab(', start);
  const transition = source.slice(start, end);
  assert.match(transition, /const from = sheet\.getBoundingClientRect\(\)\.height;[\s\S]*oldState\.animation\?\.cancel\(\)/);
  assert.match(transition, /creatorResizeStates\.get\(sheet\) !== state/);
});

test('créateurs : hauteur finale synchronisée avant de libérer la contrainte', () => {
  const start = source.indexOf('function transitionCreatorSurface(');
  const end = source.indexOf('function switchCreatorTab(', start);
  const transition = source.slice(start, end);
  assert.match(transition, /fill: "forwards"/);
  assert.match(transition, /const natural = sheet\.getBoundingClientRect\(\)\.height/);
  assert.match(transition, /Math\.abs\(natural - to\) >= 2/);
});
