import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const workClick = detail.slice(detail.indexOf('async function openCreatorWorkFromElement('), detail.indexOf('\nfunction openMetadataFromElement('));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('créateurs : ouvrir directement la fiche catalogue sans retour historique différé', () => {
  assert.match(workClick, /closeMetadataPanel\(\{ restoreFocus: false, immediate: true \}\);\s*await openUnownedCatalogueDetail\(result, "creator"\)/);
  assert.match(workClick, /closeMetadataPanel\(\{ restoreFocus: false, immediate: true \}\);\s*await openUnownedCatalogueDetail\(item, "creator"\)/);
  assert.doesNotMatch(workClick, /setTimeout\(\(\) => openUnownedCatalogueDetail/);
});

test('le cache PWA est renouvelé pour distribuer le nouveau parcours créateur', () => {
  assert.match(sw, /kulturo-static-v5\.0\.0-creator-preview-2/);
  assert.match(sw, /"features\/media-detail\.js"/);
});
