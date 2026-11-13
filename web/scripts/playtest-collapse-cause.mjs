// #347: восстановить настоящий финал и прочитать причину в мобильных мемуарах.
// npm run build:demo && node scripts/playtest-collapse-cause.mjs --save=/path/final-save.json --out=playtest/collapse
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchChromium } from './browser.mjs';
import { memoir, startFromSeed } from '../lib/client/chronicle.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';
import { parseSave } from '../lib/client/save.ts';
import { endCause } from '../lib/game/engine.ts';

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.ok(arg('save'), '--save должен указывать на реальное сохранение завершённой партии');
const raw = readFileSync(resolve(arg('save')), 'utf8');
const save = parseSave(raw);
assert.ok(save?.state.ended);
const game = save.state, pageData = await memoir(game);
const out = resolve(arg('out') ?? 'playtest/collapse');
mkdirSync(out, { recursive: true });
const snapshot = encodeChronicle({ start: startFromSeed(game.seed, game.diff), game,
  shown: pageData.fall ? [pageData.fall] : [], queue: [], step: null, picks: [], form: null,
  stop: null, stops: {}, memory: EMPTY_PERSONAL, visibleResources: game.resources, page: pageData, rivals: [], over: true });
assert.ok(parseChronicle(snapshot));
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(({ raw, snapshot, key }) => {
  localStorage.setItem('sovereign.save', raw);
  localStorage.setItem(key, snapshot);
}, { raw, snapshot, key: CHRONICLE_GAME_KEY });
try {
  await page.goto(`file://${resolve('demo/dist/sovereign.html')}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  const cause = page.locator('[data-ending-cause]');
  await cause.waitFor();
  assert.equal(await cause.innerText(), `Канцелярия: ${endCause(game).replace(/^Рухнул ресурс: /, 'основание отставки — ')}`);
  const text = await page.locator('body').innerText();
  assert.ok(text.includes(pageData.fall.text));
  if (game.resources.personalResource <= 4 && game.resources.economy > 4) {
    assert.match(pageData.fall.text, /Лидер измотан/);
    assert.doesNotMatch(pageData.fall.text, /бюджетникам|Казна пуста/);
  }
  if (game.resources.economy <= 4) assert.match(pageData.fall.text, /Казна пуста/);
  await cause.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.screenshot({ path: join(out, 'cause.png') });
  await page.screenshot({ path: join(out, 'full.png'), fullPage: true });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
  assert.deepEqual(stored.resources, game.resources);
  assert.equal(stored.endType, game.endType);
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ cause: endCause(game), fall: pageData.fall.text, errors }, null, 2));
  console.log(JSON.stringify({ cause: endCause(game), fall: pageData.fall.text, errors }));
} finally {
  await browser.close();
}
