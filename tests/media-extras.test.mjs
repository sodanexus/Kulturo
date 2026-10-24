import test from 'node:test';
import assert from 'node:assert/strict';
import { tmdbTrailerUrl, igdbTrailerUrl, tmdbCollection, igdbCollection, safeTrailerUrl, collectionLabel } from '../features/media-extras.js';

test('Bande-annonce TMDb : française d’abord, puis anglaise, officielle en premier', () => {
  const url = tmdbTrailerUrl([
    { site: 'YouTube', key: 'enOfficial1', type: 'Trailer', iso_639_1: 'en', official: true },
    { site: 'YouTube', key: 'frTrailer1', type: 'Trailer', iso_639_1: 'fr', official: false },
    { site: 'Vimeo', key: 'vimeo12345', type: 'Trailer', iso_639_1: 'fr' },
  ]);
  assert.equal(url, 'https://www.youtube.com/watch?v=frTrailer1');
  assert.equal(tmdbTrailerUrl([{ site: 'YouTube', key: 'clip123456', type: 'Clip', iso_639_1: 'fr' }]), null);
  assert.equal(tmdbTrailerUrl([{ site: 'YouTube', key: 'bad key!', type: 'Trailer' }]), null);
  assert.equal(tmdbTrailerUrl(null), null);
});

test('Bande-annonce IGDB : préfère une vidéo « trailer », rejette les identifiants invalides', () => {
  assert.equal(igdbTrailerUrl([{ name: 'Gameplay', video_id: 'aaaaaaaaaaa' }, { name: 'Launch Trailer', video_id: 'bbbbbbbbbbb' }]), 'https://www.youtube.com/watch?v=bbbbbbbbbbb');
  assert.equal(igdbTrailerUrl([{ name: 'x', video_id: '"><script>' }]), null);
});

test('Lien de bande-annonce : seules les URL YouTube watch sont acceptées', () => {
  assert.equal(safeTrailerUrl('https://www.youtube.com/watch?v=abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(safeTrailerUrl('javascript:alert(1)'), null);
  assert.equal(safeTrailerUrl('https://evil.example/watch?v=abcdefghijk'), null);
});

test('Saga TMDb : ordre de sortie, au moins deux films', () => {
  const col = tmdbCollection({ name: 'Collection Matrix', parts: [
    { id: 2, title: 'Reloaded', release_date: '2003-05-15', poster_path: '/b.jpg' },
    { id: 1, title: 'Matrix', release_date: '1999-03-30', poster_path: '/a.jpg' },
  ] }, 'https://img');
  assert.deepEqual(col.items.map(item => item.external_id), ['1', '2']);
  assert.equal(col.items[0].cover_url, 'https://img/a.jpg');
  assert.equal(tmdbCollection({ name: 'Seul', parts: [{ id: 1, title: 'A' }] }), null);
});

test('Saga IGDB : exclut les éditions et exige le jeu courant', () => {
  const col = { name: 'Zelda', games: [
    { id: 2, name: 'B', first_release_date: 200000000 },
    { id: 1, name: 'A', first_release_date: 100000000, cover: { image_id: 'co1abc' } },
    { id: 3, name: 'A Remaster', version_parent: 1, first_release_date: 300000000 },
  ] };
  const result = igdbCollection(col, 1);
  assert.deepEqual(result.items.map(item => item.external_id), ['1', '2']);
  assert.match(result.items[0].cover_url, /co1abc\.webp$/);
  assert.equal(igdbCollection(col, 99), null);
});

test('Nom de saga raccourci', () => {
  assert.equal(collectionLabel('Collection Harry Potter'), 'Harry Potter');
  assert.equal(collectionLabel('Matrix Collection'), 'Matrix');
  assert.equal(collectionLabel('Saga Star Wars'), 'Star Wars');
  assert.equal(collectionLabel('Collection'), 'Collection');
});
