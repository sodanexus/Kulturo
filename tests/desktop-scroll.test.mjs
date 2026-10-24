import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../features/finesse.js', import.meta.url), 'utf8');
function harness(desktop) {
  class Element {}
  const main = new Element(); Object.assign(main, { id: 'main', scrollTop: 100, scrollHeight: 2000, clientHeight: 500, querySelector: () => ({}) });
  const attrs = new Set(), timers = new Map(); let next = 0, resets = 0;
  const context = vm.createContext({ Element, window: { matchMedia: () => ({ matches: desktop }) }, document: { body: { dataset: {}, hasAttribute: n => attrs.has(n), setAttribute: n => attrs.add(n), removeAttribute: n => attrs.delete(n) } }, scrollTicking: false, libraryScrollTimer: 0, active: null, resetActive: () => resets++, requestAnimationFrame: fn => fn(), clearTimeout: id => timers.delete(id), setTimeout: fn => { timers.set(++next, fn); return next; }, clamp: (x,a,b) => Math.min(b,Math.max(a,x)), progressBar: () => null });
  vm.runInContext(source.slice(source.indexOf('function onScroll('), source.indexOf('if (typeof document')), context);
  return { context, main, attrs, timers, resets: () => resets };
}
test('desktop : suspendre une seule fois, reprendre après la fin du scroll', () => {
  const h=harness(true); h.context.onScroll({target:h.main}); h.context.onScroll({target:h.main});
  assert.ok(h.attrs.has('data-library-scrolling')); assert.equal(h.resets(),1); assert.equal(h.timers.size,1);
  [...h.timers.values()][0](); assert.equal(h.attrs.size,0);
});
test('mobile : ne pas modifier les effets pendant le défilement', () => {
  const h=harness(false); h.context.onScroll({target:h.main});
  assert.equal(h.attrs.size,0); assert.equal(h.timers.size,0); assert.equal(h.resets(),0);
});
