import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factoryMandateBrief, factoryQuarterReports } from './factory-mandate.ts';
import { newTerm, nextCase, quarterLines, signChoice, startFromSeed } from './chronicle.ts';
import { EMPTY_PERSONAL } from './chronicle-personal.ts';
import { parseSave } from './save.ts';
import { rollSuccess } from '../game/engine.ts';
import { LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { SAVE_VERSION } from '../game/data.ts';

async function signedFactory(route: number, success = true) {
  for (let seed = 1; seed <= 100; seed++) {
    const before = await nextCase(await newTerm(startFromSeed(seed)));
    const choice = before.currentEvent!.choices[route];
    if (rollSuccess(before, choice) === success) return { before, after: await signChoice(before, choice.id) };
  }
  throw new Error('Не найден исход');
}

test('подпись возвращает цель, подготовивших её людей, фактические расходы и контрольный срок', async () => {
  for (const route of [0, 1, 2]) {
    const { before, after } = await signedFactory(route);
    assert.equal(factoryMandateBrief(before), null);
    const brief = factoryMandateBrief(after)!;
    assert.ok(brief.lines.some(line => line.startsWith('Цель:')));
    for (const person of after.history[0].factoryMandate!.coordinators) assert.ok(brief.lines.some(line => line.includes(person.name)));
    assert.ok(brief.lines.some(line => line.startsWith('При подписи списано:')));
    assert.equal(brief.lines.some(line => line.startsWith('Контрольный срок:')), route > 0);
    if (route === 0) assert.ok(brief.lines.some(line => line.includes('будущие зарплаты этим решением не оплачены')));
    const reports = factoryQuarterReports(before, after);
    assert.equal(reports.length, 1);
    const chronicle = quarterLines(before, after, EMPTY_PERSONAL).lines;
    assert.equal(chronicle.filter(line => line.kind === 'report' && line.who === reports[0].title).length, 1);
  }
});

test('срыв не становится успешным проектом и не обещает будущую партию продукции', async () => {
  for (const route of [0, 1, 2]) {
    const { after } = await signedFactory(route, false);
    const brief = factoryMandateBrief(after)!;
    assert.ok(brief.lines.some(line => line.includes('Цель не достигнута')));
    assert.equal(brief.mandate.followUp, null);
    assert.ok(!brief.lines.some(line => line.startsWith('Контрольный срок:')));
  }
});

test('реальное эхо возвращается докладом один раз, контракт после первого расчёта продолжается', async () => {
  const initial = await signedFactory(1);
  let after = initial.after, before = initial.before;
  const due = after.history[0].factoryMandate!.followUp!.due;
  while (after.turn < due && !after.ended) {
    before = await nextCase(after);
    after = await signChoice(before, before.currentEvent!.choices[0].id);
    assert.equal(factoryQuarterReports(before, after).length, after.turn === due ? 1 : 0);
  }
  assert.equal(after.turn, due);
  const brief = factoryMandateBrief(after)!;
  assert.equal(brief.status, 'Контрольный расчёт получен');
  assert.ok(brief.lines.some(line => line.includes('Трёхлетний контракт продолжает действовать')));
  const lines = quarterLines(before, after, EMPTY_PERSONAL).lines;
  assert.equal(lines.filter(line => line.kind === 'report' && line.who?.startsWith('Контроль заводской подписи')).length, 1);
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: after }))!.state;
  const unchanged = structuredClone(loaded);
  assert.deepEqual(factoryMandateBrief(loaded), brief);
  factoryMandateBrief(loaded);
  assert.deepEqual(factoryQuarterReports(loaded, loaded), []);
  assert.deepEqual(loaded, unchanged, 'повторное чтение не применяет результат или списание');
});

test('старому сохранению не приписывают нынешних авторов; архив, Daily и пропавшая очередь обозначены честно', async () => {
  const { after } = await signedFactory(2);
  const old = structuredClone(after);
  delete old.history[0].factoryMandate;
  assert.equal(factoryMandateBrief(old), null);
  for (const country of LEGACY_COUNTRIES) assert.equal(factoryMandateBrief({ ...after, country }), null);
  assert.equal(factoryMandateBrief({ ...after, daily: '2026-11-06' }), null);
  const missing = { ...after, pending: [] };
  const brief = factoryMandateBrief(missing)!;
  assert.equal(brief.status, 'Требуется сверка исполнения');
  assert.ok(brief.lines.some(line => line.includes('Нет подтверждения контрольного расчёта')));
  assert.equal(brief.mandate.settled, undefined);
});

test('срыв аванса, за которым пришёл поздний аванс, не утверждает, что денег нет, и переживает reload', async () => {
  for (let seed = 1; seed <= 100; seed++) {
    const first = await nextCase(await newTerm(startFromSeed(seed)));
    const advance = first.currentEvent!.choices[1];
    if (rollSuccess(first, advance)) continue;
    const signed = await signChoice(first, advance.id);
    const next = await nextCase(signed);
    const copy = next.currentEvent?.choices.find(choice => choice.text === 'Отправить делегации копию без закрытой страницы');
    if (next.currentEvent?.title !== 'Приложение к российскому заказу' || !copy || !rollSuccess(next, copy)) continue;
    const before = factoryMandateBrief(signed)!;
    assert.equal(before.status, 'Аванс задержан');
    const after = await signChoice(next, copy.id);
    const brief = factoryMandateBrief(after)!;
    assert.equal(brief.mandate.success, false);
    assert.deepEqual(brief.mandate.spent, before.mandate.spent);
    assert.equal(brief.status, 'Аванс получен после задержки');
    const text = brief.lines.join('\n');
    assert.ok(!text.includes('зарплатных денег завод не получил') && !text.includes('Цель не достигнута'));
    const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: after }))!.state;
    assert.deepEqual(factoryMandateBrief(loaded), brief);
    return;
  }
  throw new Error('Не найден маршрут');
});
