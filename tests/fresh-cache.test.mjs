import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJSON, clearApiCache } from '../features/request-client.js';
test('fresh detail requests replace the cached response for subsequent screenshots',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>new Response(JSON.stringify({revision:++calls}),{status:200,headers:{'content-type':'application/json'}});
 try{
  clearApiCache();
  const opts={cachePolicy:'detail',retries:0};
  assert.equal((await requestJSON('https://example.test/igdb',opts)).revision,1);
  assert.equal((await requestJSON('https://example.test/igdb',opts)).revision,1);
  assert.equal((await requestJSON('https://example.test/igdb',{...opts,fresh:true})).revision,2);
  assert.equal((await requestJSON('https://example.test/igdb',opts)).revision,2);
  assert.equal(calls,2);
 }finally{globalThis.fetch=original;clearApiCache()}
});
