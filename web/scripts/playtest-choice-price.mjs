// #317: реальный экран подтверждения подписи на телефоне. Состояния взяты из движка, без обхода обработчика подписи.
// npm run build:demo && node scripts/playtest-choice-price.mjs [--out=playtest/choice-price]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { APP_VERSION, SAVE_VERSION } from '../lib/game/data.ts';
import { newTerm, nextCase, startFromSeed, signChoice, signOption, firstStep } from '../lib/client/chronicle.ts';
import { quarterDeadline } from '../lib/client/initiative-note.ts';
import { rollSuccess } from '../lib/game/engine.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';
import { advisorOutlook } from '../lib/client/advisor-outlook.ts';
import { parseSave } from '../lib/client/save.ts';

const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/choice-price');
mkdirSync(out, { recursive: true });
const summary = { checks: [], problems: [] };
const browser = await chromium.launch();

async function openFixture(game, start) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => summary.problems.push(String(error)));
  const state = { ...game, analyticsRun: { id: '317'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary' } };
  const save = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state });
  const chronicle = encodeChronicle({ start, game: state, shown: [], queue: [], step: firstStep(state), picks: [],
    form: null, stop: null, stops: {}, memory: EMPTY_PERSONAL, visibleResources: state.resources, page: null, rivals: null, over: false });
  assert.ok(parseSave(save), 'обычное сохранение сценария валидно');
  assert.ok(parseChronicle(chronicle), 'снимок хроники сценария валиден');
  await page.addInitScript(({ save, chronicle, key }) => {
    if (sessionStorage.getItem('choice-price-fixture-loaded')) return;
    localStorage.setItem('sovereign.save', save);
    localStorage.setItem(key, chronicle);
    sessionStorage.setItem('choice-price-fixture-loaded', '1');
  }, { save, chronicle, key: CHRONICLE_GAME_KEY });
  await page.goto(`file://${resolve('demo/dist/sovereign.html')}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('heading', { name: game.currentEvent.title, exact: true }).waitFor();
  return { page, context, state };
}

const savedGame = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot.game, CHRONICLE_GAME_KEY);

async function checkPrice(page, state, choice, name, { select = true } = {}) {
  const row = page.locator('button.sv-choice-row').filter({ has: page.getByText(choice.text, { exact: true }) });
  if (select) { await row.scrollIntoViewIfNeeded(); await row.tap(); }
  const price = page.getByRole('group', { name: 'Последствия выбранного решения' });
  await price.waitFor();
  assert.equal(await price.getAttribute('data-choice-id'), choice.id);
  const shown = await price.innerText(), expected = advisorOutlook(state, choice);
  assert.equal(await price.locator('table').count(), 0, 'таблицы больше нет');
  assert.ok(shown.includes(expected.risk.text));
  for (const estimate of Object.values(expected.success.resources))
    if (estimate.value) assert.ok(shown.includes(estimate.text));
  if (expected.failure) assert.ok(shown.includes(expected.failureOmitted ? 'не обсуждали' : 'Срыв'));
  for (const effect of expected.later) {
    assert.ok(shown.includes(quarterDeadline(state, effect.due)));
    assert.ok(shown.includes(effect.label));
    for (const estimate of Object.values(effect.resources)) assert.ok(shown.includes(estimate.text));
    assert.ok(shown.includes(effect.onFailure ? 'Сохраняется при срыве.' : 'При исполнении.'));
  }
  const sign = price.getByRole('button', { name: 'Подписать', exact: true });
  assert.ok(await sign.isEnabled());
  await sign.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  summary.checks.push(name);
  return { sign, price, row };
}

try {
  const start = startFromSeed(7, 'debut');
  let state = await newTerm(start);
  for (let turn = 0; turn < 4; turn++) {
    state = await nextCase(state);
    if (turn < 3) {
      const fixture = await openFixture(state, start);
      const row = fixture.page.locator('button.sv-choice-row').first();
      const text = await row.innerText();
      const choices = [...state.currentEvent.choices, ...(state.currentEvent.council ?? [])];
      const choice = choices.find(choice => text.includes(choice.text));
      assert.ok(choice, 'видимый вариант принадлежит текущему делу');
      await checkPrice(fixture.page, fixture.state, choice, `decision-${turn + 1}`);
      await row.tap();
      assert.equal(await fixture.page.getByRole('group', { name: 'Последствия выбранного решения' }).count(), 0);
      await fixture.context.close();
      state = await signOption(state, firstStep(state).options[0].key);
    }
  }

  // Переключение между резолюциями сохраняет выбранный документ без отдельного сбора совета.
  const fixture = await openFixture(state, start), page = fixture.page;
  await checkPrice(page, fixture.state, state.currentEvent.choices[0], 'ordinary-first');
  const selected = state.currentEvent.choices[1];
  const { sign } = await checkPrice(page, fixture.state, selected, 'ordinary-second');
  await sign.tap();
  await page.waitForFunction(({ key, turn }) => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > turn,
    { key: CHRONICLE_GAME_KEY, turn: state.turn });
  const signed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot, CHRONICLE_GAME_KEY);
  const signature = [...signed.shown, ...signed.queue].find(line => line.kind === 'signed');
  assert.equal(signature?.text, selected.text, 'подписан именно вариант с показанной ценой');
  await fixture.context.close();

  // Старое сохранение 1978 года: в совете уже лежит отдельное предложение с автором. Новые кампании их не создают.
  const advisorChoice = { ...state.currentEvent.choices[0], id: 'saved-advisor',
    text: 'Выделить резерв на районную закупку зерна', advisor: state.advisors[0] };
  const savedCouncil = { ...state, currentEvent: { ...state.currentEvent, council: [advisorChoice] } };
  const advisorFixture = await openFixture(savedCouncil, start);
  await checkPrice(advisorFixture.page, advisorFixture.state, advisorChoice, 'saved-advisor');
  await advisorFixture.context.close();

  // Все три заводские резолюции: настоящая подпись, оба исхода, фактический отчёт.
  const factory = await nextCase(await newTerm(startFromSeed(7)));
  for (const choice of factory.currentEvent.choices) for (const success of [true, false]) {
    let scenario;
    for (let seed = 1; seed <= 1000; seed++) if (rollSuccess({ ...factory, seed }, choice) === success) {
      scenario = { ...factory, seed }; break;
    }
    assert.ok(scenario);
    const live = await openFixture(scenario, startFromSeed(scenario.seed));
    const expected = await signChoice(scenario, choice.id);
    const { sign } = await checkPrice(live.page, live.state, choice, `factory-${choice.id}-${success}`);
    await sign.tap();
    await live.page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > 0, CHRONICLE_GAME_KEY);
    const actual = await savedGame(live.page);
    assert.equal(actual.history.at(-1).success, success);
    assert.deepEqual(actual.resources, expected.resources);
    assert.deepEqual(actual.factions, expected.factions);
    assert.deepEqual(actual.advisors, expected.advisors, 'проверенный доклад попал в досье, даже если хроника уже открыла следующее дело');
    await live.context.close();
  }

  // Настоящие партии: эфир (польза / неотменяемый вред) и конкурс (два будущих изменения).
  // Подбираем оба исхода обычной генерацией; seed, history и варианты готового сохранения не подменяются.
  const targets = [
    { key: 'radio-benefit', text: 'Проверить магазин до следующего выпуска' },
    { key: 'radio-cost', text: 'Потребовать согласовывать подобные передачи' },
    { key: 'two-effects', text: 'Отдать контракт конкурсу заводов без гарантии казны' },
  ];
  const cases = new Map();
  for (let seed = 1; seed <= 80 && cases.size < targets.length * 2; seed++) {
    const route = startFromSeed(seed);
    let game = await newTerm(route);
    for (let turn = 0; turn < 6 && !game.ended; turn++) {
      game = await nextCase(game);
      for (const target of targets) {
        const choice = game.currentEvent.choices.find(option => option.text === target.text);
        if (!choice) continue;
        const succeeded = rollSuccess(game, choice), key = `${target.key}-${succeeded ? 'executed' : 'failed'}`;
        if (!cases.has(key)) cases.set(key, { start: route, game, choice });
      }
      game = await signChoice(game, game.currentEvent.choices[0].id);
    }
  }
  assert.equal(cases.size, targets.length * 2, 'найдены реальные партии со всеми нужными исходами');
  for (const [name, scenario] of cases) {
    const live = await openFixture(scenario.game, scenario.start);
    const { sign } = await checkPrice(live.page, live.state, scenario.choice, name);
    const expected = await signChoice(live.state, scenario.choice.id);
    await sign.tap();
    await live.page.waitForFunction(({ key, turn }) => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > turn,
      { key: CHRONICLE_GAME_KEY, turn: live.state.turn });
    const actual = await savedGame(live.page);
    assert.deepEqual(actual.pending, expected.pending, 'очередь после настоящей подписи соответствует прогнозу');
    assert.deepEqual(actual.resources, expected.resources);
    assert.equal(actual.history.at(-1).success, rollSuccess(live.state, scenario.choice));
    await live.page.reload();
    await live.page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
    const restored = await savedGame(live.page);
    assert.equal(restored.turn, expected.turn, 'reload возвращает подписанный квартал, а не исходную фикстуру');
    assert.deepEqual(restored.pending, expected.pending, 'обязательства сохраняются после reload');
    await live.context.close();
  }

  const crisisStart = startFromSeed(7, 'crisis'), crisis = await nextCase(await newTerm(crisisStart));
  const crisisFixture = await openFixture(crisis, crisisStart);
  await checkPrice(crisisFixture.page, crisisFixture.state, crisis.currentEvent.choices[0], 'crisis');
  await crisisFixture.context.close();
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify({ checks: summary.checks.length, problems: summary.problems }, null, 2));
if (summary.problems.length) process.exitCode = 1;
