// #438: естественный путь зерна 12 и контролируемый пример 18 − 8 − 7 − 2 (не естественный баланс).
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { launchChromium } from './browser.mjs';
import { newTerm, nextCase, startFromSeed, signOption, firstStep } from '../lib/client/chronicle.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { parseSave } from '../lib/client/save.ts';
import { APP_VERSION, SAVE_VERSION } from '../lib/game/data.ts';
import { advisorOutlook } from '../lib/client/advisor-outlook.ts';
import { quarterRisk } from '../lib/client/choice-outcomes.ts';
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/quarter-risk');
await mkdir(out, { recursive: true });
const summary = { checks: [], problems: [] }, start = startFromSeed(12, 'coalition');
let natural = await newTerm(start);
for (let i = 0; i < 4; i++) { natural = await nextCase(natural); natural = await signOption(natural, firstStep(natural).options[0].key); }
natural = await nextCase(natural);
assert.equal(natural.currentEvent.card, 'alt_fuel_audit');
assert.ok(natural.activeCrises.some(crisis => crisis.resourceDrain.economy < 0));
const choice = { ...natural.currentEvent.choices[0], tags: [], policyEffect: undefined, resolvesCrisis: null, deal: { pure: true, res: { economy: -8 } } };
const controlled = { ...natural, resources: { ...natural.resources, economy: 18 },
  advisors: natural.advisors.map(person => ({ ...person, skill: 3 })),
  pending: [{ id: 'risk-advance', due: natural.turn + 1, label: 'Возврат аванса за мазут', source: 'Ранее подписанная поставка', res: { economy: -7 } }],
  activeCrises: [{ id: 'risk-bank', title: 'Банковская паника', description: 'Контрольная копия кризиса', severity: 'low', turnsActive: 0, resourceDrain: { economy: -2 } }],
  currentEvent: { ...natural.currentEvent, choices: [choice, ...natural.currentEvent.choices.slice(1)], council: undefined } };
const safe = { ...controlled, resources: { ...controlled.resources, economy: 70 } };
const html = await readFile('demo/dist/sovereign.html');
const server = createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); });
let browser;
async function open(game) {
  const state = { ...game, analyticsRun: { id: '438'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary' } };
  const save = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state });
  const chronicle = encodeChronicle({ start, game: state, shown: [], queue: [], step: firstStep(state), picks: [], form: null,
    stop: null, stops: {}, memory: { used: [], lastTurn: null }, visibleResources: state.resources, page: null, rivals: null, over: false });
  assert.ok(parseSave(save)); assert.ok(parseChronicle(chronicle));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', error => summary.problems.push(String(error)));
  await page.addInitScript(({ save, chronicle, key }) => {
    if (sessionStorage.getItem('quarter-risk-loaded')) return;
    localStorage.setItem('sovereign.save', save); localStorage.setItem(key, chronicle); localStorage.setItem('chronicle.speed', 'all');
    sessionStorage.setItem('quarter-risk-loaded', '1');
  }, { save, chronicle, key: CHRONICLE_GAME_KEY });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('heading', { name: state.currentEvent.title, exact: true }).waitFor();
  return { page, context };
}
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done)); browser = await launchChromium();
  for (const [name, state, expected] of [['seed-12-natural', natural, true], ['controlled-debt', controlled, true], ['safe', safe, false]]) {
    const { page, context } = await open(state);
    assert.equal(await page.locator('[data-quarter-risk]').count(), 0, 'нет лишнего блока в свёрнутом варианте');
    await page.locator('button.sv-choice-row').first().tap();
    const detail = page.getByRole('group', { name: 'Последствия выбранного решения' }), warnings = detail.locator('[data-quarter-risk]');
    assert.equal(quarterRisk(state, state.currentEvent.choices[0], advisorOutlook(state, state.currentEvent.choices[0])).length > 0, expected);
    assert.equal(await warnings.count(), Number(expected));
    if (expected) {
      const text = await warnings.innerText(); assert.match(text, /Банковская паника/);
      if (name === 'controlled-debt') {
        assert.match(text, /Возврат аванса за мазут.*−7/); assert.match(text, /Банковская паника.*−2/);
        assert.match(text, /По этим статьям останется 1/);
      }
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 }); await warnings.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: join(out, `${name}-${width}.png`) });
      }
    }
    await detail.getByRole('button', { name: 'Подписать', exact: true }).tap();
    await page.waitForFunction(({ key, turn }) => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > turn,
      { key: CHRONICLE_GAME_KEY, turn: state.turn });
    const signed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot.game, CHRONICLE_GAME_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot.game, CHRONICLE_GAME_KEY);
    assert.ok(saved.turn > state.turn, 'подпись и reload сохраняют результат');
    assert.deepEqual(saved.resources, signed.resources, 'reload не списывает обязательства ещё раз');
    summary.checks.push(name); await context.close();
  }
} catch (error) { summary.problems.push(String(error)); }
finally {
  await browser?.close(); if (server.listening) await new Promise(done => server.close(done));
  await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2)); if (summary.problems.length) process.exitCode = 1;
