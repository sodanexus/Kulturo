import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const closeSource = app.slice(app.indexOf('function closeDesktopFilters('), app.indexOf('function openDesktopFilters('));

test('la fermeture libère les écouteurs même si le panneau a déjà été retiré', () => {
  let cleaned = 0;
  const ctx = vm.createContext({ document: { getElementById: () => null }, cleanupDesktopFilters: () => cleaned++ });
  vm.runInContext(closeSource, ctx);
  ctx.closeDesktopFilters(true);
  ctx.closeDesktopFilters(true);
  assert.equal(cleaned, 1);
  assert.equal(ctx.cleanupDesktopFilters, null);
});

test('la fin de fermeture retire uniquement son ancien panneau', () => {
  let removed = 0, focus = 0;
  const timers = [];
  const trigger = { setAttribute() {}, focus() { focus++; } };
  const panel = { contains: () => true, classList: { remove() {} }, remove() { removed++; } };
  const ctx = vm.createContext({ cleanupDesktopFilters: null, document: { getElementById: id => id === 'desktop-filter-panel' ? panel : trigger }, motionDuration: () => 300, setTimeout: fn => timers.push(fn) });
  vm.runInContext(closeSource, ctx);
  ctx.closeDesktopFilters();
  assert.equal(panel.inert, true);
  assert.equal(focus, 1);
  assert.equal(removed, 0);
  timers[0]();
  assert.equal(removed, 1);
});

function sharedHarness() {
  let resolveDetails;
  let active = true;
  const refreshes = [];
  const ctx = vm.createContext({
    canEnrichMediaDetails: () => true,
    renderDetailPanel: () => 'session',
    _scheduleSynopsisOverflowCheck() {},
    detailSessions: { signal: () => undefined, isActive: () => active },
    requestPrefetchedDetails: () => new Promise(resolve => { resolveDetails = resolve; }),
    collectDetailUpdates: () => ({ description: 'Résumé enrichi' }),
    _injectBackdrop() {},
    refreshDetailEnrichment: (entry, options) => refreshes.push({ entry, options }),
    // Toute écriture déclenchée par ce parcours fait échouer le test.
    Media: { update() { throw new Error('Écriture interdite'); }, create() { throw new Error('Écriture interdite'); } },
    console,
  });
  vm.runInContext(detail.slice(detail.indexOf('async function openSharedDetail('), detail.indexOf('function retryDetailInfo(')), ctx);
  return { ctx, refreshes, resolve: data => resolveDetails(data), close: () => { active = false; } };
}

test('une fiche communautaire reste en lecture seule après enrichissement sans modifier la source', async () => {
  const h = sharedHarness();
  const entry = { id: 'shared', media_type: 'movie', description: null };
  const pending = h.ctx.openSharedDetail(entry);
  h.resolve({ external_ratings: [{ value: 8 }] });
  await pending;
  assert.equal(h.refreshes.length, 1);
  assert.equal(h.refreshes[0].options.readOnly, true);
  assert.equal(h.refreshes[0].options.detailsLoading, false);
  assert.equal(entry.description, null);
  assert.equal(h.refreshes[0].entry.description, 'Résumé enrichi');
});

test('une réponse communautaire tardive ne rafraîchit pas une fiche fermée', async () => {
  const h = sharedHarness();
  const pending = h.ctx.openSharedDetail({ id: 'shared', media_type: 'movie' });
  h.close();
  h.resolve({});
  await pending;
  assert.equal(h.refreshes.length, 0);
});
