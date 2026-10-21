// Regression on a valid synthetic 1978 save with both projects unlocked.
// npm run build:demo && node scripts/playtest-projects.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { classicApi } from '../lib/game/classic.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from '../lib/game/engine.ts';
import { ALTERNATE_COUNTRY } from '../lib/game/alternate-world.ts';
import { ALTERNATE_EVENTS } from '../lib/content/alternate-history.ts';
import { openLivingWorld } from '../lib/game/living-world.ts';
import { parseSave } from '../lib/client/save.ts';
import { SAVE_VERSION } from '../lib/game/data.ts';

async function navigationFixture(seed, difficulty) {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, difficulty, 'pragmatist', seed);
  let state = createInitialState(ALTERNATE_COUNTRY, difficulty, 'pragmatist', intro, seededRandom(seed));
  state = startEvent(state, await classicApi.event(state));
  const choice = state.currentEvent.choices[0].id;
  state = resolveTurn(state, choice, await classicApi.consequence(state, choice));
  // Unlock both existing programmes without replaying the whole campaign for each viewport.
  // This fixture is for navigation; it does not prove the campaign's chronology or balance.
  const firstEntry = state.history[0];
  const signedCases = ['alt_fuel', 'alt_district'].map(card => ({
    ...firstEntry,
    title: ALTERNATE_EVENTS.find(item => item.id === card).title,
  }));
  state = openLivingWorld({ ...state, turn: 13, history: [...state.history, ...signedCases] });
  assert.ok(state.world?.health, 'both programmes must be available');
  const save = { version: SAVE_VERSION, screen: 'game', state };
  assert.ok(parseSave(JSON.stringify(save)), 'fixture must be accepted by the real save parser');
  return save;
}

const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = resolve(arg('out', 'playtest-projects'));
const seed = Number(arg('seed', '15'));
const difficulty = arg('difficulty', 'debut');
mkdirSync(output, { recursive: true });
const fixture = await navigationFixture(seed, difficulty);
const browser = await chromium.launch();
const results = [];

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 900 : 844 },
      hasTouch: width === 390,
      isMobile: width === 390,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      localStorage.setItem('sovereign.save', JSON.stringify(save));
      localStorage.setItem('sovereign.tutorial.seen', '1');
    }, fixture);
    await page.goto(new URL('../demo/dist/sovereign.html', import.meta.url).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'ПРОДОЛЖИТЬ СРОК', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
    const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
    const before = await readState();
    assert.ok(before.lastTurn, 'start on the result screen');

    async function openProjects() {
      if (width === 390) await page.locator('.sv-sheet-tab-country').click();
      await page.locator('.sv-fold-link').filter({ hasText: 'Поручения и доклады' }).click();
      await page.locator('[data-world-panel]').waitFor();
    }

    await openProjects();
    await page.locator('[data-project-action="health"]').click();
    const healthTab = page.locator('[data-health-panel] [role="tab"][aria-selected="true"]');
    assert.equal(await healthTab.innerText(), 'Поручения');
    await page.locator('[data-health-panel] .sv-country-action:enabled').first().click();
    assert.equal(await page.locator('.sv-country-confirm').count(), 1);
    assert.deepEqual((await readState()).resources, before.resources, 'selection alone must not spend resources');
    await page.locator('[data-project-report="region"]').click();
    assert.equal(await page.locator('.sv-country-confirm').count(), 0, 'switching projects clears unsigned selection');
    assert.equal(await page.locator('[data-health-panel]').count(), 0, 'energy report must open energy');
    await page.locator('[data-project-action="region"]').click();
    await page.locator('.sv-country-action:enabled').first().click();
    await page.getByRole('button', { name: 'Отложить', exact: true }).click();
    assert.equal(await page.locator('.sv-country-confirm').count(), 0);
    await page.locator('[data-project-action="health"]').click();
    await page.locator('[data-health-panel] .sv-country-action:enabled').first().click();
    await page.getByRole('button', { name: 'Подписать поручение', exact: true }).click();
    const signed = await readState();
    assert.equal(signed.turn, before.turn, 'signature must not advance the quarter');
    assert.equal(signed.world.lastActionTurn, before.turn);
    await page.locator('[data-project-action="region"]').click();
    assert.equal(await page.locator('.sv-country-action').count(), 0, 'shared quota prevents a second appointment');
    assert.match(await page.locator('[data-world-panel]').innerText(), /уже подписано/);
    await page.locator('[data-world-panel]').screenshot({ path: `${output}/${width}-projects.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal overflow');
    await page.locator('[data-project-return]').click();
    assert.equal(await page.locator('[data-world-panel]').count(), 0);
    const returned = await readState();
    assert.equal(returned.turn, before.turn);
    assert.deepEqual(returned.lastTurn, signed.lastTurn, 'return preserves the result, including the signed appointment cost');
    assert.equal(returned.currentEvent, null, 'return must not open the next case');
    await openProjects();
    await page.locator('[data-project-report="health"]').click();
    await page.locator('[data-project-return]').click();
    await openProjects();
    assert.equal(await page.locator('[data-health-panel]').count(), 1, 'reopening preserves the selected programme');
    await page.locator('[data-world-panel]').screenshot({ path: `${output}/${width}-health.png` });
    // A separate, explicitly named control still opens the next case.
    await page.locator('[data-world-panel]').getByRole('button', { name: 'Следующий ход →', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.currentEvent !== null);
    assert.equal((await readState()).lastTurn, null);
    assert.deepEqual(errors, []);
    results.push({ width, seed, difficulty, selectedProject: true, sharedQuota: true, returnPreservesResult: true, errors });
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${output}/summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
