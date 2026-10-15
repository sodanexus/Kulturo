import test from 'node:test';
import assert from 'node:assert/strict';
import { motionDuration } from '../features/motion.js';

test('dialog cleanup follows CSS units, fallback and reduced motion', () => {
  const saved = Object.fromEntries(['document', 'getComputedStyle', 'matchMedia'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  try {
    let value = '250ms';
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => value });
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(motionDuration(), 250);
    value = '.25s';
    assert.equal(motionDuration(), 250);
    value = '0.3s';
    assert.equal(motionDuration(), 300);
    value = '0ms';
    assert.equal(motionDuration(), 0);
    value = 'invalid';
    assert.equal(motionDuration('--motion-dialog', 180), 180);
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(motionDuration(), 0);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
