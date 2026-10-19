import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReadingProgress, readingProgress } from '../features/reading-progress.js';
import { statusTransitionChanges } from '../domain.js';
import { mergeDetailResponse } from '../features/detail-enrichment.js';
import { sanitizeBackupEntry } from '../features/backup-restore.js';

test('Lecture : valeurs vides, zéro, total inconnu et bornes', () => {
  assert.deepEqual(parseReadingProgress('', ''), {current_page:null, page_count:null});
  assert.deepEqual(parseReadingProgress('0', '320'), {current_page:0, page_count:320});
  assert.deepEqual(parseReadingProgress('186', ''), {current_page:186, page_count:null});
  for (const [current,total] of [['-1','100'],['1.5','100'],['101','100'],['1','0'],['Infinity',''],['2147483648','']]) {
    assert.throws(() => parseReadingProgress(current,total));
  }
  assert.deepEqual(readingProgress({current_page:186,page_count:320}), {current:186,total:320,percent:58});
  assert.equal(readingProgress({current_page:10}).percent,null);
});
test('Lecture : une relecture repart à zéro, une simple reprise conserve la page', () => {
  const entry = {media_type:'book',status:'finished',date_finished:'2026-10-10',current_page:320};
  assert.equal(statusTransitionChanges(entry,'playing').changes.current_page,0);
  assert.equal(statusTransitionChanges({...entry,status:'playing'},'playing').changes.current_page,undefined);
  assert.equal(statusTransitionChanges({...entry,media_type:'movie'},'playing').changes.current_page,undefined);
});
test('Lecture : une réponse ancienne de métadonnées ne rembobine pas la progression', () => {
  const entry={current_page:186,page_count:320,description:'Résumé',external_ratings:[]};
  mergeDetailResponse(entry,{current_page:10,page_count:200,publisher:'Éditeur'});
  assert.equal(entry.current_page,186);
  assert.equal(entry.page_count,320);
  assert.equal(entry.publisher,'Éditeur');
});
test('Lecture : sauvegarde/restauration conserve la progression, anciens fichiers acceptés', () => {
  const book={title:'Livre',media_type:'book',status:'playing',current_page:186,page_count:320};
  assert.equal(sanitizeBackupEntry(book).current_page,186);
  assert.equal(sanitizeBackupEntry({...book,current_page:-1}),null);
  const {current_page,...old}=book;
  assert.equal(sanitizeBackupEntry(old).current_page,undefined);
});
