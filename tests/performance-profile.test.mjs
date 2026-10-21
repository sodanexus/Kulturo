import test from 'node:test';
import assert from 'node:assert/strict';
import {profileRepeatLabel} from '../features/profile.js';
import {startMeasurement,performanceDiagnostics as diagnostics} from '../features/performance.js';
test('libellés de reprises adaptés à chaque filtre',()=>{
 assert.equal(profileRepeatLabel('all'),'Reprises');assert.equal(profileRepeatLabel('film'),'Revisionnages');assert.equal(profileRepeatLabel('tv'),'Revisionnages');assert.equal(profileRepeatLabel('game'),'Parties rejouées');assert.equal(profileRepeatLabel('book'),'Relectures');
});
test('mesures facultatives, bornées et terminées une seule fois',()=>{
 diagnostics.clear();diagnostics.enable(false);startMeasurement('disabled')();assert.equal(diagnostics.samples().length,0);
 diagnostics.enable();const end=startMeasurement('search:book');end();end();assert.equal(diagnostics.samples().length,1);
 for(let i=0;i<110;i++)startMeasurement('library:render')();assert.equal(diagnostics.samples().length,100);assert.ok(diagnostics.samples().every(s=>s.milliseconds>=0));diagnostics.enable(false);diagnostics.clear();
});

test('les vignettes réduisent les tailles connues sans changer les autres fournisseurs',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const code=app.slice(app.indexOf('function searchCoverUrl('),app.indexOf('function safeMediaUrl('));
 const fn=runInNewContext(code+';searchCoverUrl',{URL,safeMediaUrl:v=>v||''});
 assert.equal(fn('https://image.tmdb.org/t/p/w500/a.jpg'),'https://image.tmdb.org/t/p/w185/a.jpg');
 assert.equal(fn('https://images.igdb.com/igdb/image/upload/t_cover_big/a.jpg'),'https://images.igdb.com/igdb/image/upload/t_cover_small/a.jpg');
 assert.equal(fn('https://covers.openlibrary.org/b/id/123-M.jpg'),'https://covers.openlibrary.org/b/id/123-M.jpg');
});
