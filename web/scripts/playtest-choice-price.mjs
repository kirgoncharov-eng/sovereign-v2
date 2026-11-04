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
import { choiceOutcomes } from '../lib/client/choice-outcomes.ts';
import { RESOURCE_KEYS } from '../lib/game/data.ts';
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
  await page.waitForTimeout(1800);
  if (select) {
    const row = page.locator('button.sv-choice-row').filter({ has: page.getByText(choice.text, { exact: true }) });
    if (!choice.deal?.pure) {
      const label = await row.innerText();
      assert.match(label, choice.advisor ? /шанс исполнения \d+%/ : /риск срыва/,
        'риск обозначает исполнение, а не политическую цену');
    }
    await row.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await row.tap();
  }
  const price = page.getByRole('group', { name: 'Последствия выбранного решения' });
  await price.waitFor();
  assert.equal(await price.getAttribute('data-choice-id'), choice.id);
  const shown = await price.innerText(), expected = choiceOutcomes(state, choice);
  const signed = value => value === 0 ? '0' : `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
  const cells = await price.locator('tbody tr').evaluateAll(rows => rows.map(row =>
    [...row.querySelectorAll('td')].map(cell => cell.textContent)));
  assert.deepEqual(cells, RESOURCE_KEYS.map(key => [signed(expected.success.resources[key] ?? 0),
    ...(expected.failure ? [signed(expected.failure.resources[key] ?? 0)] : [])]));
  if (expected.reason && expected.failure) assert.ok(shown.includes(expected.reason));
  assert.ok(shown.includes(`Риск срыва исполнения: ${expected.failurePercent}%.`));
  const future = price.getByRole('group', { name: 'Будущие последствия резолюции' });
  assert.equal(await future.count(), expected.later.length ? 1 : 0);
  for (const effect of expected.later) {
    const line = future.locator('p').filter({ hasText: `«${effect.label}»` });
    const text = await line.innerText();
    assert.ok(text.includes(quarterDeadline(state, effect.due)), 'срок совпадает с очередью движка');
    for (const delta of Object.values(effect.res)) assert.ok(text.includes(signed(delta)));
    if (expected.failure) assert.ok(text.includes(effect.onFailure
      ? 'Сохраняется и при срыве исполнения.' : 'Только если резолюцию исполнят.'));
    assert.equal(await line.isVisible(), true, 'будущая цена не скрыта в совете или раскрывающемся блоке');
  }
  const sign = page.getByRole('button', { name: /^Подписать/ });
  await sign.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await price.scrollIntoViewIfNeeded();
  await price.evaluate(element => {
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    let parent = element.parentElement;
    while (parent && !(/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight)) {
      parent = parent.parentElement;
    }
    const scroller = parent ?? document.scrollingElement;
    scroller.scrollTo({ top: scroller.scrollTop + element.getBoundingClientRect().top - header - 12, behavior: 'instant' });
  });
  const geometry = await price.evaluate(element => {
    const box = element.getBoundingClientRect(), header = document.querySelector('header')?.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, header: header?.bottom ?? 0, height: innerHeight,
      wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  assert.ok(!geometry.wide && geometry.top >= geometry.header, JSON.stringify(geometry));
  const table = await price.locator('table').boundingBox();
  assert.ok(table && table.y >= geometry.header && table.y + table.height <= geometry.height, 'обе колонки таблицы читаются под шапкой');
  await sign.scrollIntoViewIfNeeded();
  const signBox = await sign.boundingBox();
  assert.ok(signBox && signBox.y >= geometry.header && signBox.y + signBox.height <= geometry.height, 'подпись доступна после чтения');
  const after = await savedGame(page);
  assert.deepEqual(after.resources, state.resources, 'выбор до подписи не списывает опоры');
  assert.equal(after.turn, state.turn);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  if (expected.later.length) await price.screenshot({ path: join(out, `${name}-forecast.png`) });
  summary.checks.push({ name, choice: choice.id, price: shown, geometry });
  return { price, sign };
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
      await fixture.page.getByRole('button', { name: 'Отменить выбор' }).tap();
      assert.equal(await fixture.page.getByRole('group', { name: 'Последствия выбранного решения' }).count(), 0);
      await fixture.context.close();
      state = await signOption(state, firstStep(state).options[0].key);
    }
  }

  // Четвёртое дело позволяет собрать обычный совет. Выбранный второй вариант должен остаться выбранным.
  const fixture = await openFixture(state, start), page = fixture.page;
  await checkPrice(page, fixture.state, state.currentEvent.choices[0], 'ordinary-first');
  const selected = state.currentEvent.choices[1];
  await checkPrice(page, fixture.state, selected, 'ordinary-second');
  await page.getByRole('button', { name: /^(Собрать совет|Обсудить подпись)$/ }).tap();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).snapshot.game.currentEvent.council?.length > 0, CHRONICLE_GAME_KEY);
  const afterCouncil = await savedGame(page);
  assert.equal(await page.getByRole('group', { name: 'Последствия выбранного решения' }).getAttribute('data-choice-id'), selected.id);
  await checkPrice(page, afterCouncil, selected, 'after-council', { select: false });
  const proposal = afterCouncil.currentEvent.council[0];
  const { sign } = await checkPrice(page, afterCouncil, proposal, 'council-choice');
  await sign.tap();
  await page.waitForFunction(({ key, turn }) => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > turn,
    { key: CHRONICLE_GAME_KEY, turn: state.turn });
  const signed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot, CHRONICLE_GAME_KEY);
  const signature = [...signed.shown, ...signed.queue].find(line => line.kind === 'signed');
  assert.equal(signature?.text, proposal.text, 'подписан именно вариант с показанной ценой');
  await fixture.context.close();

  // Старое сохранение 1978 года: в совете уже лежит отдельное предложение с автором. Новые кампании их не создают.
  const advisorChoice = { ...state.currentEvent.choices[0], id: 'saved-advisor',
    text: 'Выделить резерв на районную закупку зерна', advisor: state.advisors[0] };
  const savedCouncil = { ...state, currentEvent: { ...state.currentEvent, council: [advisorChoice] } };
  const advisorFixture = await openFixture(savedCouncil, start);
  await checkPrice(advisorFixture.page, advisorFixture.state, advisorChoice, 'saved-advisor');
  await advisorFixture.context.close();

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
