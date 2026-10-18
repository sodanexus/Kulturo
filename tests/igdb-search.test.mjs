import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('IGDB search recovers missing exact titles, deduplicates and preserves useful results on fallback failure', () => {
 execFileSync(process.execPath, ['--experimental-strip-types','--input-type=module','-e', `
 import assert from 'node:assert/strict';
 let handler, mode='missing', calls=[];
 globalThis.Deno={serve:fn=>handler=fn,env:{get:()=> 'fixture'}};
 globalThis.fetch=async (url,options)=>{
  if(String(url).includes('oauth2'))return Response.json({access_token:'fixture'});
  calls.push(options.body);
  if(options.body.startsWith('search'))return Response.json(mode==='exact'?[{id:7,name:'Returnal'}]:[{id:8,name:'Returnal: Ascension'}]);
  if(mode==='failure')return new Response('unavailable',{status:503});
  return Response.json([{id:7,name:'Returnal'},{id:8,name:'Returnal: Ascension'}]);
 };
 await import('./supabase/functions/igdb-proxy/index.ts');
 const search=()=>handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({query:'returnal'})}));
 let response=await search();let data=await response.json();
 assert.equal(response.status,200);assert.equal(data[0].name,'Returnal');assert.equal(data.length,2);
 assert.match(calls[0],/limit 24/);assert.match(calls[1],/where name ~ "returnal"/);
 mode='exact';calls=[];await search();assert.equal(calls.length,1);
 mode='failure';calls=[];response=await search();data=await response.json();assert.equal(response.status,200);assert.equal(data[0].id,8);
 `], {cwd:new URL('..',import.meta.url),stdio:'pipe'});
});
