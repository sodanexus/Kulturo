import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const file = async path => readFile(new URL(path, import.meta.url), 'utf8');
test('Hardcover : ID éditeur en bigint pour recherche et catalogue', async () => {
  const source = await file('../supabase/functions/hardcover-proxy/index.ts');
  assert.match(source, /query\(\$ids:\[bigint!\]!\)\{publishers/);
  assert.match(source, /query\(\$id:bigint!\)\{editions\(where:\{publisher_id/);
});
test('Créateurs : traduction française des biographies, secours Groq identifié', async () => {
  const api = await file('../api.js');
  const feature = await file('../features/media-detail.js');
  assert.match(api, /CreatorDescriptions =/);
  assert.match(api, /translateText\(source/);
  assert.match(api, /functions\/v1\/groq-proxy/);
  assert.match(feature, /await CreatorDescriptions\.enrich/);
  assert.match(feature, /Présentation générée par Groq/);
});
test('Groq : clé serveur, génération bornée et texte IA limité', async () => {
  const proxy = await file('../supabase/functions/groq-proxy/index.ts');
  assert.match(proxy, /Deno\.env\.get\("GROQ_API_KEY"\)/);
  assert.match(proxy, /https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.match(proxy, /creator-description/);
  assert.match(proxy, /translation\.slice\(0, 900\)/);
});
