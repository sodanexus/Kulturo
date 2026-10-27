import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogueCache, CATALOGUE_TTL } from '../features/catalogue-cache.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
 const records = new Map(); let time = 1000;
 const store = { async get(key) { return structuredClone(records.get(key)); }, async put(row) { records.set(row.key, structuredClone(row)); } };
 return { records, store, now: () => time, advance: n => { time += n; } };
}
test('catalogue survives a new client, respects TTL and returns isolated values', async () => {
 const f = fixture(); let calls = 0;
 const load = async () => ({ id: 1, title: 'Original', revision: ++calls });
 const first = createCatalogueCache(f.store, f.now);
 await first('tmdb:movie:1', 'daily', load);
 const next = createCatalogueCache(f.store, f.now);
 const value = await next('tmdb:movie:1', 'daily', load); value.title = 'Personal edit';
 assert.equal((await next('tmdb:movie:1', 'daily', load)).title, 'Original');
 assert.equal(calls, 1);
 f.advance(CATALOGUE_TTL.daily + 1);
 assert.equal((await next('tmdb:movie:1', 'daily', load)).revision, 1);
 await tick(); assert.equal((await next('tmdb:movie:1', 'daily', load)).revision, 2);
});
test('expired data survives API failure but data over 90 days does not', async () => {
 const f = fixture(), client = createCatalogueCache(f.store, f.now);
 await client('key', 'daily', async () => ({ id: 1 }));
 f.advance(CATALOGUE_TTL.daily + 1);
 const fail = async () => { throw new Error('offline'); };
 assert.equal((await client('key', 'daily', fail)).id, 1); await tick();
 assert.equal(f.records.size, 1);
 f.advance(90 * CATALOGUE_TTL.daily);
 await assert.rejects(client('key', 'daily', fail), /offline/);
});
test('explicit refresh bypasses saved data and error payloads are not saved', async () => {
 const f = fixture(), client = createCatalogueCache(f.store, f.now);
 await client('key', 'daily', async () => ({ id: 1 }));
 assert.equal((await client('key', 'daily', async force => { assert.equal(force, true); return { id: 2 }; }, { fresh: true })).id, 2);
 for (const value of [{ error: 'bad' }, { errors: ['bad'] }, { success: false }, null, [], {}]) {
  await client('bad', 'daily', async () => value); assert.equal(f.records.has('bad'), false);
 }
});
test('abort during disk access prevents network calls and stale display', async () => {
 const controller = new AbortController(); let finish, calls = 0;
 const client = createCatalogueCache({ get: () => new Promise(resolve => { finish = resolve; }), put() {} });
 const pending = client('key', 'daily', async () => { calls++; }, { signal: controller.signal });
 controller.abort(); finish(null);
 await assert.rejects(pending, { name: 'AbortError' }); assert.equal(calls, 0);
});
test('unavailable storage falls back to the network and concurrent stale reads refresh once', async () => {
 const client = createCatalogueCache({ get() { throw Error('denied'); }, put() { throw Error('quota'); } });
 assert.deepEqual(await client('key', 'daily', async () => ({ id: 1 })), { id: 1 });
 const f = fixture(), cached = createCatalogueCache(f.store, f.now);
 await cached('key', 'daily', async () => ({ id: 1 })); f.advance(CATALOGUE_TTL.daily + 1);
 let calls = 0, finish;
 const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
 await Promise.all([cached('key', 'daily', load), cached('key', 'daily', load)]);
 assert.equal(calls, 1); finish({ id: 2 }); await tick();
});
