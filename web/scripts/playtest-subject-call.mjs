// #310, P05: предметный звонок хода 16 на телефоне — «Хроника срока» и `/game`.
// Состояние звонка собирается движком; подпись идёт через настоящий обработчик интерфейса.
// npm run build:demo && node scripts/playtest-subject-call.mjs [--out=playtest/subject-call]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { launchChromium } from './browser.mjs';
import { APP_VERSION, SAVE_VERSION } from '../lib/game/data.ts';
import { callEvent } from '../lib/game/classic.ts';
import { startEvent } from '../lib/game/engine.ts';
import { newTerm, startFromSeed, firstStep } from '../lib/client/chronicle.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';
import { parseSave } from '../lib/client/save.ts';
import { TRAIT_TIP } from '../lib/content/calls.ts';

const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/subject-call');
mkdirSync(out, { recursive: true });
const summary = { checks: [], problems: [] };

// Звонок хода 16 от выбранного лагеря: остальные собеседники уже звонили или довольны.
async function callState(bloc) {
  const start = startFromSeed(7, 'debut');
  const base = await newTerm(start);
  const faction = base.factions.find(group => group.bloc === bloc);
  const caller = base.keyFigures.find(figure => figure.faction === faction.id);
  const state = { ...base, turn: 16, arc: null, currentEvent: null,
    analyticsRun: { id: '310'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary' },
    usedEvents: [...(base.usedEvents ?? []), ...base.keyFigures.filter(f => f.id !== caller.id).map(f => `call:11:${f.id}`)] };
  const event = callEvent(state);
  assert.equal(event?.call?.negotiation, 'subject', `${bloc}: предметный звонок`);
  const active = startEvent(state, { ...event, card: event.cardId });
  return { start, state: active, caller };
}

const html = readFileSync(new URL('../demo/dist/sovereign.html', import.meta.url));
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;
// CHROMIUM_PATH — для среды, где закреплённый Playwright не нашёл свой браузер.
const browser = await launchChromium();

async function open(screen, game, start) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
    hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => summary.problems.push(`${screen}: ${error}`));
  const save = JSON.stringify({ version: SAVE_VERSION, screen, state: game });
  assert.ok(parseSave(save), 'сохранение сценария валидно');
  const chronicle = screen === 'chronicle' ? encodeChronicle({ start, game, shown: [], queue: [], step: firstStep(game), picks: [],
    form: null, stop: null, stops: {}, memory: EMPTY_PERSONAL, visibleResources: game.resources, page: null, rivals: null, over: false }) : null;
  if (chronicle) assert.ok(parseChronicle(chronicle), 'снимок хроники валиден');
  await page.addInitScript(({ save, chronicle, key }) => {
    if (!localStorage.getItem('sovereign.save')) localStorage.setItem('sovereign.save', save);
    if (chronicle && !localStorage.getItem(key)) localStorage.setItem(key, chronicle);
    localStorage.setItem('sovereign.tutorial.seen', '1');
  }, { save, chronicle, key: CHRONICLE_GAME_KEY });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).first().tap();
  const proceed = page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true });
  if (await proceed.count()) await proceed.tap();
  return { page, context };
}

async function reachCall(page, screen) {
  if (screen === 'game') {
    const main = page.locator('[data-quarter-document="main"]');
    await main.or(page.locator('[data-negotiation-call]')).first().waitFor();
    if (await main.count()) await main.tap();
  }
  await page.locator('[data-negotiation-call]').waitFor();
}

const savedTurn = (page, screen) => page.evaluate(({ screen, key }) => screen === 'chronicle'
  ? JSON.parse(localStorage.getItem(key)).snapshot.game.turn
  : JSON.parse(localStorage.getItem('sovereign.save')).state.turn, { screen, key: CHRONICLE_GAME_KEY });

