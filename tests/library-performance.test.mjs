import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryCoverSources } from '../features/library-covers.js';
import { createLibraryWindow } from '../features/library-window.js';
import { createLibraryVisibility } from '../features/library-visibility.js';

test('10000 œuvres : chaque ajout ne fournit que les 48 nouvelles cartes', () => {
  const view = createLibraryWindow();
  view.update(Array.from({ length: 10000 }, (_, id) => ({ id })), 'all');
  let mounted = view.visible().length, created = mounted;
  while(view.next()) {
    const batch = view.visible(mounted);
    assert.ok(batch.length <= 48);
    assert.equal(batch[0].id, mounted);
    created += batch.length; mounted += batch.length;
  }
  assert.equal(created, 10000);
  view.update([{ id: 9999 }], 'search', true);
  assert.deepEqual(view.visible(), [{ id: 9999 }]);
});
test('TMDb : variantes locales à la grille, sans modifier la source des fiches', () => {
  const input = 'https://image.tmdb.org/t/p/original/cover.jpg';
  const result = libraryCoverSources(input);
  assert.equal(result.src, 'https://image.tmdb.org/t/p/w342/cover.jpg');
  assert.match(result.srcset, /w185\/cover.jpg 185w/);
  assert.match(result.srcset, /w500\/cover.jpg 500w/);
  assert.equal(input, 'https://image.tmdb.org/t/p/original/cover.jpg');
});
test('IGDB : garder la qualité maximale initiale et proposer une miniature', () => {
  const result = libraryCoverSources('https://images.igdb.com/igdb/image/upload/t_cover_big/co1.webp');
  assert.match(result.srcset, /t_cover_small_2x\/co1.webp 180w/);
  assert.match(result.srcset, /t_cover_big\/co1.webp 264w/);
  assert.doesNotMatch(result.srcset, /528w/);
});
test('les liens personnalisés, signés ou inconnus ne sont pas réécrits', () => {
  for (const src of ['https://example.org/a.jpg?signature=x', 'https://covers.openlibrary.org/b/id/10-L.jpg', 'https://image.tmdb.org.example.com/t/p/original/a.jpg', '']) {
    assert.deepEqual(libraryCoverSources(src), { src, srcset: '' });
  }
});
test('hors écran : hauteur mémorisée, retour visible et nettoyage des observateurs', () => {
  const originals = [globalThis.CSS, globalThis.IntersectionObserver, globalThis.ResizeObserver];
  let intersection, resize, disconnected = 0;
  globalThis.CSS = { supports: () => true };
  globalThis.IntersectionObserver = class { constructor(fn) { intersection = fn; } observe() {} disconnect() { disconnected++; } };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() { disconnected++; } };
  try {
    const classes = new Set(), styles = new Map();
    const card = { classList: { add: n => classes.add(n), remove: n => classes.delete(n) }, style: { setProperty: (k,v) => styles.set(k,v), removeProperty: k => styles.delete(k) }, matches: () => false };
    const manager = createLibraryVisibility({}, {});
    manager.observe([card]);
    intersection([{ target: card, isIntersecting: false, boundingClientRect: { height: 300 } }]);
    assert.equal(styles.get('--library-card-height'), '300px');
    assert.ok(classes.has('library-card-offscreen'));
    resize([{ contentRect: { width: 800 } }]);
    assert.equal(classes.size, 0);
    intersection([{ target: card, isIntersecting: true, boundingClientRect: { height: 250 } }]);
    assert.equal(styles.size, 0);
    manager.dispose();
    assert.equal(disconnected, 3);
  } finally { [globalThis.CSS, globalThis.IntersectionObserver, globalThis.ResizeObserver] = originals; }
});
