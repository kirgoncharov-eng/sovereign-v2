// #334: раскрытие фактической ведомости, сохранение текста и защита от случайного продвижения ленты.
// npm run build:demo && node scripts/playtest-chronicle-ledger.mjs [--out=playtest/chronicle-ledger]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { APP_VERSION, SAVE_VERSION } from '../lib/game/data.ts';
import { resolveTurn } from '../lib/game/engine.ts';
import { firstStep, newTerm, nextCase, quarterLines, signOption, startFromSeed } from '../lib/client/chronicle.ts';
import { ledgerParts } from '../lib/client/chronicle-ledger.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';
import { parseSave } from '../lib/client/save.ts';

const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/chronicle-ledger');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const summary = { checks: [], problems: [], texts: [] };

async function fixture(name, before, after, { old = false, queued = false, width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: width < 500, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => summary.problems.push(String(error)));
  const lines = quarterLines(before, after, EMPTY_PERSONAL).lines;
  const ledger = lines.find(line => line.kind === 'ledger');
  if (old) ledger.text = ledgerParts(ledger.text).summary;
  const parts = ledgerParts(ledger.text);
  const game = { ...await nextCase(after),
    analyticsRun: { id: '334'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary' } };
  assert.equal(game.lastTurn, null, 'пояснение читается и после закрытия отчёта движка');
  const save = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: game });
  const chronicle = encodeChronicle({ start: startFromSeed(7, game.diff), game, shown: [ledger],
    queue: queued ? [{ ...ledger, id: 'queued', kind: 'scene', text: 'Следующая запись канцелярии.' }] : [],
    step: firstStep(game), picks: [], form: null, stop: null, stops: {}, memory: EMPTY_PERSONAL,
    visibleResources: game.resources, page: null, rivals: null, over: false });
  assert.ok(parseSave(save));
  assert.ok(parseChronicle(chronicle));
  await page.addInitScript(({ save, chronicle, key }) => {
    if (sessionStorage.getItem('fixture334')) return;
    localStorage.setItem('sovereign.save', save);
    localStorage.setItem(key, chronicle);
    localStorage.setItem('chronicle.speed', 'calm');
    sessionStorage.setItem('fixture334', '1');
  }, { save, chronicle, key: CHRONICLE_GAME_KEY });
  await page.goto(`file://${resolve('demo/dist/sovereign.html')}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('button', { name: 'Пауза', exact: true }).tap();
  const block = page.locator('[data-chronicle-ledger]');
  await block.waitFor();
  assert.equal(await block.locator(':scope > p').innerText(), parts.summary);
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot, CHRONICLE_GAME_KEY);
  const original = await saved();
  const details = block.locator('details');
  if (old) {
    assert.equal(await details.count(), 0);
  } else {
    assert.equal(await details.getAttribute('open'), null, 'подробности изначально свёрнуты');
    const toggle = details.locator('summary');
    await toggle.scrollIntoViewIfNeeded();
    assert.ok(await toggle.evaluate(element => element.getBoundingClientRect().height >= 44), 'цель касания не меньше 44px');
    await toggle.tap();
    assert.notEqual(await details.getAttribute('open'), null);
    assert.deepEqual(await details.locator('h3').allTextContents(), parts.details.map(detail => detail.split('\n')[0]));
    assert.deepEqual(await details.locator('li').allTextContents(), parts.details.flatMap(detail => detail.split('\n').slice(1)));
    await page.waitForTimeout(200);
    assert.deepEqual(await saved(), original, 'раскрытие не меняет партию, решение и очередь');
    await page.screenshot({ path: join(out, `${name}-open.png`), fullPage: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await details.getAttribute('open'), null, 'клавиатура сворачивает ведомость');
    await page.keyboard.press('Enter');
    assert.notEqual(await details.getAttribute('open'), null);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
    await block.waitFor();
    await page.getByRole('button', { name: 'Пауза', exact: true }).tap();
    await details.locator('summary').scrollIntoViewIfNeeded();
    await details.locator('summary').tap();
    assert.deepEqual(await details.locator('li').allTextContents(), parts.details.flatMap(detail => detail.split('\n').slice(1)));
    const restored = await saved();
    assert.deepEqual(restored.game, original.game, 'reload сохраняет ресурсы и квоту');
    assert.deepEqual(restored.queue, original.queue, 'раскрытие не сдвигает очередь даже при ожидающей строке');
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'нет горизонтального скролла');
  summary.checks.push(name);
  summary.texts.push({ name, text: ledger.text });
  await context.close();
}

try {
  for (const [seed, diff] of [[1, 'debut'], [7, 'coalition'], [21, 'crisis']]) {
    const before = await nextCase(await newTerm(startFromSeed(seed, diff)));
    const after = await signOption(before, firstStep(before).options[0].key);
    await fixture(`seed-${seed}-${diff}`, before, after, { queued: seed === 1 });
  }
  const initial = await nextCase(await newTerm(startFromSeed(7)));
  const before = { ...initial, resources: { ...initial.resources, economy: 60 },
    pending: [{ id: 'debt', due: initial.turn + 1, label: 'Возврат аванса', res: { economy: -4 }, source: 'заём' }],
    currentEvent: { ...initial.currentEvent, choices: [{ id: 'pay', text: 'Оплатить поставки', hint: '', tags: [], resolvesCrisis: null,
      deal: { pure: true, res: { economy: -9 } } }] } };
  const after = resolveTurn(before, 'pay', { headline: 'Поставки оплачены', narrative: 'Казначейство перечислило средства.',
    reactions: [], historianNote: '', crisisTitle: null, crisisDescription: null, powerLoss: null });
  await fixture('two-payments-mobile', before, after);
  await fixture('two-payments-desktop', before, after, { width: 1440 });
  await fixture('old-text', before, after, { old: true });
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
assert.deepEqual(summary.problems, []);
console.log(JSON.stringify({ checks: summary.checks, problems: summary.problems }, null, 2));
