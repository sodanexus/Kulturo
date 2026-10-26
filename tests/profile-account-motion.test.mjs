import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../features/profile.js', import.meta.url), 'utf8');

test('Compte et sauvegarde anime la hauteur dans les deux sens', () => {
  assert.match(code, /enableAccountDisclosure\(container\)/);
  assert.match(code, /event\.preventDefault\(\)/);
  assert.match(code, /details\.animate\(/);
  assert.match(code, /details\.scrollHeight/);
  assert.match(code, /details\.open = false/);
  assert.match(code, /prefersReducedMotion\(\)/);
});

test('les animations interrompues ne terminent pas une transition plus récente', () => {
  assert.match(code, /previous\?\.animation\.cancel\(\)/);
  assert.match(code, /accountTransitions\.get\(details\)\?\.animation !== animation/);
  assert.match(code, /animatedAccountContainers\.has\(container\)/);
});
