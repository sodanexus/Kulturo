import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
test('une saga non ajoutée ouvre une fiche temporaire avant le formulaire', () => {
  assert.match(detail, /uiAction\("openSagaCollectionDetail", \[e\.id, item\.external_id\]\)/);
  assert.match(detail, /renderDetailPanel\(entry, \{ sagaPreview: true/);
  assert.match(detail, /uiAction\("addSagaPreview", \[e\.id\]\)/);
  assert.match(detail, /function addSagaPreview\(previewId\)[\s\S]*?openCollectionAdd\(item\)/);
  assert.match(app, /openSagaCollectionDetail: \(hostId, externalId\)/);
  assert.match(app, /addSagaPreview: previewId/);
});
test('les entrées de saga déjà ajoutées gardent leur ouverture habituelle', () => {
  assert.match(detail, /uiAction\("openDetailFromCollection", \[owned\.id\]/);
  assert.match(detail, /_sagaPreviews\.set\(entry\.id, item\)/);
  assert.match(detail, /status: null/);
});
