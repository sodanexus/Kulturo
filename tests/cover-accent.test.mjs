import test from 'node:test';
import assert from 'node:assert/strict';
import { accentFromSample, accentFromPixels } from '../features/cover-accent.js';
const pixels = (...groups) => Uint8ClampedArray.from(groups.flatMap(([color, count]) => Array.from({ length: count }, () => color).flat()));

test('grays, white and black remain neutral', () => {
  for (const gray of [0, 64, 128, 255]) {
    const color = accentFromSample(gray, gray, gray);
    assert.match(color.accent, /^hsl\(0 0% /);
    assert.match(color.ambient, /^hsl\(0 0% /);
  }
});
test('a small saturated logo does not override a large blue background', () => {
  const color = accentFromPixels(pixels([[30,60,100,255],90], [[255,0,0,255],10]));
  assert.ok(color.hue > 200 && color.hue < 230);
});
test('a nuanced background is grouped rather than split into exact RGB buckets', () => {
  const background = Array.from({length:80}, (_,i) => [20+i%15, 50+i%20, 100+i%30, 255]);
  const color = accentFromPixels(Uint8ClampedArray.from([...background, ...Array.from({length:20},()=>[255,0,0,255])].flat()));
  assert.ok(color.hue > 200 && color.hue < 240);
});
test('a monochrome poster stays neutral despite a colored detail', () => {
  const color = accentFromPixels(pixels([[80,80,80,255],95], [[255,0,0,255],5]));
  assert.match(color.ambient, /^hsl\(0 0% /);
});
test('transparent pixels cannot choose the color', () => {
  const color = accentFromPixels(pixels([[255,0,0,0],100], [[0,100,160,255],5]));
  assert.ok(color.hue > 190 && color.hue < 230);
  assert.equal(accentFromPixels(pixels([[255,0,0,0],100])), null);
});
test('the aura stays visible on a dark poster while commands stay readable', () => {
  const color = accentFromSample(10,30,60);
  const lightness = value => Number(value.match(/ ([\d.]+)%\)$/)[1]);
  assert.ok(lightness(color.accent) >= 60);
  // L'aura est une lumière : elle ne reprend plus la luminosité de l'affiche.
  assert.ok(lightness(color.ambient) >= 40 && lightness(color.ambient) < lightness(color.accent));
});
test('a nearly black poster with a faint tint stays neutral', () => {
  const noise = Array.from({ length: 100 }, (_, i) => [4 + i % 3, 7 + i % 4, 16 + i % 5, 255]);
  const color = accentFromPixels(Uint8ClampedArray.from(noise.flat()));
  assert.match(color.accent, /^hsl\(0 0% /);
});
test('a dark poster keeps the hue of its colored subject instead of going gray', () => {
  const color = accentFromPixels(pixels([[8,8,9,255],80], [[150,15,20,255],20]));
  assert.ok(color.hue < 20 || color.hue > 340);
});
test('a white background does not hide a colorful character', () => {
  const color = accentFromPixels(pixels([[246,246,246,255],55], [[40,90,200,255],45]));
  assert.ok(color.hue > 200 && color.hue < 240);
});
test('the dominant hue is not split between two histogram bins', () => {
  // 195° et 205° d'une même famille bleue, séparées par une frontière de case.
  const color = accentFromPixels(pixels([[30,120,170,255],35], [[40,110,175,255],35], [[200,60,40,255],30]));
  assert.ok(color.hue > 190 && color.hue < 225);
});
test('every returned color is a valid hsl() value', () => {
  for (const sample of [[255,0,0],[0,255,0],[0,0,255],[255,255,0],[0,255,255],[255,0,255],[12,12,12]]) {
    const color = accentFromSample(...sample);
    for (const key of ['accent','accent2','ambient','ambientSoft','glow','system']) {
      assert.match(color[key], /^hsl\([\d.]+ [\d.]+% [\d.]+%( \/ [\d.]+)?\)$/);
    }
  }
});
