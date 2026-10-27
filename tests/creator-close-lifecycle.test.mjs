import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../features/media-detail.js', import.meta.url), 'utf8');
const close = source.slice(source.indexOf('function closeMetadataPanel('), source.indexOf('\nfunction openMetadataMedia('));

test('an old creator close cannot unlock the detail or steal focus from a newer panel', () => {
 let timer, current, aborted = 0, focus;
 const detail = { inert: true };
 const old = { querySelector: () => ({}), classList: { contains: () => false, add() {} }, remove() { if (current === old) current = null; } };
 current = old;
 const context = vm.createContext({
  document: { getElementById: () => current, querySelector: () => detail },
  stopCreatorRequests: () => aborted++, historyOwnsLayer: () => false,
  syncDialogBackground() {}, prepareDialogClose() {}, motionDuration: () => 200,
  dialogFocus: { deactivate: (_dialog, options) => { focus = options.restoreFocus; } },
  setTimeout: callback => { timer = callback; }, _metadataReturnFocus: 'new trigger'
 });
 vm.runInContext(close + '\ncloseMetadataPanel();', context);
 current = {}; timer();
 assert.equal(aborted, 1); assert.equal(detail.inert, true); assert.equal(focus, false);
 assert.equal(context._metadataReturnFocus, 'new trigger');
});

test('closing the last creator panel restores the detail and clears its focus reference', () => {
 let current, focus;
 const detail = { inert: true };
 current = { querySelector: () => ({}), remove() { current = null; } };
 const context = vm.createContext({
  document: { getElementById: () => current, querySelector: () => detail },
  stopCreatorRequests() {}, syncDialogBackground() {},
  dialogFocus: { deactivate: (_dialog, options) => { focus = options.restoreFocus; } },
  _metadataReturnFocus: 'old trigger'
 });
 vm.runInContext(close + '\ncloseMetadataPanel({ immediate: true });', context);
 assert.equal(detail.inert, false); assert.equal(focus, true); assert.equal(context._metadataReturnFocus, null);
});
