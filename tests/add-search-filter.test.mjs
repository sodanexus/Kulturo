import test from 'node:test';
import assert from 'node:assert/strict';
import {addSearchTypes, createAddDraft, selectAddResult} from '../features/add-flow.js';
test('le filtre interroge uniquement le catalogue sélectionné, ISBN prioritaire', () => {
  assert.deepEqual(addSearchTypes('Dune', 'book'), ['book']);
  assert.deepEqual(addSearchTypes('Dune', 'movie'), ['movie']);
  assert.deepEqual(addSearchTypes('Dune', 'game'), ['game']);
  assert.deepEqual(addSearchTypes('Dune', 'all'), ['movie','game','book']);
  assert.deepEqual(addSearchTypes('9781234567897', 'game', true), ['book']);
});
test('la sélection conserve le filtre pour un retour à la recherche', () => {
  const draft = {...createAddDraft('Dune'),searchType:'book'};
  assert.equal(selectAddResult(draft,{title:'Dune',media_type:'book'}).searchType,'book');
});
