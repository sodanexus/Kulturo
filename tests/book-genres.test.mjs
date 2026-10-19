import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBookGenres } from '../features/book-search.js';
import { entriesForMetadata } from '../features/media-metadata.js';

test('Open Library : titres et sujets inconnus exclus, synonymes dédoublonnés', () => {
  assert.deepEqual(cleanBookGenres('The Lord of the Rings, Fiction, Ficción'), ['Fiction']);
  assert.deepEqual(cleanBookGenres(['Tolkien', 'Middle Earth', 'Fantasy fiction', 'Fantasy', 'Fiction']), ['Fantasy', 'Fiction']);
  assert.deepEqual(cleanBookGenres(['Unknown', '', null]), []);
});
test('Open Library : genres français stables, formats historiques acceptés', () => {
  assert.deepEqual(cleanBookGenres('["Science fiction","Science-fiction","Horror fiction"]'), ['Science-fiction', 'Horreur']);
  assert.deepEqual(cleanBookGenres(['Comic books, strips, etc.','Manga']), ['Bande dessinée', 'Manga']);
  const genres = cleanBookGenres(['Poetry', 'Fantasy', 'Biography', 'History']);
  assert.equal(genres.length, 3);
  assert.deepEqual(cleanBookGenres(genres), genres);
});
test('Un genre normalisé retrouve les anciens livres sans changer les autres médias', () => {
  const book = {id:'book', media_type:'book', source_api:'openlibrary', genre:'Ficción, Fantasy fiction'};
  const manual = {id:'manual', media_type:'book', genre:'Mon genre personnel'};
  const movie = {id:'movie', media_type:'movie', genre:'Fantasy fiction'};
  assert.deepEqual(entriesForMetadata([book,manual,movie], 'genre', 'Fantasy'), [book]);
  assert.deepEqual(entriesForMetadata([book,manual,movie], 'genre', 'Mon genre personnel'), [manual]);
  assert.deepEqual(entriesForMetadata([book,manual,movie], 'genre', 'Fantasy fiction'), [movie]);
});

test('Métadonnées : doublons de casse et espaces nettoyés sans réécrire les fiches', async () => {
  const {splitMetadataValues} = await import('../features/media-metadata.js');
  assert.deepEqual(splitMetadataValues(['Action, action', ' Science   fiction ', 'science fiction', '']), ['Action','Science fiction']);
  assert.deepEqual(splitMetadataValues('["Aventure", "aventure", "Drame"]'), ['Aventure','Drame']);
});
