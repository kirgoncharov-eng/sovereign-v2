import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stylize, PALETTE, PALETTES_BY_NAME } from './dist/engine.mjs';

function fixture() {
  const frame = { width: 192, height: 256, data: new Uint8ClampedArray(192 * 256 * 4) };
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const offset = (y * frame.width + x) * 4;
    frame.data.set([x, y, (x + y) % 256, x < 12 ? 0 : 255], offset);
  }
  return frame;
}

test('three output sizes: exact dimensions, opaque colors belong to shared palette, input is immutable', () => {
  const frame = fixture();
  const before = new Uint8ClampedArray(frame.data);
  const allowed = new Set(PALETTE.map(color => color.join(',')));
  for (const width of [48, 64, 96]) {
    const result = stylize(frame, width);
    assert.equal(result.width, width);
    assert.equal(result.height, Math.round(width * frame.height / frame.width));
    for (let index = 0; index < result.data.length; index += 4) {
      assert.ok([0, 255].includes(result.data[index + 3]));
      if (result.data[index + 3]) assert.ok(allowed.has(Array.from(result.data.slice(index, index + 3)).join(',')));
    }
    assert.deepEqual(frame.data, before);
  }
});

test('same settings give the same output, including after a different setting was used', () => {
  const frame = fixture();
  const first = stylize(frame, 64, 0.5);
  const strong = stylize(frame, 96, 1);
  assert.notDeepEqual(first.data, strong.data);
  assert.deepEqual(stylize(frame, 64, 0.5), first);
  const transparent = stylize({ ...frame, data: new Uint8ClampedArray(frame.data.length) }, 48);
  assert.ok(transparent.data.every((value, index) => index % 4 !== 3 || value === 0));
});

test('reject invalid dimensions and controls', () => {
  assert.throws(() => stylize(fixture(), 512));
  assert.throws(() => stylize(fixture(), 64, NaN));
  assert.throws(() => stylize({ width: 192, height: 256, data: new Uint8ClampedArray(8) }));
});

test('both palettes remain fixed after switching between them', () => {
  const frame = fixture();
  const expected = stylize(frame, 64, 0.2, 'cabinet');
  const color = stylize(frame, 64, 0.2, 'color');
  const allowed = new Set(PALETTES_BY_NAME.color.map(item => item.join(',')));
  for (let index = 0; index < color.data.length; index += 4) {
    if (color.data[index + 3]) assert.ok(allowed.has(Array.from(color.data.slice(index, index + 3)).join(',')));
  }
  assert.deepEqual(stylize(frame, 64, 0.2, 'cabinet'), expected);
});

test('standalone document blocks connections, has no external resources or original-photo persistence', () => {
  const html = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'sha256-/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|indexedDB|WebSocket/);
  assert.match(html, /Copyright \(c\) 2019 José Moreira/);
  assert.match(html, /Copyright \(c\) 2026 AleksTomatoOnion/);
});
