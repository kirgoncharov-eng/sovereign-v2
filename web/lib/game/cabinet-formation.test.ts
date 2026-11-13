import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginCabinetFormation, confirmInitialCabinet, formingCabinet, initialCabinetPreview,
  resetInitialCabinet, selectInitialAdvisor, validCabinetFormation } from './cabinet-formation.ts';
import { applyCabinetAction, cabinetCandidates, cabinetPreview } from './cabinet.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import { ADVISOR_ROLES, RESOURCE_KEYS, SAVE_VERSION } from './data.ts';
import { sourceFor, knowsAdvisorSkill } from '../client/advisor-outlook.ts';
import { successChance } from './engine.ts';
import type { DifficultyId, GameState } from './types.ts';

const fresh = async (seed = 1, diff: DifficultyId = 'debut') => beginCabinetFormation(await newTerm(startFromSeed(seed, diff)));
function reload(state: GameState) {
  const parsed = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }));
  assert.ok(parsed, 'черновик и утверждённый состав должны загружаться');
  assert.deepEqual(parsed.state, JSON.parse(JSON.stringify(state)));
  return parsed.state;
}

test('готовый состав утверждается один раз, без платежа и изменений прежнего старта', async () => {
  const base = await newTerm(startFromSeed(1)), pending = beginCabinetFormation(base);
  assert.equal(formingCabinet(base), false, 'старые партии не требуют утверждения');
  assert.equal(formingCabinet(pending), true);
  await assert.rejects(() => nextCase(pending), /утвердите/);
  const confirmed = reload(confirmInitialCabinet(reload(pending)));
  assert.equal(confirmInitialCabinet(confirmed), confirmed);
  assert.equal(beginCabinetFormation(confirmed), confirmed);
  assert.deepEqual(confirmed.advisors, base.advisors);
  assert.deepEqual(confirmed.resources, base.resources);
  const original = await nextCase(base), actual = await nextCase(confirmed);
  const { cabinetFormation, ...rest } = actual;
  assert.equal(cabinetFormation!.status, 'confirmed');
  assert.deepEqual(rest, original);
});

test('подбор, смена и отмена — чистый черновик; отказ от предложенного человека не увольнение', async () => {
  const state = await fresh(), before = structuredClone(state), candidate = cabinetCandidates(state, 'economist')[0];
  const draft = reload(selectInitialAdvisor(state, candidate.seat, candidate.id));
  assert.deepEqual(state, before);
  for (const field of ['resources', 'advisors', 'factions', 'former', 'staffing', 'cabinet'] as const) assert.deepEqual(draft[field], state[field]);
  const quote = initialCabinetPreview(draft), candidatePrice = cabinetPreview(draft, { kind: 'hire', candidate: candidate.id }, 'formation');
  assert.equal(quote.unavailable, null);
  assert.deepEqual(quote.cost, candidatePrice.cost);
  assert.equal(candidatePrice.leaving, null);
  assert.throws(() => applyCabinetAction(draft, { kind: 'hire', candidate: candidate.id }), /утвердите/);
  assert.deepEqual(resetInitialCabinet(draft), state);
  const assigned = reload(confirmInitialCabinet(draft));
  assert.equal(assigned.advisors.find(person => person.id === candidate.seat)!.name, candidate.name);
  assert.deepEqual(assigned.cabinet!.departed, []);
  assert.deepEqual(assigned.former, state.former);
  for (const key of RESOURCE_KEYS) assert.equal(assigned.resources[key] - state.resources[key], quote.cost[key] ?? 0);
  assert.deepEqual(confirmInitialCabinet(reload(assigned)), assigned);
  assert.throws(() => selectInitialAdvisor(assigned, candidate.seat, null), /утверждён/);
  assert.equal(assigned.cabinet!.changes, 0);
});

test('несколько начальных назначений не умножают поддержку и не получают штраф перестановок', async () => {
  let state = await fresh();
  const base = state;
  const candidates = cabinetCandidates(state).filter(person => person.channel === 'oligarch');
  assert.ok(candidates.length >= 2);
  for (const candidate of candidates) state = selectInitialAdvisor(state, candidate.seat, candidate.id);
  const preview = initialCabinetPreview(reload(state));
  assert.equal(preview.cost.economy, 3);
  assert.equal(preview.cost.politicalCapital, -2 * candidates.length);
  const result = confirmInitialCabinet(state);
  assert.equal(result.cabinet!.backedChannels!.filter(channel => channel === 'oligarch').length, 1);
  const event = await nextCase(confirmInitialCabinet(selectInitialAdvisor(base, candidates[0].seat, candidates[0].id)));
  assert.ok((cabinetPreview(event, { kind: 'hire', candidate: candidates[1].id }).cost.economy ?? 0) <= 0);
});

