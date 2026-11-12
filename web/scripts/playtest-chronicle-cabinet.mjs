// Дополнение к настоящему пути playtest-chronicle.mjs: без подмены состояния и изолированного стенда.
import assert from 'node:assert/strict';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
const economist = state => state.advisors.find(person => person.id === 'economist');
const notices = page => page.evaluate(() => {
  const snapshot = JSON.parse(localStorage.getItem('sovereign.chronicle.game')).snapshot;
  return [...snapshot.shown, ...snapshot.queue].filter(line => line.who === 'КАДРОВЫЙ УКАЗ');
});
let offeredRoster;
async function reloadChronicle(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Встроенная игра после reload открывает титул; возвращаемся штатной кнопкой, не подставляем снимок.
  await page.getByRole('button', { name: /Продолжить сохранённую игру/ }).tap();
  await page.getByRole('button', { name: 'Команда', exact: true }).waitFor();
}

export async function exerciseCabinet(page, decision, shot) {
  if (decision > 3) return;
  const before = await saved(page);
  if (decision === 1) offeredRoster = before.cabinet.roster;
  if (decision === 2) assert.deepEqual(before.cabinet.roster, offeredRoster, 'новый квартал не переименовал резерв');
  const team = page.getByRole('button', { name: 'Команда', exact: true });
  await team.tap();
  const sheet = page.getByRole('complementary', { name: 'Команда', exact: true });
  const panel = sheet.getByRole('region', { name: 'Совет президента' });
  await panel.waitFor();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot(`cabinet-${decision}-${width}`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'кадры без вылета');
  }
  const close = () => sheet.getByRole('button', { name: 'Закрыть справку и вернуться к ленте' }).tap();
  if (decision === 1) {
    await panel.getByRole('button', { name: 'Уволить без замены' }).tap();
    await panel.getByRole('button', { name: 'Отмена', exact: true }).tap();
    assert.deepEqual((await saved(page)).advisors, before.advisors, 'отмена не увольняет');
    await panel.getByRole('button', { name: 'Уволить без замены' }).tap();
    await panel.getByRole('button', { name: 'Подписать кадровый указ' }).tap();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('sovereign.save')).state.advisors.some(p => p.id === 'economist'));
    const vacant = await saved(page);
    assert.equal(economist(vacant), undefined);
    assert.equal(vacant.turn, before.turn, 'кадровый указ не завершает квартал');
    assert.equal(vacant.currentEvent.title, before.currentEvent.title, 'дело осталось на столе');
    await panel.getByText('Должность вакантна', { exact: true }).waitFor();
    await page.screenshot({ path: shot('cabinet-vacancy') });
    await close();
    await page.waitForFunction(() => {
      const snapshot = JSON.parse(localStorage.getItem('sovereign.chronicle.game'))?.snapshot;
      return snapshot && [...snapshot.shown, ...snapshot.queue].some(line => line.who === 'КАДРОВЫЙ УКАЗ');
    });
    const recorded = await notices(page);
    assert.equal(recorded.length, 1, 'указ записан в хронику один раз');
    await reloadChronicle(page);
    await team.tap();
    await panel.getByText('Должность вакантна', { exact: true }).waitFor();
    const restored = await saved(page);
    assert.deepEqual(restored.advisors, vacant.advisors, 'reload сохраняет вакансию');
    assert.deepEqual(restored.resources, vacant.resources, 'reload не списывает цену второй раз');
    assert.equal(restored.currentEvent.title, vacant.currentEvent.title);
    assert.deepEqual(await notices(page), recorded, 'reload сохраняет кадровую запись без повторения');
    await close();
    const first = page.locator('[data-resolution-choices] #opt-1');
    await first.waitFor();
    assert.match(await first.locator('[aria-label^="Экономика:"]').getAttribute('aria-label'), /^Экономика: \?/,
      'игрок видит неизвестную оценку при вакансии, а не прежнего советника');
    await team.tap();
  } else if (decision === 2) {
    assert.equal(economist(before), undefined, 'прошёл целый квартал с вакансией');
    const offers = panel.getByRole('button', { name: 'Рассмотреть назначение' });
    let selected = false;
    for (let i = 0; i < await offers.count(); i++) {
      if (!(await offers.nth(i).isEnabled())) continue;
      await offers.nth(i).tap(); selected = true; break;
    }
    assert.ok(selected, 'есть доступный кандидат');
    await panel.getByRole('button', { name: 'Подписать кадровый указ' }).tap();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sovereign.save')).state.advisors.some(p => p.id === 'economist'));
    const hired = await saved(page);
    assert.ok(economist(hired));
    assert.equal(hired.turn, before.turn);
    await close();
    await reloadChronicle(page);
    assert.deepEqual((await saved(page)).advisors, hired.advisors, 'reload сохраняет назначение');
    await team.tap();
    await panel.getByText(economist(hired).name, { exact: true }).first().waitFor();
  } else {
    assert.ok(economist(before), 'преемник остался после следующей подписи');
  }
  await close();
}
