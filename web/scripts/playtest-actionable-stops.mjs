// #339 / P08: реальные доступные/заблокированные подписи в мобильной хронике.
// npm run build:demo && node scripts/playtest-actionable-stops.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { APP_VERSION, SAVE_VERSION, RESOURCE_KEYS } from '../lib/game/data.ts';
import { newTerm, nextCase, startFromSeed, takeOffice, programOf, signChoice, firstStep } from '../lib/client/chronicle.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { openStops, rememberStop } from '../lib/client/chronicle-stops.ts';
import { interveneWorld, stepLivingWorld } from '../lib/game/living-world.ts';
import { parseSave } from '../lib/client/save.ts';

const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/actionable-stops');
mkdirSync(out, { recursive: true });
const summary = { checks: [], problems: [] };
const browser = await chromium.launch();
const start = startFromSeed(7, 'debut');
const resources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 60]));
const candidate = await newTerm(start);
let base = takeOffice(candidate, programOf(candidate).suggested);
while (base.turn < 6) {
  base = await nextCase({ ...base, resources });
  base = await signChoice(base, base.currentEvent.choices[0].id);
}
base = await nextCase({ ...base, resources });

const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot.game, CHRONICLE_GAME_KEY);
async function fixture(game, stop = null) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => summary.problems.push(String(error)));
  const state = { ...game, analyticsRun: { id: '339'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary' } };
  const save = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state });
  const chronicle = encodeChronicle({ start, game: state, shown: [], queue: [], step: firstStep(state), picks: [],
    form: null, stop, stops: stop ? rememberStop(state, stop, {}) : {}, memory: EMPTY_PERSONAL,
    visibleResources: state.resources, page: null, rivals: null, over: false });
  assert.ok(parseSave(save), 'обычное сохранение сценария валидно');
  assert.ok(parseChronicle(chronicle), 'снимок хроники сценария валиден');
  await page.addInitScript(({ save, chronicle, key }) => {
    localStorage.setItem('sovereign.save', save);
    localStorage.setItem(key, chronicle);
  }, { save, chronicle, key: CHRONICLE_GAME_KEY });
  await page.goto(`file://${resolve('demo/dist/sovereign.html')}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('region', { name: stop ? 'Ждёт ответа' : 'Дело на столе', exact: true }).waitFor();
  await page.waitForTimeout(1800);
  return { page, context };
}
async function tap(locator) {
  await locator.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await locator.tap();
}
async function shot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.screenshot({ path: join(out, `${name}-viewport.png`) });
  summary.checks.push(name);
}
async function noEmptyProposal(game, name) {
  const { page, context } = await fixture(game);
  const waiting = page.getByRole('button', { name: /Ждут ответа ·/ });
  assert.ok(await waiting.count(), 'обязательные обращения остаются');
  await waiting.tap();
  assert.equal(await page.getByRole('button', { name: /Предложения правительства/ }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Дело на столе', exact: true }).isVisible(), true);
  await shot(page, name);
  assert.deepEqual((await savedGame(page)).resources, game.resources);
  await context.close();
}

try {
  await noEmptyProposal(interveneWorld(base, 'government:start:procurement'), 'used-quarter');
  await noEmptyProposal({ ...base, resources: { ...base.resources, economy: 6 } }, 'unaffordable');

  // Первое предложение (проверка закупок) запрещено ценой влияния, второе можно подписать.
  const low = { ...base, resources: { ...base.resources, politicalCapital: 7 } };
  const stop = openStops(low).find(entry => entry.key === 'government-proposals');
  assert.ok(stop);
  const { page, context } = await fixture(low, stop);
  const selected = page.locator('[data-government-brief="exports"]');
  await selected.waitFor();
  const action = page.locator('[data-government-action="government:start:exports"]');
  assert.equal(await action.isEnabled(), true);
  await tap(action);
  await shot(page, 'available-first');
  await tap(page.getByRole('button', { name: 'Подписать поручение', exact: true }));
  await page.waitForFunction(key => {
    const game = JSON.parse(localStorage.getItem(key)).snapshot.game;
    return game.world.lastActionTurn === game.turn;
  }, CHRONICLE_GAME_KEY);
  const signed = await savedGame(page);
  assert.equal(signed.resources.economy, low.resources.economy - 5);
  assert.equal(signed.resources.politicalCapital, low.resources.politicalCapital - 2);
  assert.equal(signed.world.government.programs.find(program => program.id === 'exports').status, 'running');
  const section = page.getByRole('region', { name: 'Ждёт ответа', exact: true });
  assert.equal(await section.getByRole('button', { name: 'Отложить', exact: true }).count(), 0);
  await shot(page, 'signed-next');
  await tap(section.getByRole('button', { name: 'Дальше', exact: true }));
  await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-government-panel]').count(), 0, 'после подписи нет второго пустого предложения');
  await context.close();

  // Влияние 15: отказ лагеря виден в окне опоры, подпись недоступна; цену никто не обнуляет.
  const crisis = structuredClone(base);
  crisis.resources.politicalCapital = 15;
  crisis.factions.find(faction => faction.bloc === 'regional').relation = -30;
  const refused = await fixture(crisis);
  await refused.page.locator('[data-res="politicalCapital"]').tap();
  const dialog = refused.page.getByRole('dialog', { name: 'Влияние', exact: true });
  await tap(dialog.locator('[data-initiative="support:regional"]'));
  assert.match(await dialog.locator('[data-initiative-note]').innerText(), /Партнёр не согласен.*−20/s);
  assert.equal(await dialog.locator('[data-sign-initiative]').isDisabled(), true);
  await dialog.locator('[data-sign-initiative]').scrollIntoViewIfNeeded();
  await shot(refused.page, 'support-refused');
  assert.deepEqual((await savedGame(refused.page)).resources, crisis.resources);
  await refused.context.close();

  // Продолжение жилья — одно собственное письмо, после подписи следующий доклад не требует ответа.
  let housing = interveneWorld(base, 'government:start:housing');
  while (housing.world.government.programs.find(program => program.id === 'housing').status === 'running') {
    const turn = housing.turn + 1;
    housing = { ...housing, turn, world: stepLivingWorld(housing, turn).world };
  }
  const housingStop = openStops(housing).find(entry => entry.key === 'housing-next');
  assert.ok(housingStop);
  const built = await fixture(housing, housingStop);
  await tap(built.page.locator('[data-government-action="government:start:settle"]'));
  await tap(built.page.getByRole('button', { name: 'Подписать поручение', exact: true }));
  await built.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).snapshot.game.world.government.housingNext.status === 'running',
    CHRONICLE_GAME_KEY);
  const running = await savedGame(built.page);
  const turn = running.turn + 1;
  const next = { ...running, turn, world: stepLivingWorld(running, turn).world };
  assert.ok(!openStops(next).some(entry => entry.key === 'housing-next'));
  await shot(built.page, 'housing-signed');
  await built.context.close();
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
if (summary.problems.length) process.exitCode = 1;
