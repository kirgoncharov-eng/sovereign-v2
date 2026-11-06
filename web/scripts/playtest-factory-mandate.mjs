// #359: настоящая подпись, контрольный расчёт и чтение карточки на телефоне/компьютере.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { APP_VERSION, SAVE_VERSION } from '../lib/game/data.ts';
import { rollSuccess } from '../lib/game/engine.ts';
import { newTerm, nextCase, firstStep, signChoice, startFromSeed } from '../lib/client/chronicle.ts';
import { factoryMandateBrief } from '../lib/client/factory-mandate.ts';
import { encodeChronicle, parseChronicle, CHRONICLE_GAME_KEY } from '../lib/client/chronicle-save.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';
import { parseSave } from '../lib/client/save.ts';

const root = resolve('.');
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/factory-mandate');
mkdirSync(out, { recursive: true });
const html = readFileSync('demo/dist/sovereign.html', 'utf8');
const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const component = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import GovernmentPanel from './app/game/GovernmentPanel.jsx';
  createRoot(document.getElementById('root')).render(<GovernmentPanel gs={window.fixture}
    onAction={id=>window.writes.push(id)} onClose={()=>{}} onDetails={()=>{}}/>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, outfile: 'government.js', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ANALYTICS': '"off"',
    'process.env.NEXT_PUBLIC_SHARE_URL': '""', 'process.env.NEXT_PUBLIC_BOT_USERNAME': '""' },
  plugins: [{ name: 'aliases', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => ({ path: join(root, args.path.slice(2)) }));
  } }],
});
const js = component.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = component.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const browser = await chromium.launch();
const summary = { signatures: [], cards: [], problems: [] };
const cards = [];

async function nativeCase(route, success) {
  for (let seed = 1; seed <= 100; seed++) {
    const state = await nextCase(await newTerm(startFromSeed(seed)));
    if (rollSuccess(state, state.currentEvent.choices[route]) === success) return state;
  }
  throw new Error('Не найден исход');
}

async function signInBrowser(game, choice, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => summary.problems.push(String(error)));
  const state = { ...game, analyticsRun: { id: '359'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary' } };
  const expected = await signChoice(state, choice.id);
  const save = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state });
  const chronicle = encodeChronicle({ start: startFromSeed(state.seed), game: state, shown: [], queue: [],
    step: firstStep(state), picks: [], form: null, stop: null, stops: {}, memory: EMPTY_PERSONAL,
    visibleResources: state.resources, page: null, rivals: null, over: false });
  assert.ok(parseSave(save) && parseChronicle(chronicle));
  await page.addInitScript(({ save, chronicle, key }) => {
    if (sessionStorage.getItem('factory-fixture')) return;
    localStorage.setItem('sovereign.save', save);
    localStorage.setItem(key, chronicle);
    localStorage.setItem('chronicle.speed', 'all');
    sessionStorage.setItem('factory-fixture', '1');
  }, { save, chronicle, key: CHRONICLE_GAME_KEY });
  await page.goto(`file://${resolve('demo/dist/sovereign.html')}`);
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  const row = page.locator('button.sv-choice-row').filter({ has: page.getByText(choice.text, { exact: true }) });
  await row.tap();
  await page.getByRole('button', { name: /^Подписать/ }).tap();
  await page.waitForFunction(({ key, turn }) => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > turn,
    { key: CHRONICLE_GAME_KEY, turn: state.turn });
  const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot, CHRONICLE_GAME_KEY);
  const signed = await read();
  assert.deepEqual(signed.game.resources, expected.resources);
  assert.deepEqual(signed.game.pending, expected.pending);
  assert.deepEqual(signed.game.history, expected.history);
  const reports = [...signed.shown, ...signed.queue].filter(line => line.kind === 'report' && line.who?.startsWith('Контроль заводской подписи'));
  assert.equal(reports.length, 1, 'настоящая подпись создаёт ровно один доклад в хронике');
  assert.ok(reports[0].text.includes('Координация при подписи:'));
  assert.ok(!await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  const loaded = await read();
  assert.deepEqual(loaded.game.resources, expected.resources);
  assert.deepEqual(loaded.game.history, expected.history, 'reload сохраняет имена и контрольный расчёт');
  assert.deepEqual(loaded.game.pending, expected.pending);
  summary.signatures.push({ name, turn: expected.turn, status: factoryMandateBrief(expected).status });
  await context.close();
  return expected;
}

try {
  for (const route of [0, 1, 2]) for (const success of [true, false]) {
    const initial = await nativeCase(route, success), choice = initial.currentEvent.choices[route];
    let game = await signInBrowser(initial, choice, `signature-${route}-${success}`);
    if (success && route > 0) {
      const due = game.history[0].factoryMandate.followUp.due;
      while (game.turn < due - 1 && !game.ended) {
        game = await nextCase(game);
        game = await signChoice(game, game.currentEvent.choices[0].id);
      }
      assert.equal(game.turn, due - 1);
      game = await nextCase(game);
      game = await signInBrowser(game, game.currentEvent.choices[0], `settlement-${route}`);
      assert.ok(game.history[0].factoryMandate.settled);
    }
    // Кабинет открывается после топливного дела. Дожидаемся настоящего открытия, не обходим ввод механики.
    while (!game.world?.government && !game.ended && game.turn < 8) {
      game = await nextCase(game);
      game = await signChoice(game, game.currentEvent.choices[0].id);
    }
    assert.ok(game.world?.government, 'карточка проверяется в доступном по правилам кабинете');
    cards.push({ name: `route-${route}-${success}`, game });
  }
  for (const width of [320, 390, 1440]) for (const fixture of cards) {
    const file = join(out, `${fixture.name}-${width}.html`);
    const before = JSON.stringify(fixture.game);
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>${styles}${css}body{margin:0;background:#e4dcbd;color:#2b291c}#root{max-width:600px;margin:12px}</style>
      <div id="root" class="sv-paper"></div><script>window.fixture=${before.replace(/</g, '\\u003c')};window.writes=[];${js}</script>`);
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => summary.problems.push(String(error)));
    await page.goto(`file://${file}`);
    const card = page.locator('[data-factory-mandate]');
    await card.waitFor();
    assert.equal(await card.getAttribute('open'), null);
    await card.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await card.getAttribute('open'), null);
    const text = await card.innerText(), brief = factoryMandateBrief(fixture.game);
    for (const line of brief.lines) assert.ok(text.includes(line));
    assert.equal(await page.evaluate(() => JSON.stringify(window.fixture)), before);
    assert.deepEqual(await page.evaluate(() => window.writes), [], 'чтение не вызывает новое поручение');
    assert.ok(!await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
    await page.screenshot({ path: join(out, `${fixture.name}-${width}.png`), fullPage: true });
    summary.cards.push({ name: fixture.name, width, status: brief.status });
    await context.close();
  }
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
assert.deepEqual(summary.problems, []);
