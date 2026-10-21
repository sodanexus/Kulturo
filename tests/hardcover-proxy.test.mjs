import test from 'node:test';
import assert from 'node:assert/strict';

test('proxy Hardcover : authentification, ISBN, variables GraphQL et cache', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  let handler;
  let calls = [];
  globalThis.Deno = {
    env: { get: key => ({SUPABASE_URL:'https://auth.test',SUPABASE_ANON_KEY:'anon',HARDCOVER_TOKEN:'private-test-token'})[key] },
    serve: fn => { handler = fn; },
  };
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return new Response('{}', {status: options.headers.Authorization === 'Bearer session' ? 200 : 401});
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.query.includes('search(')) {
      assert.ok(!body.query.includes('editions('));
      return Response.json({data:{search:{results:{hits:body.variables.q === 'absent' ? [] : [{document:{id:2,title:'Undercurrent',author_names:['Tetsuya Toyoda'],image:{url:'https://test.invalid/cover.jpg'}}}]}}}});
    }
    const data = body.query.includes('editions(where:')
      ? {editions:[{id:4,book_id:2,title:'Édition',isbn_13:'9781234567897',pages:120,publisher:{name:'Éditeur'}}]}
      : {books:[{id:2,title:'Œuvre',description:'Synopsis',contributions:[{author:{name:'Auteur'}}]}]};
    return Response.json({data});
  };
  try {
    await import('../supabase/functions/hardcover-proxy/index.ts');
    const request = (body, token = 'session') => new Request('https://proxy.test', {method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    assert.equal((await handler(request({action:'search',query:'test'}, 'invalid'))).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await handler(request({action:'mutation',query:'test'}))).status, 400);
    const quick = await (await handler(request({action:'search',query:'Undercurrent'}))).json();
    assert.equal(calls.length,1);
    assert.equal(quick.items[0].external_id,'2');
    assert.equal(quick.items[0].author,'Tetsuya Toyoda');
    assert.equal(quick.items[0].cover_url,'https://test.invalid/cover.jpg');
    assert.equal(quick.items[0].isbn,null);
    assert.deepEqual((await (await handler(request({action:'search',query:'absent'}))).json()).items,[]);
    const chosen = await (await handler(request({action:'select',id:'2'}))).json();
    assert.equal(chosen.items[0].external_id,'2:4');
    assert.deepEqual(calls.at(-1).variables,{book:2});
    calls = [];
    const body = {action:'search',query:'9781234567897'};
    const result = await (await handler(request(body))).json();
    assert.equal(result.items[0].external_id, '2:4');
    assert.equal(result.items[0].page_count, 120);
    assert.equal(calls[0].variables.isbn, body.query);
    assert.ok(!JSON.stringify(result).includes('private-test-token'));
    await handler(request(body));
    assert.equal(calls.length, 2, 'même recherche servie depuis le cache après contrôle de session');
    const details = await (await handler(request({action:'details',id:'2:4'}))).json();
    assert.equal(details.items[0].external_id,'2:4');
    assert.deepEqual(calls.at(-1).variables,{id:4,book:2});
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDeno === undefined) delete globalThis.Deno; else globalThis.Deno = originalDeno;
  }
});
