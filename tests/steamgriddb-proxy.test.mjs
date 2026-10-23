import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { steamGridLogoCandidates } from '../features/title-logo.js';

function run(body, responses, key = 'k') {
  const script = `
    const responses = ${JSON.stringify(responses)};
    const calls = [];
    globalThis.Deno = { env:{get:n => n === 'STEAMGRIDDB_API_KEY' ? ${JSON.stringify(key)} : ''}, serve:h => { globalThis.__h = h; } };
    globalThis.fetch = async (url, init) => { calls.push({url:String(url), auth:init?.headers?.Authorization}); const r = responses.shift(); return new Response(JSON.stringify(r.body), {status:r.status||200}); };
    await import('./supabase/functions/steamgriddb-proxy/index.ts');
    const res = await globalThis.__h(new Request('https://x', {method:'POST', body:JSON.stringify(${JSON.stringify(body)})}));
    console.log(JSON.stringify({status:res.status, body:await res.json(), calls}));`;
  return JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types','--no-warnings','--input-type=module','-e',script], {cwd:new URL('..', import.meta.url).pathname, encoding:'utf8'}).trim().split('\n').pop());
}

const search = {success:true, data:[{id:7, name:'Hades II'}, {id:8, name:'Hades'}]};
const logos = {success:true, data:[
  {url:'https://cdn2.steamgriddb.com/logo/b.png', style:'black', mime:'image/png', score:9},
  {url:'https://cdn2.steamgriddb.com/logo/o.png', style:'official', mime:'image/png', score:1},
  {url:'https://evil.example/x.png', style:'official', mime:'image/png'},
  {url:'https://cdn2.steamgriddb.com/logo/n.png', style:'white', mime:'image/png', nsfw:true},
]};

test('proxy : titre exact, logos triés, clé en Bearer', () => {
  const out = run({action:'logos', title:'Hades'}, [{body:search},{body:logos}]);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.logos.map(l => l.style), ['official','black']);
  assert.match(out.calls[1].url, /\/logos\/game\/8\?/);
  assert.equal(out.calls[0].auth, 'Bearer k');
});

test('proxy : pas de correspondance fiable → aucun logo', () => {
  const out = run({action:'logos', title:'Inconnu'}, [{body:search}]);
  assert.deepEqual(out.body, {logos:[]});
  assert.equal(out.calls.length, 1);
});

test('proxy : erreur API → 502, secret absent → 503, requête invalide → 400', () => {
  assert.equal(run({action:'logos', title:'Hades'}, [{status:500, body:{}}]).status, 502);
  assert.equal(run({action:'logos', title:'Hades'}, [], '').status, 503);
  assert.equal(run({action:'x', title:'Hades'}, []).status, 400);
});

test('client : candidats limités au domaine SteamGridDB', () => {
  const c = steamGridLogoCandidates([{url:'https://cdn2.steamgriddb.com/a.png', style:'black'}, {url:'https://evil.example/a.png'}, {url:'http://cdn2.steamgriddb.com/a.png'}, {url:'x'}]);
  assert.deepEqual(c, [{url:'https://cdn2.steamgriddb.com/a.png', monochrome:true}]);
});

test('client : IGDB et secours en parallèle, avec cache local', () => {
  const api = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  assert.match(api, /Promise\.allSettled\(\[[\s\S]*this\.fallback\(entry, options\)/);
  assert.match(api, /readLogoCache\(entry\)/);
  assert.match(api, /\[\.\.\.\(steamList \|\| \[\]\), \.\.\.igdbList\]/);
  assert.match(api, /steamgriddb-proxy/);
});
