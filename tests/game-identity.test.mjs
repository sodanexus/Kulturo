import test from 'node:test';
import assert from 'node:assert/strict';
import {exactGameMatch,gameIdentityKey,gameSearchQueries} from '../features/game-identity.js';
test('Alan Wake 2 matches II without accepting a DLC or Deluxe edition',()=>{
 const base={external_id:'123',title:'Alan Wake II',release_year:2023};
 assert.equal(exactGameMatch({title:'Alan Wake 2',release_year:2023},[{...base,external_id:'124',title:'Alan Wake II: The Lake House'},base]),base);
 assert.equal(exactGameMatch({title:'Alan Wake 2'},[{...base,title:'Alan Wake II: Deluxe Edition'}]),null);
});
test('L.A. Noire punctuation is equivalent, different releases stay distinct',()=>{
 const base={external_id:'194',title:'L.A. Noire',release_year:2011};
 assert.equal(exactGameMatch({title:'LA Noire',release_year:2011},[base]),base);
 assert.equal(exactGameMatch({title:'L.A. Noire',release_year:2017},[base]),null);
 assert.equal(gameIdentityKey('L.A. Noire'),gameIdentityKey('L A Noire'));
});
test('ambiguous or invalid game identities are never auto-linked',()=>{
 const a={title:'Example',external_id:'1'},b={title:'Example',external_id:'2'};
 assert.equal(exactGameMatch({title:'Example'},[a,b]),null);
 assert.equal(exactGameMatch({title:'Example'},[{...a,external_id:'invalid'}]),null);
 assert.equal(exactGameMatch({title:'Example'},[a,a]),a);
});

test('numeric title searches have a bounded Roman-numeral fallback',()=>{
 assert.deepEqual(gameSearchQueries('Alan Wake 2'),['Alan Wake 2','Alan Wake II']);
 assert.deepEqual(gameSearchQueries('L.A. Noire'),['L.A. Noire']);
});
