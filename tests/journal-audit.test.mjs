import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalNavigation } from '../features/journal-navigation.js';
import { createJournalFeature } from '../features/journal.js';
import { normalizeSearchText } from '../domain.js';

function harness() {
  const nodes = new Map();
  const handlers = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, dataset: {}, children: [], innerHTML: '', classList: { toggle() {} },
      setAttribute() {}, replaceChildren(...children) { this.children = children; },
      focus() { document.activeElement = this; },
    });
    return nodes.get(id);
  };
  globalThis.document = { getElementById: node, querySelector: () => null };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const root = node('page-journal');
  root.addEventListener = (type, handler) => { handlers[type] = handler; };
  root.contains = () => true;
  return { node, root, handlers };
}

test('Journal : un mois sans heure utilise la même clé que les groupes, quel que soit le fuseau', () => {
  const { node } = harness();
  const nav = createJournalNavigation();
  nav.syncTimeline([{ occurred_at: '2026-03-01' }]);
  assert.deepEqual(node('journal-month-select').children.map(option => option.value), ['all', '2026-03']);
});

test('Journal : un chargement conserve le mois demandé ; un résultat vide le réinitialise', () => {
  const { node } = harness();
  const nav = createJournalNavigation();
  nav.restoreContext({ periods: { personal: '2026-03' } });
  nav.syncTimeline([], 'personal', { pending: true });
  assert.equal(nav.context().periods.personal, '2026-03');
  nav.syncTimeline([{ occurred_at: '2026-03-01' }]);
  assert.equal(node('journal-month-select').value, '2026-03');
  nav.syncTimeline([]);
  assert.equal(nav.context().periods.personal, 'all');
  assert.equal(node('journal-month-select').value, 'all');
  assert.equal(node('journal-time-prev').disabled, true);
  assert.equal(node('journal-time-next').disabled, true);
});

test('Journal : flèches, Home et End changent le panneau et déplacent le focus', () => {
  const { node, root, handlers } = harness();
  const nav = createJournalNavigation();
  let changes = 0;
  nav.bind(root, { onModeChange: () => { changes++; } });
  const key = (mode, value) => {
    const button = node(`journal-mode-${mode}`);
    button.dataset.journalMode = mode;
    button.closest = () => button;
    handlers.keydown({ target: button, key: value, preventDefault() {} });
  };
  key('personal', 'ArrowRight');
  assert.equal(nav.mode, 'community');
  assert.equal(document.activeElement.id, 'journal-mode-community');
  assert.equal(node('journal-personal-panel').hidden, true);
  key('community', 'Home');
  assert.equal(nav.mode, 'personal');
  key('personal', 'End');
  assert.equal(nav.mode, 'community');
  key('community', 'ArrowLeft');
  assert.equal(nav.mode, 'personal');
  assert.equal(changes, 4);
});

function featureFixture() {
  const dom = harness();
  const State = { user: { id: 'me' }, entries: [
    { id: 'one', title: 'Été retrouvé', media_type: 'book', status: 'finished' },
    { id: 'two', title: 'Autre titre', media_type: 'movie', status: 'finished' },
  ], events: [
    { id: 'event1', media_id: 'one', occurred_at: '2026-03-01', event_type: 'finished', metadata: {} },
    { id: 'event2', media_id: 'two', occurred_at: '2026-02-01', event_type: 'finished', metadata: {} },
  ], journalAvailable: true, journalDirty: false };
  const noop = () => '';
  const feature = createJournalFeature({ State, Journal: {},
    Activity: { getFeed: async () => [{ id: 'community1', title: 'Été ailleurs', username: 'Zoé', user_id: 'other', created_at: '2026-03-01', media_type: 'book', status: 'finished' }] },
    esc: value => String(value ?? '').replaceAll('<', '&lt;'), safeMediaUrl: noop, uiAction: noop,
    iconMedia: noop, iconStatus: noop, iconTrash: noop, iconJournalAction: noop,
    journalActionTone: noop, ratingScoreHTML: noop, activityStateMarkersHTML: noop, getTypeLabel: noop,
    replayMotion: noop, hydrateFadeImages: noop, getCurrentPage: () => 'journal',
  });
  return { ...dom, State, feature };
}

test('Journal : recherche sans accent, aucun résultat et restauration des mois', async () => {
  const { feature, node } = featureFixture();
  await feature.render();
  feature.setSearch('ete');
  assert.match(node('journal-feed').innerHTML, /Été retrouvé/);
  assert.doesNotMatch(node('journal-feed').innerHTML, /Autre titre|Récapitulatif/);
  assert.deepEqual(node('journal-month-select').children.map(x => x.value), ['all', '2026-03']);
  feature.setSearch('aucun résultat');
  assert.match(node('journal-feed').innerHTML, /Aucune entrée trouvée/);
  feature.setSearch('');
  assert.match(node('journal-feed').innerHTML, /Autre titre/);
  assert.equal(node('journal-month-select').children.length, 3);
});

test('Communauté : recherche par membre conservée après chargement et réinitialisée à la déconnexion', async () => {
  const { feature, node } = featureFixture();
  feature.restoreContext({ mode: 'community' });
  feature.setSearch('zoe');
  await feature.render();
  assert.match(node('community-feed').innerHTML, /Été ailleurs/);
  feature.setSearch('introuvable');
  assert.match(node('community-feed').innerHTML, /Aucune activité trouvée/);
  feature.reset();
  assert.equal(feature.context().mode, 'personal');
  await feature.render();
  assert.match(node('journal-feed').innerHTML, /Été retrouvé/);
});


test('les recherches partagent le traitement des accents et des ligatures', () => {
  assert.equal(normalizeSearchText('Œuvre été'), normalizeSearchText('oeuvre ete'));
  assert.equal(normalizeSearchText('Æon'), normalizeSearchText('aeon'));
});

test('Journal : une date sans heure conserve son jour local dans le libellé', async () => {
  const { feature, node } = featureFixture();
  feature.setSearch('ete');
  await feature.render();
  assert.match(node('journal-feed').innerHTML, /dimanche 1 mars 2026/);
});
