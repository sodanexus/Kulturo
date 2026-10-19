import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecentSearches, recentSearches, rememberSearch, clearRecentSearches } from '../features/recent-searches.js';
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
test('Recherches récentes : dédoublonnage, limite et dernier choix en premier',()=>{
 const store=memory();
 for(const query of ['a','Dune','dune',' Livre  deux ','Trois','Quatre','Cinq','Six','Sept']) rememberSearch(store,'alice',query);
 assert.equal(recentSearches(store,'alice').length,6);
 rememberSearch(store,'alice','Livre deux');
 assert.equal(recentSearches(store,'alice')[0],'Livre deux');
 assert.deepEqual(normalizeRecentSearches([null,42,'','a','Dune',' dune ']),['Dune']);
});
test('Recherches récentes : isolées par compte, effaçables et stockage facultatif',()=>{
 const store=memory();rememberSearch(store,'alice','Dune');rememberSearch(store,'bob','Solaris');
 clearRecentSearches(store,'alice');
 assert.deepEqual(recentSearches(store,'alice'),[]);
 assert.deepEqual(recentSearches(store,'bob'),['Solaris']);
 const blocked={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};
 assert.doesNotThrow(()=>rememberSearch(blocked,'alice','Dune'));
 assert.deepEqual(recentSearches(blocked,'alice'),[]);
 assert.deepEqual(recentSearches(null,'alice'),[]);
});
