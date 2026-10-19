import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { CARD_FONTS, loadCardFonts } from './card-fonts.ts';

const root = new URL('../../', import.meta.url);
const bytes = (path: string) => readFileSync(new URL(path, root));
const inventory = JSON.parse(bytes('assets/fonts/inventory.json').toString()) as {
  file: string; upstreamFamily: string; family: string; sha256: string; license: string;
}[];

// WOFF2's name table is not transformed. Only decode the directory and Brotli stream;
// no shaping/parser dependency is introduced into the production card or CI.
function nameTable(font: Buffer): Buffer {
  if (font.toString('ascii', 0, 4) !== 'wOF2') {
    for (let index = 0; index < font.readUInt16BE(4); index++) {
      const offset = 12 + index * 16;
      if (font.toString('ascii', offset, offset + 4) === 'name') {
        const start = font.readUInt32BE(offset + 8);
        return font.subarray(start, start + font.readUInt32BE(offset + 12));
      }
    }
    throw new Error('No name table');
  }
  let cursor = 48;
  const base128 = () => {
    let value = 0;
    for (let count = 0; count < 5; count++) {
      const next = font[cursor++];
      value = value * 128 + (next & 127);
      if (!(next & 128)) return value;
    }
    throw new Error('Invalid WOFF2 UIntBase128');
  };
  let streamOffset = 0;
  let nameOffset = -1;
  let nameLength = 0;
  for (let index = 0; index < font.readUInt16BE(12); index++) {
    const flag = font[cursor++];
    const tag = flag & 63;
    let custom = '';
    if (tag === 63) {
      custom = font.toString('ascii', cursor, cursor + 4);
      cursor += 4;
    }
    const length = base128();
    const glyphTable = tag === 10 || tag === 11 || custom === 'glyf' || custom === 'loca';
    const transformed = glyphTable ? flag >> 6 !== 3 : flag >> 6 !== 0;
    const storedLength = transformed ? base128() : length;
    if (tag === 5 || custom === 'name') { nameOffset = streamOffset; nameLength = length; }
    streamOffset += storedLength;
  }
  assert.ok(nameOffset >= 0);
  const stream = brotliDecompressSync(font.subarray(cursor, cursor + font.readUInt32BE(20)));
  return stream.subarray(nameOffset, nameOffset + nameLength);
}

function names(font: Buffer): { id: number; text: string }[] {
  const table = nameTable(font);
  return Array.from({ length: table.readUInt16BE(2) }, (_, index) => {
    const offset = 6 + index * 12;
    const platform = table.readUInt16BE(offset);
    const start = table.readUInt16BE(4) + table.readUInt16BE(offset + 10);
    const value = Buffer.from(table.subarray(start, start + table.readUInt16BE(offset + 8)));
    return {
      id: table.readUInt16BE(offset + 6),
      text: platform === 0 || platform === 3 ? value.swap16().toString('utf16le') : value.toString('latin1'),
    };
  });
}

test('all eleven reviewed local fonts carry complete matching notices, including standalone WOFF2 data', () => {
  const files = [
    ...readdirSync(new URL('assets/fonts/', root)).filter(file => file.endsWith('.ttf')).map(file => `assets/fonts/${file}`),
    ...readdirSync(new URL('public/fonts/', root)).filter(file => file.endsWith('.woff2')).map(file => `public/fonts/${file}`),
  ];
  assert.equal(inventory.length, 11);
  assert.deepEqual(inventory.map(font => font.file).sort(), files.sort());
  for (const font of inventory) {
    const data = bytes(font.file);
    assert.equal(createHash('sha256').update(data).digest('hex'), font.sha256, font.file);
    const license = bytes(font.license).toString('utf8');
    assert.ok(names(data).some(record => record.id === 13 && record.text === license), font.file);
    if (font.upstreamFamily === 'Liberation') {
      const primary = names(data).filter(record => [1, 3, 4, 6, 16, 18, 21, 25].includes(record.id));
      assert.ok(primary.some(record => record.text === 'Sovereign Serif'));
      for (const record of primary) assert.doesNotMatch(record.text, /Liberation|Arimo|Tinos|Cousine/);
    }
  }
});

test('seven public upstream notices match pinned Git blobs and keep the full OFL terms', () => {
  const sources = JSON.parse(bytes('assets/fonts/license-sources.json').toString()) as { family: string; blob: string }[];
  const families = ['Geist', 'Handjet', 'Tiny5', 'Liberation', 'PTSerif', 'PTMono', 'MarckScript'];
  assert.deepEqual(sources.map(source => source.family).sort(), families.sort());
  for (const source of sources) {
    const notice = bytes(`public/fonts/licenses/${source.family}.txt`);
    const gitBlob = createHash('sha1').update(`blob ${notice.length}\0`).update(notice).digest('hex');
    assert.equal(gitBlob, source.blob, source.family);
    assert.match(notice.toString(), /Copyright/i);
    for (const clause of ['SIL OPEN FONT LICENSE', 'PERMISSION', 'TERMINATION', 'DISCLAIMER']) {
      assert.ok(notice.toString().includes(clause), `${source.family}: ${clause}`);
    }
  }
});

test('result cards still load five embedded font faces with the same renderer aliases and weights', async () => {
  const first = loadCardFonts();
  assert.equal(loadCardFonts(), first);
  const fonts = await first;
  assert.equal(fonts.length, 5);
  assert.deepEqual(fonts.map(({ name, weight, style }) => ({ name, weight, style })),
    CARD_FONTS.map(({ name, weight, style }) => ({ name, weight, style })));
  for (const font of fonts) {
    assert.ok(font.data.length > 10_000);
    assert.ok(names(font.data).some(record => record.id === 13 && record.text.includes('SIL OPEN FONT LICENSE')));
  }
});
