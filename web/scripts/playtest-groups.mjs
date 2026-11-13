// Реальная хроника: сохранение у первого предложения → ответ → встречный ход → отгрузка.
// Исходное сохранение получено через обычные дела; после загрузки — только действия в UI.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { launchChromium } from './browser.mjs';
import { newTerm, nextCase, signChoice, startFromSeed, firstStep } from '../lib/client/chronicle.ts';
import { encodeChronicle, parseChronicle } from '../lib/client/chronicle-save.ts';
import { parseSave } from '../lib/client/save.ts';
import { APP_VERSION, SAVE_VERSION } from '../lib/game/data.ts';

const out = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'playtest/groups');
await mkdir(out, { recursive: true });
const file = join(out, 'game.html');
await writeFile(file, await readFile('demo/dist/sovereign.html'));
const start = startFromSeed(3, 'debut');
let game = await newTerm(start);
while (game.world?.groups?.phase !== 'offer' && game.turn < 12 && !game.ended) {
  game = await nextCase(game); game = await signChoice(game, game.currentEvent.choices[0].id);
}
assert.equal(game.world?.groups?.phase, 'offer');
game = await nextCase(game);
game.analyticsRun = { id: '123456789abcdef012345678', startedAt: 1, version: APP_VERSION, source: 'web', mode: 'ordinary' };
const main = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: game });
const chronicle = encodeChronicle({ start, game, shown: [], queue: [], step: firstStep(game), picks: [], form: null,
  stop: null, stops: {}, memory: { used: [], lastTurn: null }, visibleResources: game.resources, page: null, rivals: null, over: false });
assert.ok(parseSave(main)); assert.ok(parseChronicle(chronicle));
const browser = await launchChromium();
const problems = [], paths = [];
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
async function resume(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('button', { name: 'Сразу', exact: true }).tap();
}
async function openGroups(page) {
  const panel = page.locator('[data-group-initiative]');
  if (await panel.isVisible()) return panel;
  await page.getByRole('button', { name: /Ждут ответа/ }).tap();
  await page.getByRole('button', { name: /Экспортный заказ и местное топливо|Области удерживают топливо|Встречное предложение областей/ }).tap();
  await panel.waitFor();
  return panel;
}
async function advance(page) {
  const turn = (await saved(page)).turn;
  for (let guard = 0; guard < 12; guard++) {
    const letter = page.locator('section[aria-label="Ждёт ответа"]');
    if (await letter.isVisible()) {
      await letter.locator(':scope > div:last-child button').last().tap();
      await page.waitForTimeout(200); continue;
    }
    const desk = page.locator('section[aria-label="Дело на столе"]:not([hidden])');
    await desk.waitFor();
    if (await desk.locator('[data-resolution-choices]').count()) {
      await desk.locator('[id^="opt-"]').first().tap();
      await desk.getByRole('button', { name: 'Подписать', exact: true }).tap();
    } else if (await desk.getByRole('button', { name: /УТВЕРДИТЬ БЮДЖЕТ/ }).count()) {
      await desk.getByRole('button', { name: /УТВЕРДИТЬ БЮДЖЕТ/ }).tap();
    } else if (await desk.getByRole('button', { name: /ВЫЙТИ К ЖУРНАЛИСТАМ/ }).count()) {
      await desk.getByRole('button', { name: /ВЫЙТИ К ЖУРНАЛИСТАМ/ }).tap();
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(250);
        const answer = desk.locator('.sv-paper button').filter({ hasText: /«/ });
        if (!await answer.count()) break;
        await answer.first().tap();
      }
      await desk.getByRole('button', { name: /ЗАКОНЧИТЬ/ }).tap();
    } else if (await desk.locator('[data-negotiation-choice]').count()) {
      await desk.locator('[data-negotiation-choice]').first().tap();
      await desk.getByRole('button', { name: 'Подтвердить решение' }).tap();
    } else {
      for (let i = 0; i < 3; i++) {
        const option = desk.locator('button').filter({ hasText: /^\s*\d\./ });
        if (!await option.count()) break;
        await option.first().tap(); await page.waitForTimeout(400);
      }
    }
    await page.waitForFunction(t => JSON.parse(localStorage.getItem('sovereign.save')).state.turn > t, turn);
    await page.waitForTimeout(900); return;
  }
  throw Error('Не удалось завершить квартал');
}
try {
  for (const [route, first, phase, second, outcome] of [
    ['support', 'Поддержать полный экспортный заказ', 'dispute', 'Купить дополнительное топливо для полного заказа', 'fuel'],
    ['conditions', 'Потребовать долю выручки для местного снабжения', 'bargain', 'Согласовать заказ с районным резервом топлива', 'shared'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.on('pageerror', e => problems.push(String(e)));
    await page.goto(`file://${file}`);
    await page.evaluate(({ main, chronicle }) => {
      localStorage.clear(); localStorage.setItem('sovereign.save', main);
      localStorage.setItem('sovereign.chronicle.game', chronicle); localStorage.setItem('chronicle.speed', 'all');
    }, { main, chronicle });
    await resume(page);
    let panel = await openGroups(page);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await panel.evaluate(element => {
        const article = element.closest('article');
        const header = document.querySelector('header');
        window.scrollTo(0, scrollY + article.getBoundingClientRect().top - (header?.getBoundingClientRect().height ?? 0) - 12);
      });
      await page.waitForTimeout(1200); // письмо появляется плавно; снимок после появления текста
      await page.screenshot({ path: join(out, `${route}-offer-${width}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await panel.getByRole('button', { name: first }).tap();
    await panel.getByRole('button', { name: 'Подписать ответ группам' }).tap();
    const signed = await saved(page);
    await resume(page);
    assert.deepEqual((await saved(page)).resources, signed.resources, 'reload не списывает повторно');
    await advance(page);
    assert.equal((await saved(page)).world.groups.phase, phase);
    panel = await openGroups(page);
    await panel.getByRole('button', { name: second }).tap();
    await panel.getByRole('button', { name: 'Подписать ответ группам' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${route}-response.png`) });
    await panel.getByRole('button', { name: 'Подписать ответ группам' }).tap();
    const shipping = await saved(page);
    assert.equal(shipping.world.groups.phase, 'shipping');
    await resume(page);
    assert.deepEqual((await saved(page)).resources, shipping.resources);
    await advance(page); await advance(page);
    const result = await saved(page);
    assert.equal(result.world.groups.phase, 'settled'); assert.equal(result.world.groups.outcome, outcome);
    await page.screenshot({ path: join(out, `${route}-settled.png`) });
    paths.push({ route, phase, outcome, turn: result.turn });
    await page.close();
  }
} catch (error) { problems.push(String(error)); }
await browser.close();
await writeFile(join(out, 'summary.json'), JSON.stringify({ paths, problems }, null, 2));
console.log(JSON.stringify({ paths, problems }, null, 2));
if (problems.length) process.exitCode = 1;
