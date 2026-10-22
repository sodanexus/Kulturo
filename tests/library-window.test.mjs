import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryWindow } from '../features/library-window.js';
const entries = Array.from({ length: 232 }, (_, id) => ({ id, title: `Œuvre ${id}` }));
test('232 œuvres : 48 cartes au départ puis lots complets jusqu’à la dernière', () => {
  const view = createLibraryWindow();
  view.update(entries, 'all');
  assert.equal(view.visible().length, 48);
  for (const count of [96, 144, 192, 232]) { assert.equal(view.next(), true); assert.equal(view.visible().length, count); }
  assert.equal(view.next(), false);
  assert.equal(new Set(view.visible().map(e => e.id)).size, 232);
});
test('une recherche trouve une œuvre au-delà du lot affiché et réinitialise la vue', () => {
  const view = createLibraryWindow();
  view.update(entries, 'all'); view.next();
  view.update(entries.filter(e => e.id === 231), 'search');
  assert.equal(view.visible()[0].id, 231);
  view.update(entries, 'all');
  assert.equal(view.visible().length, 48);
});
test('une modification ou un retour à la fiche ne réduit pas le nombre affiché', () => {
  const view = createLibraryWindow();
  view.update(entries, 'all'); view.next(); view.next();
  view.update(entries.map(e => ({ ...e, title: 'modifié' })), 'all');
  assert.equal(view.visible().length, 144);
  view.update(entries, 'all', true);
  assert.equal(view.visible().length, 48);
});
test('restaurer la session restitue la profondeur avant de restaurer le scroll', () => {
  const view = createLibraryWindow(); view.update(entries, 'all'); view.next(); view.next();
  const restored = createLibraryWindow(); restored.restore(view.snapshot()); restored.update(entries, 'all');
  assert.equal(restored.visible().length, 144);
  restored.clear(); restored.update(entries, 'all'); assert.equal(restored.visible().length, 48);
});
test('une nouvelle carte triée loin peut être révélée sans doublon ni accès hors limites', () => {
  const view = createLibraryWindow(); view.update(entries, 'all');
  assert.equal(view.ensure('missing'), false);
  assert.equal(view.ensure(200), true);
  assert.equal(view.visible().length, 232);
  assert.equal(view.ensure(200), false);
});
