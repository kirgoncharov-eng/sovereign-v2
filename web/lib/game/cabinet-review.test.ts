import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCabinetAction, cabinetCandidates, cabinetPreview, prepareCabinet, cabinetTurnSources, validCabinet } from './cabinet.ts';
import { newTerm, nextCase, signChoice, startFromSeed, cabinetNotice } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';
import { confirmInitiative } from './initiatives.ts';

function reload(state: GameState) {
  const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }));
  assert.ok(saved);
  assert.deepEqual(saved.state, state);
  return saved.state;
}
function dismiss(state: GameState, seat: string) {
  return applyCabinetAction(state, { kind: 'dismiss', seat, name: state.advisors.find(p => p.id === seat)!.name });
}

test('годовой резерв переживает кварталы и reload до первого кадрового указа', async () => {
  for (const diff of ['debut', 'coalition', 'crisis', 'ruins'] as const) {
    let state = await nextCase(await newTerm(startFromSeed(7, diff)));
    for (let step = 0; step < 8 && !state.ended; step++) {
      const roster = cabinetCandidates(state), year = Math.floor(state.turn / 4);
      const signed = reload(await signChoice(state, state.currentEvent!.choices[0].id));
      if (Math.floor(signed.turn / 4) === year) assert.deepEqual(cabinetCandidates(signed), roster);
      const savedRoster = cabinetCandidates(signed);
      state = signed.ended ? signed : await nextCase(signed);
      assert.deepEqual(cabinetCandidates(state), savedRoster, 'новое дело не переименовывает кандидатов');
      assert.equal(state.cabinet!.changes, 0, 'подготовка резерва не считается указом');
    }
  }
});

test('поддержка канала один раз за год: повтор, отставка, старое сохранение, потолок и новый год', async () => {
  const state = await newTerm(startFromSeed(1, 'coalition'));
  state.resources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 90])) as GameState['resources'];
  const candidates = cabinetCandidates(state).filter(person => person.channel === 'oligarch');
  assert.ok(candidates.length >= 2);
  state.resources.economy = 100;
  const first = reload(applyCabinetAction(state, { kind: 'hire', candidate: candidates[0].id }));
  assert.ok(first.cabinet!.backedChannels!.includes('oligarch'), 'поддержка расходуется и при потолке');
  const later = { ...first, turn: 1, resources: { ...first.resources, economy: 50 } };
  const action = { kind: 'hire' as const, candidate: candidates[1].id };
  const preview = cabinetPreview(later, action);
  assert.ok((preview.cost.economy ?? 0) <= 0);
  assert.match(preview.supportNote!, /уже получена/);
  assert.ok(preview.reactions.every(reaction => reaction.delta <= 0));
  const again = reload(applyCabinetAction(later, action));
  assert.equal(again.resources.economy, later.resources.economy + (preview.cost.economy ?? 0));
  const legacy = structuredClone(later);
  delete legacy.cabinet!.backedChannels;
  assert.deepEqual(cabinetPreview(reload(legacy), action).cost, preview.cost);
  const oldReserve = prepareCabinet({ ...legacy, cabinet: undefined });
  assert.ok(oldReserve.cabinet!.backedChannels!.includes('oligarch'), 'старый резерв учитывает уже назначенного человека');
  const fired = dismiss(legacy, candidates[0].seat);
  assert.ok((cabinetPreview(fired, action).cost.economy ?? 0) <= 0, 'отставка не возвращает поддержку');
  const newYear = prepareCabinet({ ...again, turn: 4 });
  const next = cabinetCandidates(newYear).find(person => person.channel === 'oligarch')!;
  assert.ok(next);
  assert.ok((cabinetPreview(newYear, { kind: 'hire', candidate: next.id }).cost.economy ?? 0) > 0);
  for (const corrupt of [{ ...again.cabinet!, backedChannels: ['invented'] },
    { ...again.cabinet!, backedChannels: ['oligarch', 'oligarch'] },
    { ...again.cabinet!, entries: [{ turn: 100, label: 'указ', res: {} }] }]) {
    assert.equal(validCabinet(corrupt, again.turn), false);
  }
});

test('ведомость и хроника помнят указы без повторного списания после подписи', async () => {
  const before = await nextCase(await newTerm(startFromSeed(1, 'debut')));
  const hired = applyCabinetAction(before, { kind: 'hire', candidate: cabinetCandidates(before, 'economist')[0].id });
  const after = reload(dismiss(hired, 'diplomat'));
  const notice = cabinetNotice(after)!;
  assert.equal(notice.kind, 'notice');
  assert.match(notice.text, /Отставка:/);
  assert.notEqual(notice.id, cabinetNotice(hired)!.id);
  const signed = await signChoice(after, after.currentEvent!.choices[0].id);
  assert.deepEqual(signed.prevResources, before.resources);
  for (const key of RESOURCE_KEYS) {
    const sources = signed.lastTurn!.sources![key] ?? [];
    for (const entry of cabinetTurnSources(after)) if (entry.res[key]) {
      assert.ok(sources.some(([label, value]) => label === entry.label && value === entry.res[key]));
    }
    assert.equal(sources.reduce((sum, [, delta]) => sum + delta, 0), signed.resources[key] - before.resources[key]);
  }
  assert.equal(cabinetTurnSources(reload(signed)).length, 0, 'следующий квартал не повторяет цену');
});

test('кадровый бонус и расход инициативы у потолка не теряются в ведомости', async () => {
  let before = await nextCase(await newTerm(startFromSeed(1, 'debut')));
  before = await nextCase(await signChoice(before, before.currentEvent!.choices[0].id));
  before = { ...before, resources: { ...before.resources, economy: 100 } };
  const paid = confirmInitiative(before, 'payments');
  const candidate = cabinetCandidates(paid).find(person => person.channel === 'oligarch')!;
  const hired = applyCabinetAction(paid, { kind: 'hire', candidate: candidate.id });
  const signed = await signChoice(hired, hired.currentEvent!.choices[0].id);
  assert.deepEqual(signed.prevResources, before.resources);
  const sources = signed.lastTurn!.sources!.economy!;
  assert.equal(sources.reduce((sum, [, delta]) => sum + delta, 0), signed.resources.economy - 100);
});

test('новые люди страны не получают имя уже предложенного кандидата', async () => {
  for (const diff of ['debut', 'coalition', 'crisis'] as const) {
    let state = await newTerm(startFromSeed(8, diff));
    for (let turn = 0; turn < 16 && !state.ended; turn++) {
      state = await nextCase(state);
      const known = new Set([state.leader.name, ...state.advisors.map(person => person.name),
        ...state.keyFigures.map(person => person.name), ...(state.world?.people.map(person => person.name) ?? []),
        ...(state.former ?? []), state.world?.secretary?.name]);
      for (const candidate of cabinetCandidates(state)) assert.ok(!known.has(candidate.name), candidate.name);
      state = await signChoice(state, state.currentEvent!.choices[turn % 3]?.id ?? state.currentEvent!.choices[0].id);
    }
  }
});
