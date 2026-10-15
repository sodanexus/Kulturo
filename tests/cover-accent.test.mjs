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
test('dark ambiance and readable commands have distinct lightness', () => {
  const color = accentFromSample(10,30,60);
  const lightness = value => Number(value.match(/ ([\d.]+)%\)$/)[1]);
  assert.ok(lightness(color.accent) >= 60);
  assert.ok(lightness(color.ambient) < 20);
});