try {
  for (const bloc of ['liberal', 'business']) {
    const { start, state, caller } = await callState(bloc);
    for (const screen of ['chronicle', 'game']) {
      const name = `${screen}-${bloc}`;
      const { page, context } = await open(screen, state, start);
      await reachCall(page, screen);
      const panel = page.locator('[data-negotiation-call]');
      const text = await panel.innerText();
      assert.ok(text.includes(state.currentEvent.call.demand.slice(1, 40)), `${name}: требование видно`);
      assert.ok(text.includes(state.currentEvent.call.context.slice(0, 40)), `${name}: голос собеседника виден`);
      assert.ok(!/Закон уже действует/.test(text), `${name}: нет чужой подписи про закон`);
      const pageText = await page.locator('body').innerText();
      assert.ok(!pageText.includes(TRAIT_TIP[state.currentEvent.call.trait]), `${name}: подсказка характера не намекает на исход`);
      const buttons = panel.locator('[data-negotiation-choice]');
      assert.equal(await buttons.count(), 5, `${name}: пять вариантов`);
      await page.screenshot({ path: join(out, `${name}-1-options.png`), fullPage: true });
      // Цена видна до подписи; выбор не списывает опоры.
      const choice = state.currentEvent.choices[1];
      await panel.locator(`[data-negotiation-choice="${choice.id}"]`).tap();
      const confirm = panel.locator('[data-negotiation-confirm]');
      await confirm.waitFor();
      const shown = await confirm.innerText();
      assert.ok(shown.includes(choice.hint.split('. ')[0]), `${name}: цена в подтверждении`);
      assert.equal(await savedTurn(page, screen), state.turn, `${name}: выбор до подписи не закрывает квартал`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.ok(!wide, `${name}: без горизонтальной прокрутки`);
      await confirm.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(out, `${name}-2-confirm.png`), fullPage: true });
      // Перезагрузка до подписи сохраняет звонок.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).first().tap();
      const proceed = page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true });
      if (await proceed.count()) await proceed.tap();
      await reachCall(page, screen);
      await page.locator(`[data-negotiation-choice="${choice.id}"]`).tap();
      await page.locator('[data-negotiation-confirm]').getByRole('button', { name: 'Подтвердить решение' }).tap();
      // В `/game` решение ложится в папку квартала; квартал закрывает отдельная кнопка.
      if (screen === 'game') {
        const finish = page.locator('[data-finish-quarter]');
        await finish.waitFor({ timeout: 10000 });
        await page.screenshot({ path: join(out, `${name}-2b-quarter.png`), fullPage: true });
        await finish.tap();
      }
      await page.waitForFunction(({ screen, key, turn }) => {
        const saved = screen === 'chronicle' ? JSON.parse(localStorage.getItem(key))?.snapshot?.game : JSON.parse(localStorage.getItem('sovereign.save'))?.state;
        return saved && saved.turn > turn;
      }, { screen, key: CHRONICLE_GAME_KEY, turn: state.turn }, { timeout: 15000 });
      const after = await page.evaluate(({ screen, key }) => screen === 'chronicle'
        ? JSON.parse(localStorage.getItem(key)).snapshot.game : JSON.parse(localStorage.getItem('sovereign.save')).state,
      { screen, key: CHRONICLE_GAME_KEY });
      const signed = after.history.at(-1);
      assert.equal(signed.choice, choice.text, `${name}: подписан выбранный вариант`);
      assert.equal(signed.headline, choice.headline, `${name}: газета пишет о принятом варианте`);
      assert.ok(after.pending.some(entry => entry.label === choice.deal.later.label), `${name}: доклад запланирован`);
      await page.screenshot({ path: join(out, `${name}-3-signed.png`), fullPage: true });
      summary.checks.push({ name, caller: caller.name, choice: choice.text });
      await context.close();
    }
  }
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  await browser.close();
  server.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify({ checks: summary.checks.length, problems: summary.problems }, null, 2));
if (summary.problems.length) process.exitCode = 1;
