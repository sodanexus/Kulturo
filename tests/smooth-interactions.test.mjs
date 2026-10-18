import test from 'node:test';
import assert from 'node:assert/strict';
import { animateHeightChange, prepareDialogClose, runViewTransition, shouldDismissSheet, transitionDialogReplacement, replaceModalContent } from '../features/motion.js';
import { setButtonBusy } from '../features/ui-states.js';

function installGlobals(values) {
  const descriptors = Object.fromEntries(Object.keys(values).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.assign(globalThis, values);
  return () => Object.entries(descriptors).forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('rapid navigation ignores obsolete updates and obsolete cleanup', async () => {
  const queue = [], calls = [];
  const document = { documentElement: { dataset: {} }, startViewTransition(update) {
    const done = deferred();
    const transition = { finished: done.promise, skipTransition() {} };
    queue.push({ update, done });
    return transition;
  }};
  const restore = installGlobals({ document, matchMedia: () => ({ matches: false }) });
  try {
    runViewTransition(() => calls.push('old'));
    runViewTransition(() => calls.push('new'));
    queue[0].update(); queue[1].update();
    assert.deepEqual(calls, ['new']);
    queue[0].done.resolve(); await Promise.resolve();
    assert.equal(document.documentElement.dataset.viewTransition, 'page');
    queue[1].done.resolve(); await Promise.resolve();
    assert.equal(document.documentElement.dataset.viewTransition, undefined);
  } finally { restore(); }
});

test('interrupted height change resumes from visible height and releases layout', async () => {
  const animations = [], attributes = new Set();
  let height = 100;
  const el = { getBoundingClientRect: () => ({ height }),
    setAttribute: key => attributes.add(key), removeAttribute: key => attributes.delete(key),
    animate(frames) {
      const done = deferred();
      const animation = { finished: done.promise, cancel() { done.reject(new Error('cancelled')); } };
      animations.push({ frames, animation, done });
      return animation;
    },
  };
  const restore = installGlobals({ matchMedia: () => ({ matches: false }) });
  try {
    const first = animateHeightChange(el, () => { height = 400; });
    height = 220; // Position visible à mi-parcours.
    const second = animateHeightChange(el, () => { height = 100; });
    assert.equal(animations[1].frames[0].height, '220px');
    assert.equal(await first, false);
    assert.equal(attributes.has('data-height-changing'), true);
    animations[1].done.resolve();
    assert.equal(await second, true);
    assert.equal(attributes.size, 0);
  } finally { restore(); }
});

test('reduced motion updates height immediately without an animation', async () => {
  let updated = false;
  const restore = installGlobals({ matchMedia: () => ({ matches: true }) });
  try {
    const el = { getBoundingClientRect: () => ({ height: updated ? 200 : 100 }), setAttribute() {}, removeAttribute() {}, animate() { throw Error('unexpected animation'); } };
    const result = animateHeightChange(el, () => { updated = true; });
    assert.equal(updated, true);
    assert.equal(await result, true);
  } finally { restore(); }
});

test('dialog closing captures the current opening transform and opacity', () => {
  const properties = new Map();
  const sheet = { style: { setProperty: (k,v) => properties.set(k,v) } };
  const overlay = { style: sheet.style, querySelector: () => sheet };
  const restore = installGlobals({ matchMedia: () => ({ matches: false }), getComputedStyle: el => ({ opacity: el === sheet ? '.6' : '.4', transform: 'matrix(1,0,0,1,0,22)' }) });
  try {
    prepareDialogClose(overlay);
    assert.equal(properties.get('--close-transform'), 'matrix(1,0,0,1,0,22)');
    assert.equal(properties.get('--close-opacity'), '.4');
    assert.equal(properties.get('--close-sheet-opacity'), '.6');
  } finally { restore(); }
});

test('sheet dismiss rejects short jolts and accepts intentional flicks', () => {
  assert.equal(shouldDismissSheet(8, 2), false);
  assert.equal(shouldDismissSheet(40, .7), true);
  assert.equal(shouldDismissSheet(40, 0), false);
  assert.equal(shouldDismissSheet(100, .1), true);
});

test('repeated busy state preserves the original label and disabled state', () => {
  const attributes = new Map([['aria-label', 'Enregistrer']]);
  const button = { disabled: true, classList: { add() {}, remove() {} },
    getAttribute: k => attributes.get(k) ?? null,
    setAttribute: (k,v) => attributes.set(k,v), removeAttribute: k => attributes.delete(k),
  };
  setButtonBusy(button, true); setButtonBusy(button, true); setButtonBusy(button, false);
  assert.equal(button.disabled, true);
  assert.equal(attributes.get('aria-label'), 'Enregistrer');
  assert.equal(attributes.has('aria-busy'), false);
});


test('detail/edit transition changes the shell dimensions without scaling text', async () => {
  let frames, options;
  const restore = installGlobals({ matchMedia: () => ({ matches: false }) });
  try {
    const next = { getBoundingClientRect: () => ({ width: 560, height: 640 }),
      querySelectorAll: () => [], animate: (f, o) => { frames=f; options=o; return { finished: Promise.resolve() }; } };
    transitionDialogReplacement({ width: 860, height: 800 }, next);
    assert.equal(frames[0].width, '860px');
    assert.equal(frames[1].width, '560px');
    assert.equal(frames[0].height, '800px');
    assert.equal(frames[1].height, '640px');
    assert.equal(frames.some(frame => 'transform' in frame), false);
    assert.equal(options.duration, 280);
  } finally { restore(); }
});

test('detail/edit transition honors reduced motion', () => {
  const restore = installGlobals({ matchMedia: () => ({ matches: true }) });
  try {
    transitionDialogReplacement({ width: 860, height: 800 }, { animate() { throw Error('unexpected motion'); } });
  } finally { restore(); }
});


test('modal replacement animates expansion and contraction after content setup', async () => {
  const restore = installGlobals({ matchMedia: () => ({ matches: false }) });
  try {
    for (const [from, to] of [[560,860],[860,560]]) {
      let current = { getBoundingClientRect: () => ({ width: from, height: 640 }) };
      let frames;
      const next = { isConnected: true, closest: () => ({ classList: { add() {} } }),
        getBoundingClientRect: () => ({ width: to, height: 800 }), querySelectorAll: () => [],
        animate: f => { frames=f; return { finished: Promise.resolve() }; } };
      const root = { querySelector: () => current, set innerHTML(value) { current=next; } };
      replaceModalContent(root, '<dialog>');
      assert.equal(frames, undefined);
      await Promise.resolve();
      assert.equal(frames[0].width, `${from}px`);
      assert.equal(frames[1].width, `${to}px`);
    }
  } finally { restore(); }
});

test('an obsolete modal replacement does not animate a detached panel', async () => {
  let current={getBoundingClientRect:()=>({width:560,height:640})};
  const next={isConnected:true,closest:()=>({classList:{add(){}}}),animate(){throw Error('obsolete panel');}};
  const root={querySelector:()=>current,set innerHTML(value){current=next;}};
  replaceModalContent(root,'next');current=null;next.isConnected=false;
  await Promise.resolve();
});


test('navigation without View Transitions reveals the new page exactly once', () => {
  let updates = 0, frames;
  const page = { animate: f => { frames = f; return { finished: Promise.resolve() }; } };
  const restore = installGlobals({ document: { documentElement: { dataset: {} }, querySelector: () => page }, matchMedia: () => ({ matches: false }) });
  try {
    runViewTransition(() => { updates++; });
    assert.equal(updates, 1);
    assert.equal(frames[0].opacity, 0);
    assert.equal(frames[1].opacity, 1);
  } finally { restore(); }
});

test('navigation fallback respects reduced motion', () => {
  let updates = 0;
  const page = { animate() { throw Error('unexpected animation'); } };
  const restore = installGlobals({ document: { documentElement: { dataset: {} }, querySelector: () => page }, matchMedia: () => ({ matches: true }) });
  try {
    runViewTransition(() => { updates++; });
    assert.equal(updates, 1);
  } finally { restore(); }
});

test('a synchronous View Transition failure still animates and completes navigation', () => {
  let updates = 0, animated = false;
  const page = { animate() { animated = true; return { finished: Promise.resolve() }; } };
  const doc = { documentElement: { dataset: {} }, querySelector: () => page, startViewTransition() { throw Error('unsupported state'); } };
  const restore = installGlobals({ document: doc, matchMedia: () => ({ matches: false }) });
  try {
    runViewTransition(() => { updates++; });
    assert.equal(updates, 1);
    assert.equal(animated, true);
    assert.equal(doc.documentElement.dataset.viewTransition, undefined);
  } finally { restore(); }
});
