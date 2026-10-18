import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeISBN, preferredBookTitle} from '../features/book-search.js';
import {collectDetailUpdates} from '../features/detail-enrichment.js';
test('ISBN recognises separators, prefix and X check digit, rejecting typos',()=>{
 assert.equal(normalizeISBN('ISBN : 978-2-505-11033-0'),'9782505110330');
 assert.equal(normalizeISBN('2 505 11033 6'),'2505110336');
 assert.equal(normalizeISBN('0-8044-2957-X'),'080442957X');
 assert.equal(normalizeISBN('9782505110331'),null);
 assert.equal(normalizeISBN('Nijigahara Holograph'),null);
});
test('book titles prefer French editions, Latin alternative then original',()=>{
 const work={title:'虹ヶ原ホログラフ',editions:{docs:[{title:'Nijigahara Holograph',language:['fre']}]}};
 assert.equal(preferredBookTitle(work),'Nijigahara Holograph');
 assert.equal(preferredBookTitle({title:work.title},{title:'Nijigahara Holograph'}),'Nijigahara Holograph');
 assert.equal(preferredBookTitle({title:work.title}),work.title);
});
test('manual synopsis survives catalogue enrichment for books and games',()=>{
 for(const source_api of ['openlibrary','igdb','tmdb']){
  assert.deepEqual(collectDetailUpdates({source_api,description:'Mon synopsis'}, {description:'Autre résumé',publisher:'Éditeur'}),{publisher:'Éditeur'});
  assert.deepEqual(collectDetailUpdates({source_api}, {description:'Résumé disponible'}),{description:'Résumé disponible'});
 }
});
