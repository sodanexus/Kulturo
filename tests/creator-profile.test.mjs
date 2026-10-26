import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metadataExternalLink } from '../features/media-metadata.js';

const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
test('La fiche créateur n’ouvre plus de recherche IMDb', () => {
  assert.equal(metadataExternalLink('cast', 'Un nom'), null);
  assert.deepEqual(metadataExternalLink('director', 'Un nom', 'https://www.themoviedb.org/person/123'), { url: 'https://www.themoviedb.org/person/123', label: 'Voir sur TMDB' });
});
test('Fiche créateur : deux onglets, ouverture d’œuvre et garde de fermeture', () => {
  assert.match(detail, /data-creator-tab="library"/);
  assert.match(detail, /data-creator-tab="all"/);
  assert.match(detail, /overlay\.isConnected/);
  assert.match(detail, /openCollectionAdd\(item\)/);
  assert.match(app, /openCreatorWorkFromElement/);
});
test('Les fiches TMDB utilisent des identifiants natifs', () => {
  assert.match(api, /export const TMDbPeople/);
  assert.match(api, /combined_credits/);
  assert.doesNotMatch(api, /castExternalIds/);
});

test('les éditeurs de livres ne sont jamais recherchés dans IGDB', () => {
  const detail = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  const hardcover = readFileSync(new URL('../supabase/functions/hardcover-proxy/index.ts', import.meta.url), 'utf8');
  const igdb = readFileSync(new URL('../supabase/functions/igdb-proxy/index.ts', import.meta.url), 'utf8');
  assert.match(detail, /kind === "publisher" && mediaType === "book"/);
  assert.match(detail, /HardcoverPublishers\.find\(value\)/);
  assert.match(detail, /kind === "publisher" && mediaType === "game"/);
  assert.match(detail, /data-meta-media/);
  assert.match(api, /action: "publisher", query/);
  assert.match(hardcover, /query_type:"Publisher"/);
  assert.match(hardcover, /limit:75/);
  assert.match(igdb, /where slug = /);
  assert.match(detail, /function transitionCreatorSurface/);
});
