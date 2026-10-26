import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('Groq reste le seul proxy IA et aucune route xAI obsolète ne subsiste', () => {
  assert.equal(existsSync(resolve(root, 'supabase/functions/grok-proxy')), false);
  const api = readFileSync(resolve(root, 'api.js'), 'utf8');
  const proxy = readFileSync(resolve(root, 'supabase/functions/groq-proxy/index.ts'), 'utf8');
  assert.match(api, /functions\/v1\/groq-proxy/);
  assert.doesNotMatch(api, /functions\/v1\/grok-proxy|api\.x\.ai|XAI_API_KEY/);
  assert.match(proxy, /GROQ_API_KEY/);
  assert.match(proxy, /api\.groq\.com/);
  assert.doesNotMatch(proxy, /api\.x\.ai|XAI_API_KEY/);
});
