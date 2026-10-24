// #245: a naturally reached first request, then a controlled planted-rumour fixture.
// npm run build:demo && node scripts/playtest-secretary.mjs [--out=playtest-secretary]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { classicApi } from '../lib/game/classic.ts';
import { ALTERNATE_COUNTRY } from '../lib/game/alternate-world.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from '../lib/game/engine.ts';
import { openDeskWhenDue } from '../lib/game/desk-timing.ts';
import { actSecretary, ensureSecretary, pendingSecretaryFavor } from '../lib/game/secretary.ts';
import { parseSave } from '../lib/client/save.ts';
import { SAVE_VERSION } from '../lib/game/data.ts';

const output = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'playtest-secretary');
mkdirSync(output, { recursive: true });
const seed = 3;
let state = createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist',
  await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', seed), seededRandom(seed));
for (let turn = 0; turn < 6; turn++) {
  state = openDeskWhenDue(state);
  state = startEvent(state, await classicApi.event(state));
  const choice = state.currentEvent.choices[turn === 0 ? 1 : 0];
  state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
}
state = openDeskWhenDue(state);
state = startEvent(state, await classicApi.event(state));
assert.ok(!state.ended && pendingSecretaryFavor(state));
const encode = gs => ({ version: SAVE_VERSION, screen: 'game', state: gs });
assert.ok(parseSave(JSON.stringify(encode(state))));
// A normal HTTP origin gives reload the same storage guarantees as the deployed game.
const html = readFileSync(new URL('../demo/dist/sovereign.html', import.meta.url));
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
const results = [];
try {
  browser = await chromium.launch();
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 760,
      hasTouch: width < 760, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(save => {
      if (!localStorage.getItem('sovereign.save')) localStorage.setItem('sovereign.save', JSON.stringify(save));
      localStorage.setItem('sovereign.tutorial.seen', '1');
    }, encode(state));
    const resume = async () => {
      await page.getByRole('button', { name: 'Продолжить сохранённую игру', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
      await page.locator('[data-quarter-secretary]').waitFor();
    };
    // #279: на телефоне папка тоже список карточек, а не выпадающий список.
    const open = async key => page.locator(`[data-quarter-document="${key}"]`).click();
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await resume();
    assert.match(await page.locator('[data-quarter-secretary]').innerText(), /держит дистанцию/);
    await page.screenshot({ path: `${output}/${width}-inventory.png`, fullPage: true });
    await open('main');
    await page.locator('#opt-1').click();
    await page.locator('.sv-quarter-prepare button').first().click();
    await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('sovereign.save')).state.quarterDraft);
    const prepared = await read();
    await open('secretary-favor');
    const favor = state.world.secretary.favors.at(-1);
    const grant = page.locator(`[data-secretary-action="secretary:favor:${favor.id}:grant"]`);
    await grant.click();
    await page.getByRole('button', { name: 'Отложить', exact: true }).click();
    assert.deepEqual((await read()).resources, prepared.resources);
    await grant.click();
    await page.locator('[data-secretary-confirm]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.world.secretary.favors.at(-1).answer === 'grant');
    const signed = await read();
    assert.equal(signed.turn, state.turn);
    assert.equal(signed.world.lastActionTurn, prepared.world.lastActionTurn);
    assert.deepEqual(signed.quarterDraft, prepared.quarterDraft);
    assert.equal(await grant.count(), 0);
    await page.screenshot({ path: `${output}/${width}-answer.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.deepEqual((await read()).world.secretary, signed.world.secretary, 'reload preserves stored answer');
    await resume();
    assert.deepEqual((await read()).world.secretary, signed.world.secretary);
    assert.deepEqual((await read()).quarterDraft, signed.quarterDraft);
    await open('main');
    await page.locator('[data-finish-quarter]').click();
    await page.waitForFunction(turn => JSON.parse(localStorage.getItem('sovereign.save')).state.turn === turn + 1, state.turn);
    await page.locator('#sv-turn-result').waitFor();
    assert.deepEqual(errors, []);
    results.push({ width, naturalFirstRequest: true, cancel: true, signedOnce: true, draftReload: true, errors });
    await context.close();
  }
  // Isolate a real current-quarter leak to verify the approved price and newspaper result.
  let warned = structuredClone(state);
  warned.advisors = warned.advisors.map(a => ({ ...a, loyalty: 10 }));
  warned.world.secretary.trust = 2;
  warned.world.secretary.updated = warned.turn - 1;
  warned.world.secretary.lastGossipTurn = null;
  for (let turn = warned.turn; turn < 20; turn++) {
    warned.turn = turn;
    warned.world.lastTick = turn;
    warned = ensureSecretary(warned);
    if (warned.world.secretary.gossip?.kind === 'leak') break;
  }
  assert.equal(warned.world.secretary.gossip?.kind, 'leak');
  assert.ok(warned.world.secretary.gossip.truthful);
  assert.ok(parseSave(JSON.stringify(encode(warned))));
  const protectionContext = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  const protectionPage = await protectionContext.newPage();
  const protectionErrors = [];
  protectionPage.on('pageerror', error => protectionErrors.push(error.message));
  await protectionPage.addInitScript(save => {
    if (!localStorage.getItem('sovereign.save')) localStorage.setItem('sovereign.save', JSON.stringify(save));
  }, encode(warned));
  const protectionRead = () => protectionPage.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
  const protectionResume = async () => {
    await protectionPage.getByRole('button', { name: 'Продолжить сохранённую игру', exact: true }).click();
    await protectionPage.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
  };
  await protectionPage.goto(url, { waitUntil: 'domcontentloaded' });
  await protectionResume();
  const protectButton = protectionPage.locator('[data-secretary-action="secretary:protect"]');
  await protectButton.click();
  assert.match(await protectionPage.locator('.sv-country-confirm').innerText(), /Личный ресурс −1/);
  await protectionPage.getByRole('button', { name: 'Отложить', exact: true }).click();
  assert.deepEqual((await protectionRead()).resources, warned.resources);
  await protectButton.click();
  await protectionPage.locator('[data-secretary-confirm]').click();
  await protectionPage.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.world.secretary.gossip.protected);
  const protectedSave = await protectionRead();
  assert.equal(protectedSave.resources.personalResource, warned.resources.personalResource - 1);
  assert.equal(protectedSave.resources.politicalCapital, warned.resources.politicalCapital);
  assert.equal(await protectButton.count(), 0);
  await protectionPage.reload({ waitUntil: 'domcontentloaded' });
  await protectionResume();
  assert.deepEqual((await protectionRead()).world.secretary.gossip, protectedSave.world.secretary.gossip);
  await protectionPage.locator('[data-quarter-document="main"]').click();
  await protectionPage.locator('#opt-1').click();
  await protectionPage.locator('.sv-quarter-prepare button').first().click();
  await protectionPage.locator('[data-finish-quarter]').click();
  await protectionPage.locator('#sv-turn-result').waitFor();
  await protectionPage.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.lastTurn?.narrative.includes('Утечку предотвратили'));
  await protectionPage.evaluate(() => window.scrollTo({ top: 0 }));
  await protectionPage.screenshot({ path: `${output}/390-prevented-leak.png`, fullPage: true });
  assert.deepEqual(protectionErrors, []);
  results.push({ leakPrevented: true, personalCost: 1, politicalCost: 0, protectionReload: true, errors: protectionErrors });
  await protectionContext.close();

  // Isolate the director's channel after the grant: this is not an assertion about natural unlock timing.
  const controlled = structuredClone(state);
  controlled.world.secretary.favors = [{ id: 'archiveKey', offered: state.turn, answer: null, answered: null, outcome: null }];
  let planted = actSecretary(controlled, 'secretary:favor:archiveKey:grant');
  planted.advisors = planted.advisors.map(a => ({ ...a, loyalty: 80 }));
  planted.world.secretary.lastGossipTurn = null;
  for (let turn = planted.turn + 1; turn < 20; turn++) {
    planted.turn = turn;
    planted.world.lastTick = turn;
    planted = ensureSecretary(planted);
    if (planted.world.secretary.gossip?.source === 'director') break;
  }
  assert.ok(planted.world.secretary.gossip.source === 'director');
  assert.ok(parseSave(JSON.stringify(encode(planted))));
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(save => localStorage.setItem('sovereign.save', JSON.stringify(save)), encode(planted));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Продолжить сохранённую игру', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ПРОДОЛЖИТЬ', exact: true }).click();
  await page.locator('[data-secretary-action="secretary:verify"]').click();
  await page.locator('[data-secretary-confirm]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.world.secretary.channelExposed);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.screenshot({ path: `${output}/390-uncovered.png`, fullPage: true });
  assert.match(await page.locator('[data-secretary-receipt]').innerText(), /директору/);
  results.push({ plantedChannelUncovered: true });
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
writeFileSync(`${output}/summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