test('два состава на одном зерне меняют источник первого доклада и исполнение, скрытый навык не раскрывается', async () => {
  for (const diff of ['debut', 'coalition', 'crisis', 'ruins'] as const) {
    const state = await fresh(1, diff);
    assert.equal(knowsAdvisorSkill(state), !['crisis', 'ruins'].includes(diff));
    const normal = await nextCase(confirmInitialCabinet(state));
    const candidate = cabinetCandidates(state).find(person => person.skill !== state.advisors.find(a => a.id === person.seat)!.skill)!;
    assert.ok(candidate);
    const changed = await nextCase(confirmInitialCabinet(selectInitialAdvisor(state, candidate.seat, candidate.id)));
    assert.equal(sourceFor(changed, candidate.seat).name, candidate.name);
    assert.notEqual(sourceFor(normal, candidate.seat).skill, sourceFor(changed, candidate.seat).skill);
    const choice = { ...changed.currentEvent!.choices[0], advisor: { id: candidate.seat, name: candidate.name,
      role: changed.advisors.find(person => person.id === candidate.seat)!.role, skill: candidate.skill } };
    // Один приказ, одно намерение, разное качество исполнителя — без подмены случайного исхода.
    const baselineChoice = { ...choice, advisor: { ...choice.advisor, skill: normal.advisors.find(person => person.id === candidate.seat)!.skill } };
    assert.notEqual(successChance(normal, baselineChoice), successChance(changed, choice));
    let played = changed;
    for (let i = 0; i < 3 && !played.ended; i++) {
      played = reload(await signChoice(played, played.currentEvent!.choices[0].id));
      if (!played.ended) played = await nextCase(played);
      assert.equal(played.advisors.find(person => person.id === candidate.seat)!.name, candidate.name);
    }
  }
});

test('повреждённый черновик отвергается; архив, Daily и начатая партия не получают новый старт', async () => {
  const state = await fresh(), candidate = cabinetCandidates(state)[0];
  for (const formation of [{ status: 'other', selected: {} }, { status: 'pending', selected: [] },
    { status: 'pending', selected: { unknown: candidate.id } },
    { status: 'pending', selected: { [candidate.seat]: 'cabinet:0:economist:999' } }]) {
    assert.equal(validCabinetFormation(formation, state), false);
    assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: { ...state, cabinetFormation: formation } })), null);
  }
  assert.throws(() => selectInitialAdvisor(state, 'unknown', candidate.id));
  const otherSeat = ADVISOR_ROLES.find(role => role.id !== candidate.seat)!.id;
  assert.throws(() => selectInitialAdvisor(state, otherSeat, candidate.id));
  const base = await newTerm(startFromSeed(7));
  for (const old of [{ ...base, country: 'Украина' }, { ...base, daily: '2026-11-12' }]) assert.equal(beginCabinetFormation(old), old);
  const opened = await nextCase(base);
  assert.throws(() => beginCabinetFormation(opened), /до первого дела/);
  assert.throws(() => applyCabinetAction(opened, { kind: 'hire', candidate: cabinetCandidates(opened)[0].id }, 'formation'), /утверждён/);
});

test('непосильный состав нельзя утвердить; отказ не оставляет частичных назначений и платежей', async () => {
  const state = await fresh();
  const candidate = cabinetCandidates(state)[0];
  const draft = selectInitialAdvisor({ ...state, resources: { ...state.resources, politicalCapital: 5 } }, candidate.seat, candidate.id);
  const before = structuredClone(draft);
  assert.match(initialCabinetPreview(draft).unavailable!, /Не хватает/);
  assert.throws(() => confirmInitialCabinet(draft), /Не хватает/);
  assert.deepEqual(draft, before);
  assert.deepEqual(confirmInitialCabinet(resetInitialCabinet(draft)).resources, draft.resources);
});

test('отклонённая кандидатура не возвращается под тем же именем с другой биографией', async () => {
  for (const seed of [7, 13, 19, 24]) {
    let state = await fresh(seed);
    state = { ...state, resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, 90])) as GameState['resources'] };
    const names = state.advisors.map(person => person.name);
    for (const role of ADVISOR_ROLES) state = selectInitialAdvisor(state, role.id, cabinetCandidates(state, role.id)[0].id);
    const confirmed = reload(confirmInitialCabinet(state));
    assert.deepEqual(confirmed.cabinetFormation!.suggestedNames, names);
    assert.deepEqual(confirmed.cabinet!.departed, []);
    for (const candidate of cabinetCandidates(confirmed)) assert.ok(!names.includes(candidate.name), candidate.name);
  }
});
