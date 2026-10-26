import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function loadProxy() {
  // Execute the stripped source as a function instead of importing a .ts module.
  // Node versions differ in how they classify TypeScript ESM imports.
  const source = await readFile(new URL('../supabase/functions/cover-proxy/index.ts', import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' });
  const executable = js.replace(/\bexport\s+function\s+allowedCoverUrl\b/, 'function allowedCoverUrl');
  if (executable === js) throw new Error('Export allowedCoverUrl introuvable dans cover-proxy');
  let handler;
  const Deno = { serve(fn) { handler = fn; } };
  const create = new Function('Deno', 'fetch', `${executable}\nreturn { allowedCoverUrl };`);
  const module = create(Deno, (...args) => globalThis.fetch(...args));
  if (typeof module.allowedCoverUrl !== 'function' || typeof handler !== 'function') {
    throw new Error('cover-proxy: exports ou gestionnaire absents');
  }
  return { handler, module };
}
const post = body => new Request('https://x.test/cover-proxy', { method: 'POST', body: JSON.stringify(body) });
const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });

test('cover-proxy : seuls les hébergeurs de jaquettes en https sont acceptés', async () => {
  const { module } = await loadProxy();
  assert.ok(module.allowedCoverUrl('https://assets.hardcover.app/edition/1/a.jpg'));
  assert.ok(module.allowedCoverUrl('https://covers.openlibrary.org/b/id/1-M.jpg'));
  for (const bad of ['http://assets.hardcover.app/a.jpg', 'https://evil.test/a.jpg', 'https://hardcover.app.evil.test/a.jpg',
    'https://user:pw@assets.hardcover.app/a.jpg', 'https://assets.hardcover.app:8443/a.jpg', 'https://127.0.0.1/a.jpg', 'pas une url', '']) {
    assert.equal(module.allowedCoverUrl(bad), null, bad);
  }
});

test('cover-proxy : renvoie l’image avec les en-têtes CORS', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => png();
  try {
    const { handler } = await loadProxy();
    const response = await handler(post({ url: 'https://assets.hardcover.app/edition/1/a.png' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.match(response.headers.get('access-control-allow-origin'), /^https:\/\//);
    assert.equal((await response.arrayBuffer()).byteLength, 4);
  } finally { globalThis.fetch = original; }
});

test('cover-proxy : refuse hôte inconnu, redirection sortante et fichier non image', async () => {
  const original = globalThis.fetch;
  try {
    const { handler } = await loadProxy();
    let calls = 0;
    globalThis.fetch = async () => { calls++; return png(); };
    assert.equal((await handler(post({ url: 'https://evil.test/a.png' }))).status, 400);
    assert.equal(calls, 0);

    globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/a.png' } });
    assert.equal((await handler(post({ url: 'https://assets.hardcover.app/a.png' }))).status, 502);

    globalThis.fetch = async () => new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } });
    assert.equal((await handler(post({ url: 'https://assets.hardcover.app/a.svg' }))).status, 415);
  } finally { globalThis.fetch = original; }
});

test('cover-proxy : image trop volumineuse refusée', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array(10), { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(50 * 1024 * 1024) } });
  try {
    const { handler } = await loadProxy();
    assert.equal((await handler(post({ url: 'https://assets.hardcover.app/a.png' }))).status, 502);
  } finally { globalThis.fetch = original; }
});
