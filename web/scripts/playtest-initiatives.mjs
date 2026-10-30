// Controlled low-resource fixtures, loaded through the real save parser and UI.
// npm run build:demo && node scripts/playtest-initiatives.mjs --out=<directory>
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { classicApi } from '../lib/game/classic.ts';
import { ALTERNATE_COUNTRY } from '../lib/game/alternate-world.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from '../lib/game/data.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../lib/game/engine.ts';
import { initiativeOptions } from '../lib/game/initiatives.ts';
import { parseSave } from '../lib/client/save.ts';
import { openLivingWorld } from '../lib/game/living-world.ts';
import { ALTERNATE_EVENTS } from '../lib/content/alternate-history.ts';

const output = resolve(
  process.argv.find((value) => value.startsWith('--out='))?.slice(6) ?? 'playtest-initiatives'
);
mkdirSync(output, { recursive: true });
const seed = 7;
let state = createInitialState(
  ALTERNATE_COUNTRY,
  'debut',
  'pragmatist',
  await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed),
  seededRandom(seed)
);
state = startEvent(state, await classicApi.event(state));
const choice = state.currentEvent.choices[0].id;
state = resolveTurn(state, choice, await classicApi.consequence(state, choice));
assert.equal(state.world, undefined, 'Early responses must not require the desk');
const html = readFileSync(new URL('../demo/dist/sovereign.html', import.meta.url));
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 320])
    for (const value of [21, 10])
      for (const resource of RESOURCE_KEYS) {
        const fixtureState = {
          ...state,
          resources: { ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 60])), [resource]: value },
          factions: state.factions.map((faction) => ({ ...faction, relation: 30 })),
          keyFigures: state.keyFigures.map((figure) => ({ ...figure, relation: 30 })),
        };
        const fixture = { version: SAVE_VERSION, screen: 'game', state: fixtureState };
        assert.ok(parseSave(JSON.stringify(fixture)));
        const option = initiativeOptions(fixtureState, resource).find((entry) => !entry.blocked);
        assert.ok(option);
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          isMobile: true,
          hasTouch: true,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.__saveBeforeFixture = localStorage.getItem('sovereign.save');
          localStorage.setItem('sovereign.tutorial.seen', '1');
        });
        const resume = async () => {
          await page.getByRole('button', { name: 'Продолжить сохранённую игру', exact: true }).click();
          await page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
        };
        const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
        await page.goto(url);
        // Seed once. A missing save after reload must fail, never recreate the fixture.
        await page.evaluate((save) => localStorage.setItem('sovereign.save', JSON.stringify(save)), fixture);
        await page.reload();
        await resume();
        await page.locator(`[data-res="${resource}"]`).click();
        const panel = page.locator('.sv-resource-info');
        await panel.locator(`[data-initiative="${option.id}"]`).click();
        const note = panel.locator('[data-initiative-note]');
        assert.ok((await note.innerText()).includes(option.actor.name));
        assert.equal(await page.locator('[data-sign-initiative]').isDisabled(), false);
        const bounds = await panel.boundingBox();
        assert.ok(
          bounds.y + bounds.height <= (await page.evaluate(() => innerHeight + 1)),
          'Panel fits viewport'
        );
        await panel.getByRole('button', { name: 'Отложить', exact: true }).click();
        assert.deepEqual(
          (await read()).resources,
          fixtureState.resources,
          'Considering a note spends nothing'
        );
        await panel.locator(`[data-initiative="${option.id}"]`).click();
        if (value === 10)
          await page.screenshot({ path: `${output}/${width}-${resource}-note.png`, fullPage: true });
        await page.locator('[data-sign-initiative]').click();
        await panel.locator('[data-initiative-receipt]').waitFor();
        const signed = await read();
        assert.equal(signed.turn, fixtureState.turn);
        assert.equal(signed.world, undefined);
        for (const key of RESOURCE_KEYS) {
          assert.equal(signed.resources[key] - fixtureState.resources[key], option.immediate[key] ?? 0);
        }
        assert.equal(signed.initiatives.signed.length, 1);
        if (option.repayment) {
          assert.equal(
            signed.pending.find((entry) => entry.id === option.repayment.id).due,
            option.repayment.due
          );
          assert.match(await panel.innerText(), /Возврат аванса/);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.reload();
        const atReload = await page.evaluate(() => ({
          beforeFixture: window.__saveBeforeFixture,
          raw: localStorage.getItem('sovereign.save'),
        }));
        writeFileSync(
          `${output}/reload-${width}-${value}-${resource}.json`,
          JSON.stringify({ signed, atReload }, null, 2)
        );
        assert.ok(atReload.beforeFixture, 'Reload must retain the signed save before any application code');
        assert.deepEqual(JSON.parse(atReload.beforeFixture).state.resources, signed.resources);
        await resume();
        assert.deepEqual((await read()).resources, signed.resources);
        await page.locator(`[data-res="${resource}"]`).click();
        await page.locator(`[data-initiative="${option.id}"]`).click();
        assert.equal(await page.locator('[data-sign-initiative]').isDisabled(), true);
        assert.match(await page.locator('[data-initiative-note]').innerText(), /уже подписано/);
        assert.deepEqual(errors, []);
        results.push({ width, value, resource, initiative: option.id, errors });
        await context.close();
      }
  // The same UI respects the shared desk quota in either order.
  for (const width of [390, 320])
    for (const initiativeFirst of [true, false]) {
      const unlocked = ['alt_fuel', 'alt_district'].map((id) => ({
        ...state.history[0],
        title: ALTERNATE_EVENTS.find((entry) => entry.id === id).title,
      }));
      let worldState = openLivingWorld({
        ...state,
        turn: 13,
        lastTurn: null,
        history: [...state.history, ...unlocked],
        resources: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 60])),
      });
      worldState = startEvent(worldState, await classicApi.event(worldState));
      const fixture = { version: SAVE_VERSION, screen: 'game', state: worldState };
      assert.ok(parseSave(JSON.stringify(fixture)));
      assert.ok(worldState.world.health);
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript((save) => {
        localStorage.setItem('sovereign.save', JSON.stringify(save));
        localStorage.setItem('sovereign.tutorial.seen', '1');
      }, fixture);
      await page.goto(url);
      await page.getByRole('button', { name: 'Продолжить сохранённую игру', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
      if (!initiativeFirst) {
        await page.locator('[data-quarter-document="health"]').click();
        await page.locator('.sv-country-action:enabled').first().click();
        await page.getByRole('button', { name: 'Подписать поручение', exact: true }).click();
      }
      await page.locator('[data-res="economy"]').click();
      await page.locator('[data-initiative="advance:domestic"]').click();
      assert.equal(await page.locator('[data-sign-initiative]').isDisabled(), !initiativeFirst);
      if (initiativeFirst) {
        await page.locator('[data-sign-initiative]').click();
        await page.locator('[data-initiative-receipt]').waitFor();
        await page.getByRole('button', { name: 'Закрыть объяснение', exact: true }).click();
        await page.locator('[data-quarter-document="health"]').click();
        assert.equal(await page.locator('.sv-country-action').count(), 0);
        assert.match(await page.locator('[data-incoming-project="health"]').innerText(), /уже подписано/);
      } else {
        assert.match(await page.locator('[data-initiative-note]').innerText(), /уже подписано/);
      }
      assert.deepEqual(errors, []);
      results.push({ width, initiativeFirst, sharedQuota: true, errors });
      await context.close();
    }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  writeFileSync(`${output}/summary.json`, JSON.stringify({ fixtures: results.length, results }, null, 2));
}
console.log(JSON.stringify({ fixtures: results.length, output }));
