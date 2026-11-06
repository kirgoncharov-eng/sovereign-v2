import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordFactoryMandate, settleFactoryMandates, validFactoryMandate } from './factory-mandate.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import { sanitizeState } from './sanitize.ts';
import { planTurn, rollSuccess } from './engine.ts';
import { LEGACY_COUNTRIES } from './alternate-world.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from './data.ts';
import type { GameState, ResourceKey } from './types.ts';

async function factoryCase(route: number, success: boolean) {
  for (let seed = 1; seed <= 100; seed++) {
    const state = await nextCase(await newTerm(startFromSeed(seed)));
    const choice = state.currentEvent!.choices[route];
    if (rollSuccess(state, choice) === success) return { state, choice };
  }
  throw new Error('Нет исхода заводской резолюции');
}

test('три подписи и оба исхода сохраняют настоящих координаторов, расходы и существующее обязательство', async () => {
  for (const route of [0, 1, 2]) for (const success of [true, false]) {
    const { state, choice } = await factoryCase(route, success);
    const before = structuredClone(state), plan = planTurn(state, choice.id);
    const after = await signChoice(state, choice.id);
    const mandate = after.history.at(-1)!.factoryMandate!;
    assert.ok(validFactoryMandate(mandate, after.turn));
    assert.equal(mandate.success, success);
    assert.equal(mandate.issued, after.turn);
    assert.equal(mandate.route, choice.id);
    assert.deepEqual(mandate.coordinators.map(person => person.id), route === 0 ? ['economist'] : ['economist', 'diplomat']);
    assert.deepEqual(mandate.spent, Object.fromEntries(RESOURCE_KEYS.flatMap(key => {
      const amount = plan.sources[key]?.find(([label]) => label === 'решение')?.[1] ?? 0;
      return amount < 0 ? [[key, amount]] : [];
    })));
    assert.deepEqual(after.resources, plan.resources);
    assert.deepEqual(after.pending, plan.pending);
    assert.equal(!!mandate.followUp, success && route > 0);
    if (mandate.followUp) assert.ok(after.pending.some(effect => effect.id === mandate.followUp!.id));
    assert.deepEqual(state, before, 'подпись не изменяет исходный объект');
    const saved = JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: after });
    assert.deepEqual(parseSave(saved)!.state.history.at(-1)!.factoryMandate, mandate);
    assert.deepEqual(sanitizeState(after)!.history.at(-1)!.factoryMandate, mandate);
  }
});

test('контрольный расчёт возникает только при настоящем погашении очереди и переживает reload', async () => {
  for (const route of [1, 2]) {
    const { state, choice } = await factoryCase(route, true);
    let current = await signChoice(state, choice.id);
    const original = structuredClone(current.history[0].factoryMandate!);
    current = { ...current, advisors: current.advisors.map(person => ({ ...person, name: `Новый ${person.id}` })) };
    while (current.turn < original.followUp!.due && !current.ended) {
      const before = await nextCase(current);
      const snapshot = structuredClone(before);
      current = await signChoice(before, before.currentEvent!.choices[0].id);
      assert.deepEqual(before, snapshot);
      const mandate = current.history[0].factoryMandate!;
      assert.deepEqual(mandate.coordinators, original.coordinators, 'новое назначение не переписывает авторство');
      if (current.turn < original.followUp!.due) assert.equal(mandate.settled, undefined);
    }
    assert.equal(current.turn, original.followUp!.due, 'реальная партия дошла до контрольного срока');
    const mandate = current.history[0].factoryMandate!;
    assert.equal(mandate.settled!.turn, current.turn);
    assert.ok(current.lastTurn!.matured.some(effect => effect.id === original.followUp!.id));
    assert.ok(!current.pending.some(effect => effect.id === original.followUp!.id));
    for (const [key, amount] of Object.entries(mandate.settled!.actual!)) {
      assert.equal(amount, current.lastTurn!.sources![key as ResourceKey]
        ?.find(([label]) => label === original.followUp!.label.toLowerCase())?.[1]);
    }
    const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: current }))!.state;
    assert.deepEqual(loaded.history[0].factoryMandate, mandate);
    assert.deepEqual(settleFactoryMandates(loaded, { matured: [], sources: {} }), loaded.history);
  }
});

test('учёт использует фактическую дельту у границы, а одноимённый общий платёж не выдаёт за отдельный', async () => {
  const { state, choice } = await factoryCase(2, true);
  const signed = await signChoice(state, choice.id), entry = signed.history[0], mandate = entry.factoryMandate!;
  const pending = signed.pending.find(effect => effect.id === mandate.followUp!.id)!;
  const due = { ...signed, turn: pending.due - 1 };
  const label = pending.label.toLowerCase();
  const settled = settleFactoryMandates(due, { matured: [pending], sources: { economy: [[label, 1]] } });
  assert.deepEqual(settled[0].factoryMandate!.settled!.actual, { economy: 1 });
  assert.equal(mandate.settled, undefined);
  const ambiguous = settleFactoryMandates(due, { matured: [pending, { ...pending, id: 'other' }], sources: { economy: [[label, 1], [label, 3]] } });
  assert.equal(ambiguous[0].factoryMandate!.settled!.actual, null);
});

test('метаданные не добавляются архиву, Daily, соседним делам и переделанному предложению', async () => {
  const { state, choice } = await factoryCase(1, true), plan = planTurn(state, choice.id);
  for (const country of LEGACY_COUNTRIES) assert.equal(recordFactoryMandate({ ...state, country }, choice, plan), undefined);
  assert.equal(recordFactoryMandate({ ...state, daily: '2026-11-06' }, choice, plan), undefined);
  assert.equal(recordFactoryMandate({ ...state, currentEvent: { ...state.currentEvent!, card: 'other' } }, choice, plan), undefined);
  assert.equal(recordFactoryMandate(state, { ...choice, policyEffect: { economy: 9 } }, plan), undefined);
  assert.equal(recordFactoryMandate(state, { ...choice, advisor: state.advisors[0] }, plan), undefined);
  const after = await signChoice(state, choice.id), old = structuredClone(after);
  delete old.history[0].factoryMandate;
  assert.ok(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: old })));
  assert.deepEqual(settleFactoryMandates(old, { matured: after.pending, sources: {} }), old.history);
});

test('сохранение отвергает повреждённую запись контроля, преждевременный расчёт и неизвестные ресурсы', async () => {
  const { state, choice } = await factoryCase(1, true), after = await signChoice(state, choice.id);
  const original = after.history[0].factoryMandate!;
  for (const patch of [
    { issued: after.turn + 1 }, { route: 'unknown' }, { spent: { economy: 3 } }, { spent: { fake: -2 } },
    { followUp: undefined }, { settled: { turn: original.issued, actual: {} } },
    { coordinators: [...original.coordinators, original.coordinators[0]] },
  ]) {
    const invalid = { ...original, ...patch };
    assert.equal(validFactoryMandate(invalid, after.turn), false);
    const save: GameState = { ...after, history: [{ ...after.history[0], factoryMandate: invalid as typeof original }] };
    assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: save })), null);
    assert.equal(sanitizeState(save)!.history[0].factoryMandate, undefined);
  }
});
