import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const creatorClick = detail.slice(detail.indexOf('async function openCreatorWorkFromElement('), detail.indexOf('\nfunction openMetadataFromElement('));
const preview = detail.slice(detail.indexOf('async function openUnownedCatalogueDetail('), detail.indexOf('\nfunction addSagaPreview('));

test('les œuvres des créateurs ouvrent une fiche temporaire, pas le formulaire directement', () => {
  assert.match(creatorClick, /openUnownedCatalogueDetail\(item, "creator", \{ history: "none" \}\)/);
  assert.match(creatorClick, /openUnownedCatalogueDetail\(item, "creator", \{ history: "none" \}\)/);
  assert.doesNotMatch(creatorClick, /openCollectionAdd\(/);
});

test('la fiche catalogue ne sauvegarde rien et propose Ajouter via le même parcours que les sagas', () => {
  assert.match(preview, /_sagaPreviews\.set\(entry\.id, item\)/);
  assert.match(preview, /renderDetailPanel\(entry, \{ sagaPreview: true/);
  assert.match(detail, /uiAction\("addSagaPreview", \[e\.id\]\)/);
  assert.match(detail, /function addSagaPreview\(previewId\)[\s\S]*?openCollectionAdd\(item\)/);
  assert.match(preview, /entry\.id = previewId/);
  assert.match(preview, /entry\.status = null/);
});

test('une œuvre déjà ajoutée continue à ouvrir sa fiche personnelle', () => {
  assert.match(creatorClick, /if \(owned\) \{/);
  assert.match(creatorClick, /await openDetailPanel\(owned\.id, \{ history: "none" \}\)/);
  assert.match(preview, /if \(owned\) \{ await openDetailPanel\(owned\.id\); return; \}/);
});
