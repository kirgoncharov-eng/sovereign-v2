// #337: прогноз, подпись и оба исхода в игре; отдельный экран проверяет расклад при узкой ширине.
// npm run build:demo && node scripts/playtest-execution-risk.mjs [--out=playtest/execution-risk]
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { APP_VERSION, RESOURCE_KEYS, SAVE_VERSION } from '../lib/game/data.ts';
import { rollSuccess } from '../lib/game/engine.ts';
import { newTerm, nextCase, firstStep, signChoice, startFromSeed } from '../lib/client/chronicle.ts';
import { choiceOutcomes } from '../lib/client/choice-outcomes.ts';
import { CHRONICLE_GAME_KEY, encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { EMPTY_PERSONAL } from '../lib/client/chronicle-personal.ts';

const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/execution-risk');
mkdirSync(out, { recursive: true });
const root = resolve('.');
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import ResolutionOutcomes from './app/game/ResolutionOutcomes.tsx';
  createRoot(document.getElementById('root')).render(React.createElement(ResolutionOutcomes, window.fixture));`,
  resolveDir: root, loader: 'jsx' }, bundle: true, write: false, outfile: 'forecast.js', jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'aliases', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => ({ path: join(root, args.path.slice(2)) }));
  } }],
});
const componentJs = bundle.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const componentCss = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const demo = readFileSync('demo/dist/sovereign.html', 'utf8');
const fontsAndStyles = demo.match(/<style>([\s\S]*?)<\/style>/)[1];
const browser = await chromium.launch();
const summary = { game: [], component: [], problems: [], integration: 'game confirmation and standalone component' };

const before = await nextCase(await newTerm(startFromSeed(7)));
function withOutcome(choice, succeeded) {
  for (let seed = 1; seed <= 1000; seed++) if (rollSuccess({ ...before, seed }, choice) === succeeded) return { ...before, seed };
  throw new Error('Нет исхода');
}
const signed = value => value === 0 ? '0' : `${value < 0 ? '−' : '+'}${Math.abs(value)}`;

try {
  for (const choice of before.currentEvent.choices) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => summary.problems.push(String(error)));
    const fixtureFile = join(out, `forecast-${choice.id}.html`);
    writeFileSync(fixtureFile, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>${fontsAndStyles}${componentCss}body{margin:0;background:#e4dcbd}#root{max-width:600px;margin:12px}</style>
      <div id="root"></div><script>window.fixture=${JSON.stringify({ game: before, choice }).replace(/</g, '\\u003c')};${componentJs}</script>`);
    await page.goto(`file://${fixtureFile}`);
    const group = page.getByRole('group', { name: 'Последствия выбранного решения' });
    await group.waitFor();
    const forecast = choiceOutcomes(before, choice);
    assert.ok((await group.innerText()).includes(forecast.reason));
    assert.deepEqual(await group.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))),
      RESOURCE_KEYS.map(key => [signed(forecast.success.resources[key]), signed(forecast.failure.resources[key])]));
    const details = group.locator('details');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await details.getAttribute('open'), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: join(out, `forecast-${choice.id}.png`), fullPage: true });
    summary.component.push(choice.id);
    await context.close();

    for (const succeeded of [true, false]) {
      const state = { ...withOutcome(choice, succeeded), analyticsRun: {
        id: '337'.repeat(8), startedAt: Date.now(), version: APP_VERSION, source: 'web', mode: 'ordinary',
      } };
      const expected = await signChoice(state, choice.id);
      const gameContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const gamePage = await gameContext.newPage();
      gamePage.on('pageerror', error => summary.problems.push(String(error)));
      const save = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state });
      const chronicle = encodeChronicle({ start: startFromSeed(7), game: state, shown: [], queue: [], step: firstStep(state), picks: [],
        form: null, stop: null, stops: {}, memory: EMPTY_PERSONAL, visibleResources: state.resources, page: null, rivals: null, over: false });
      assert.ok(parseChronicle(chronicle));
      await gamePage.addInitScript(({ save, chronicle, key }) => {
        localStorage.setItem('sovereign.save', save);
        localStorage.setItem(key, chronicle);
        localStorage.setItem('chronicle.speed', 'all');
      }, { save, chronicle, key: CHRONICLE_GAME_KEY });
      await gamePage.goto(`file://${resolve('demo/dist/sovereign.html')}`);
      await gamePage.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
      const row = gamePage.locator('button.sv-choice-row').filter({ has: gamePage.getByText(choice.text, { exact: true }) });
      await row.tap();
      const liveForecast = gamePage.getByRole('group', { name: 'Последствия выбранного решения' });
      await liveForecast.waitFor();
      assert.deepEqual(await liveForecast.locator('tbody tr').evaluateAll(rows => rows.map(row =>
        [...row.querySelectorAll('td')].map(cell => cell.textContent))),
        RESOURCE_KEYS.map(key => [signed(forecast.success.resources[key]), signed(forecast.failure.resources[key])]));
      assert.ok((await liveForecast.innerText()).includes(forecast.reason));
      await gamePage.getByRole('button', { name: /^Подписать/ }).tap();
      await gamePage.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.snapshot.game.history.length > 0, CHRONICLE_GAME_KEY);
      const actual = await gamePage.evaluate(key => JSON.parse(localStorage.getItem(key)).snapshot, CHRONICLE_GAME_KEY);
      assert.equal(actual.game.history.at(-1).success, succeeded);
      assert.deepEqual(actual.game.resources, expected.resources);
      assert.deepEqual(actual.game.factions, expected.factions);
      assert.ok([...actual.shown, ...actual.queue].some(line => line.text.includes(succeeded ? choice.scene : choice.sceneFail)), 'показана своя сцена');
      assert.ok(await gamePage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      summary.game.push(`${choice.id}/${succeeded ? 'executed' : 'failed'}`);
      await gameContext.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
assert.deepEqual(summary.problems, []);
console.log(JSON.stringify(summary, null, 2));
