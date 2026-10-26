import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
test('Hardcover publisher utilise bigint dans le filtre ids', async () => {
  const source = await read('../supabase/functions/hardcover-proxy/index.ts');
  assert.match(source, /query\(\$ids:\[bigint!\]!\)\{publishers/);
  assert.doesNotMatch(source, /query\(\$ids:\[Int!\]!\)\{publishers/);
});
test('Les fiches créateurs utilisent Groq pour la traduction et le secours', async () => {
  const api = await read('../api.js');
  const proxy = await read('../supabase/functions/groq-proxy/index.ts');
  assert.match(api, /action: "creator-description"/);
  assert.match(api, /functions\/v1\/groq-proxy/);
  assert.doesNotMatch(api, /functions\/v1\/grok-proxy/);
  assert.match(proxy, /creator-description/);
  assert.match(proxy, /oeuvres_repertoriees/);
});
