// Настоящий старт: выбор, отмена, reload и восстановление без снимка ленты до первой подписи.
import assert from 'node:assert/strict';
import { initialCabinetPreview } from '../lib/game/cabinet-formation.ts';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
const selected = state => Object.values(state.cabinetFormation.selected);
const reopen = async page => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('region', { name: 'Первоначальный состав совета' }).waitFor();
};

export async function exerciseFormation(page, shot) {
  const panel = page.getByRole('region', { name: 'Первоначальный состав совета' });
  const before = await saved(page);
  assert.equal(before.cabinetFormation.status, 'pending');
  assert.equal(before.currentEvent, null);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot(`formation-${width}`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  const choose = async () => {
    await panel.getByRole('button', { name: 'Изменить состав', exact: true }).tap();
    await panel.getByRole('button', { name: 'Выбрать в состав', exact: true }).first().tap();
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('sovereign.save')).state.cabinetFormation.selected).length === 1);
  };
  await choose();
  const draft = await saved(page);
  assert.deepEqual(draft.resources, before.resources, 'черновик не списывает ресурсы');
  assert.deepEqual(draft.advisors, before.advisors, 'кандидат ещё не назначен');
  await reopen(page);
  assert.deepEqual(selected(await saved(page)), selected(draft), 'выбор переживает reload');
  await panel.getByRole('button', { name: 'Отменить изменения', exact: true }).tap();
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('sovereign.save')).state.cabinetFormation.selected).length === 0);
  assert.deepEqual((await saved(page)).resources, before.resources);
  await choose();
  const repeated = await saved(page);
  assert.deepEqual(selected(repeated), selected(draft), 'отмена не перебрасывает кандидатов');
  await page.evaluate(() => localStorage.removeItem('sovereign.chronicle.game'));
  await reopen(page);
  assert.deepEqual(selected(await saved(page)), selected(draft), 'состав восстановлен из общего сохранения');
  await page.screenshot({ path: shot('formation-selected'), fullPage: true });
  const preview = initialCabinetPreview(await saved(page));
  assert.equal(preview.unavailable, null);
  await panel.getByRole('button', { name: 'Утвердить состав', exact: true }).tap();
  await page.getByRole('region', { name: 'Дело на столе' }).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.currentEvent !== null);
  const approved = await saved(page);
  assert.equal(approved.cabinetFormation.status, 'confirmed');
  assert.deepEqual(approved.resources, preview.next.resources, 'списан ровно итоговый расчёт');
  assert.deepEqual(approved.advisors, preview.next.advisors);
  assert.equal(approved.cabinet.departed.length, 0, 'предложенных людей не увольняли');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('region', { name: 'Дело на столе' }).waitFor();
  assert.equal(await panel.count(), 0, 'утверждённый состав не запрашивается заново');
  assert.deepEqual((await saved(page)).resources, approved.resources, 'reload не оплачивает состав повторно');
  // Возобновлённое дело ещё выравнивается под шапкой. Ручная прокрутка к варианту должна отменить это выравнивание.
  const option = page.locator('[data-resolution-choices] #opt-1');
  await option.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(200);
  const readingPosition = await page.evaluate(() => scrollY);
  await page.waitForTimeout(1800);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - readingPosition) < 50,
    'отложенное выравнивание не отбирает прокрутку у игрока');
  // Следующая общая проверка измеряет исходное положение заголовка, а не выбранную игроком позицию чтения.
  await page.getByRole('region', { name: 'Дело на столе' }).evaluate(element => element.scrollIntoView({ block: 'start' }));
}
