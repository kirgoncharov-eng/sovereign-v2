// Controlled navigation fixture: real state/parser, both programmes unlocked explicitly.
// npm run build:demo && node scripts/playtest-projects.mjs [--seed=15] [--difficulty=debut]
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
const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const output = resolve(arg('out', 'playtest-projects'));
const seed = Number(arg('seed', '15'));
const difficulty = arg('difficulty', 'debut');
mkdirSync(output, { recursive:true });
const intro = await classicApi.setup(ALTERNATE_COUNTRY, difficulty, 'pragmatist', seed);
let state = createInitialState(ALTERNATE_COUNTRY, difficulty, 'pragmatist', intro, seededRandom(seed));
state = startEvent(state, await classicApi.event(state));
const opening = state.currentEvent;
state = resolveTurn(state, opening.choices[0].id, await classicApi.consequence(state, opening.choices[0].id));
const first = state.history[0];
const unlocks = ['alt_fuel', 'alt_district'].map(id => ({ ...first, title:ALTERNATE_EVENTS.find(item => item.id === id).title }));
state = openLivingWorld({ ...state, turn:13, lastTurn:null, history:[...state.history, ...unlocks] });
state = startEvent(state, opening);
assert.ok(state.world?.health);
const fixture = { version:SAVE_VERSION, screen:'game', state };
assert.ok(parseSave(JSON.stringify(fixture)));
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport:{ width, height:900 }, hasTouch:width < 760, isMobile:width < 760,
      reducedMotion:'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(save => {
      if (!localStorage.getItem('sovereign.save')) localStorage.setItem('sovereign.save', JSON.stringify(save));
      localStorage.setItem('sovereign.tutorial.seen', '1');
    }, fixture);
    const resume = async () => {
      await page.getByRole('button', { name:'Продолжить сохранённую игру', exact:true }).click();
      await page.getByRole('dialog').getByRole('button', { name:'ПРОДОЛЖИТЬ', exact:true }).click();
    };
    await page.goto(new URL('../demo/dist/sovereign.html', import.meta.url).href, { waitUntil:'domcontentloaded' });
    await resume();
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
    // #279: на телефоне папка тоже список карточек, а не выпадающий список.
    const open = async key => page.locator(`[data-quarter-document="${key}"]`).click();
    const finish = page.locator('[data-finish-quarter]');
    assert.equal(await finish.count(), 0, 'Quarter close stays hidden before preparation');
    await open('main');
    await page.locator('#opt-1').click();
    await page.locator('.sv-quarter-prepare button').first().click();
    assert.equal((await read()).turn, state.turn);
    assert.deepEqual((await read()).resources, state.resources);
    assert.ok((await read()).quarterDraft);
    assert.equal(await finish.isDisabled(), false);
    await open('health');
    assert.equal(await page.locator('[data-incoming-project="health"]').count(), 1);
    await page.locator('.sv-country-action:enabled').first().click();
    assert.deepEqual((await read()).resources, state.resources);
    await page.getByRole('button', { name:'Отложить', exact:true }).click();
    await page.locator('.sv-country-action:enabled').first().click();
    await page.getByRole('button', { name:'Подписать поручение', exact:true }).click();
    const signed = await read();
    assert.equal(signed.turn, state.turn);
    assert.equal(signed.world.lastActionTurn, state.turn);
    assert.notDeepEqual(signed.resources, state.resources);
    assert.ok(signed.quarterDraft);
    await open('energy');
    assert.equal(await page.locator('.sv-country-action').count(), 0);
    assert.match(await page.locator('[data-incoming-project]').innerText(), /уже подписано/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path:`${output}/${width}-folder.png`, fullPage:true });
    await page.reload({ waitUntil:'domcontentloaded' });
    await resume();
    const restored = await read();
    assert.deepEqual(restored.quarterDraft, signed.quarterDraft);
    assert.deepEqual(restored.resources, signed.resources);
    await open('main');
    await page.locator('[data-quarter-resolution]').waitFor();
    // A changed mind is a free edit; it does not undo an already signed project order.
    await page.getByRole('button', { name:'Переписать резолюцию', exact:true }).click();
    assert.equal(await finish.count(), 0, 'Editing the resolution hides quarter close again');
    assert.deepEqual((await read()).resources, signed.resources);
    await page.locator('#opt-1').click();
    await page.locator('.sv-quarter-prepare button').first().click();
    await finish.click();
    await page.waitForFunction(turn => JSON.parse(localStorage.getItem('sovereign.save')).state.turn === turn + 1, state.turn);
    const resolved = await read();
    assert.equal(resolved.quarterDraft, undefined);
    assert.ok(resolved.lastTurn);
    await page.locator('#sv-turn-result').waitFor();
    await page.screenshot({ path:`${output}/${width}-newspaper.png`, fullPage:true });
    assert.ok(await page.locator('[data-scene-art]').count(), 'Gemini art remains attached to the result');
    const next = page.getByRole('button', { name:/Следующий ход/i }).filter({ visible:true }).last();
    await next.click();
    await page.locator('[data-quarter-secretary]').waitFor();
    assert.equal((await read()).turn, resolved.turn);
    assert.equal((await read()).lastTurn, null);
    assert.deepEqual(errors, []);
    results.push({ width, seed, difficulty, sharedQuota:true, draftReload:true, explicitQuarterEnd:true, newspaper:true, errors });
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(`${output}/summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
