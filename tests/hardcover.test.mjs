import test from 'node:test';
import assert from 'node:assert/strict';
import { hardcoverIdentity, normalizeHardcoverBook, selectHardcoverEdition, searchBooksWithFallback } from '../features/hardcover.js';
import { sameMediaIdentity } from '../domain.js';
import { collectDetailUpdates } from '../features/detail-enrichment.js';

const editions = [
  { id: 2, title: 'English', isbn_13: '9781234567897', pages: 200, language: { language: 'English' }, publisher: { name: 'A' } },
  { id: 3, title: 'Français', isbn_13: '9781234567880', pages: 240, language: { language: 'French' }, publisher: { name: 'B' } },
];
test('Hardcover préfère le français mais respecte exactement un ISBN demandé', () => {
  assert.equal(selectHardcoverEdition(editions).id, 3);
  assert.equal(selectHardcoverEdition(editions, editions[0].isbn_13).id, 2);
  assert.equal(selectHardcoverEdition(editions, 'inconnu'), null);
  const result = normalizeHardcoverBook({ id: 1, title: 'Work', pages: 999 }, editions[1]);
  assert.deepEqual([result.external_id, result.page_count, result.publisher, result.isbn], ['1:3', 240, 'B', editions[1].isbn_13]);
  assert.equal(normalizeHardcoverBook({id: 1, pages: 999}).page_count, null);
});
test('le secours ne masque pas une annulation et ne tourne pas sur résultat valide', async () => {
  let count = 0;
  const fallback = async () => { count++; return ['OL']; };
  assert.deepEqual(await searchBooksWithFallback('x', {}, async () => ['HC'], fallback), ['HC']);
  assert.equal(count, 0);
  assert.deepEqual(await searchBooksWithFallback('x', {}, async () => [], fallback), ['OL']);
  assert.deepEqual(await searchBooksWithFallback('x', {}, async () => { throw Error('503'); }, fallback), ['OL']);
  await assert.rejects(searchBooksWithFallback('x', {}, async () => { throw new DOMException('cancel', 'AbortError'); }, fallback), {name:'AbortError'});
  assert.equal(count, 2);
  assert.deepEqual(await searchBooksWithFallback('x', { bookSource:'openlibrary' }, async () => { throw Error('must not run'); }, fallback), ['OL']);
});
test('identité persistée et dédoublonnage entre catalogues', () => {
  assert.deepEqual(hardcoverIdentity('42:12'), { bookId:42, editionId:12 });
  assert.equal(hardcoverIdentity('OL123W'), null);
  const book = {media_type:'book', source_api:'hardcover', external_id:'42:12', title:'Titre', isbn:'9781234567897'};
  assert.equal(sameMediaIdentity(book, {...book, external_id:'42:13'}), true);
  assert.equal(sameMediaIdentity(book, {...book, source_api:'openlibrary', external_id:'OL1W', title:'Other', release_year:1990}), true);
  assert.equal(sameMediaIdentity(book, {...book, external_id:'43:12'}), false);
});
test('enrichir ne remplace ni synopsis saisi ni pages personnelles', () => {
  assert.deepEqual(collectDetailUpdates({description:'Mon texte',page_count:300}, {description:'API',page_count:200,publisher:'B'}), {publisher:'B'});
});

test('une sauvegarde conserve la source et la progression Hardcover', async () => {
  const {sanitizeBackupEntry} = await import('../features/backup-restore.js');
  const result = sanitizeBackupEntry({title:'Livre',media_type:'book',status:'playing',source_api:'hardcover',external_id:'42:12',current_page:123,page_count:300});
  assert.equal(result.source_api, 'hardcover');
  assert.equal(result.external_id, '42:12');
  assert.equal(result.current_page, 123);
  assert.equal(result.page_count, 300);
});
