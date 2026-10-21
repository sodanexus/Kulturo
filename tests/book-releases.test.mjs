import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('le module Hardcover du site et du proxy est identique',()=>{
 assert.equal(readFileSync(new URL('../features/hardcover.js',import.meta.url),'utf8'),readFileSync(new URL('../supabase/functions/hardcover-proxy/hardcover.js',import.meta.url),'utf8'));
});
test('BnF sans clé Google : parutions, dédoublonnage et cache',async()=>{
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;let handler,count=0;
 globalThis.Deno={serve:fn=>{handler=fn;}};
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10).split('-').reverse().join('/');
 globalThis.fetch=async url=>{assert.ok(String(url).startsWith('https://nouveautes-editeurs.bnf.fr/'));count++;return new Response(`<rss><item><title>Livre</title><link>https://nouveautes-editeurs.bnf.fr/?id_declaration=42</link><description><![CDATA[Auteur : Auteur<br/>Date de parution : ${date}<br/>Éditeur : Maison]]></description></item></rss>`)};
 try{
  await import('../supabase/functions/book-releases-proxy/index.ts');
  const request=action=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify({action})});
  const data=await(await handler(request('upcoming'))).json();
  assert.equal(data.source,'bnf');assert.equal(data.items.length,1);assert.equal(data.items[0].publisher,'Maison');
  await handler(request('upcoming'));assert.equal(count,2);
  assert.equal((await handler(request('details'))).status,400);
 }finally{globalThis.fetch=oldFetch;if(oldDeno===undefined)delete globalThis.Deno;else globalThis.Deno=oldDeno;}
});
