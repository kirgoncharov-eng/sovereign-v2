import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCabinetAction, cabinetCandidates, cabinetPreview, validCabinet } from './cabinet.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { advisorOutlook } from '../client/advisor-outlook.ts';
import { advisorDialogue } from '../client/advisor-dialogue.ts';
import { parseSave } from '../client/save.ts';
import { ADVISOR_ROLES, RESOURCE_KEYS, SAVE_VERSION } from './data.ts';
import { dossierBlocked } from './staffing.ts';
import { isFemaleName, successChance } from './engine.ts';
import { governmentActions, stepGovernment } from './government.ts';
import { stepHousingNext, validHousingNext } from './housing-next.ts';
import type { DifficultyId, GameState } from './types.ts';

async function fresh(seed = 7, diff: DifficultyId = 'coalition') {
  const state = await newTerm(startFromSeed(seed, diff));
  return { ...state, resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, 90])) as GameState['resources'] };
}
function dismiss(state: GameState, seat: string) {
  const person = state.advisors.find(person => person.id === seat)!;
  return applyCabinetAction(state, { kind: 'dismiss', seat, name: person.name });
}
function hire(state: GameState, seat: string) {
  return applyCabinetAction(state, { kind: 'hire', candidate: cabinetCandidates(state, seat)[0].id });
}
function reload(state: GameState) {
  const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }));
  assert.ok(saved, 'кадровое состояние должно загружаться');
  assert.equal(JSON.stringify(saved.state), JSON.stringify(state));
  return saved.state;
}

test('на каждой должности две разные кандидатуры; имена, роли и предложения детерминированы', async () => {
  for (const diff of ['debut', 'coalition', 'crisis', 'ruins'] as const) for (const seed of [1, 3, 7, 19]) {
    const state = await fresh(seed, diff), before = structuredClone(state), pool = cabinetCandidates(state);
    assert.equal(pool.length, 8);
    assert.deepEqual(pool, cabinetCandidates(reload(state)));
    assert.equal(new Set(pool.map(person => person.name)).size, 8);
    for (const role of ADVISOR_ROLES) {
      const candidates = pool.filter(person => person.seat === role.id);
      assert.equal(candidates.length, 2);
      assert.equal(new Set(candidates.map(person => person.channel)).size, 2);
      for (const candidate of candidates) {
        assert.ok(!state.advisors.some(person => person.name === candidate.name));
        if (role.id === 'security') assert.equal(isFemaleName(candidate.name), false);
        assert.doesNotMatch(candidate.bio, /\{[^}]+\}/);
      }
    }
    assert.deepEqual(state, before, 'чтение не меняет мир');
  }
});

test('увольнение без замены: цена заранее, вакансия, отсутствие голоса/утечек и неизвестный прогноз', async () => {
  const state = await nextCase(await fresh());
  const economist = state.advisors.find(person => person.id === 'economist')!;
  const action = { kind: 'dismiss' as const, seat: economist.id, name: economist.name };
  const preview = cabinetPreview(state, action), before = structuredClone(state);
  const empty = reload(applyCabinetAction(state, action));
  assert.equal(empty.advisors.length, 3);
  assert.ok(empty.former?.includes(economist.name));
  assert.deepEqual(empty.cabinet!.departed[0], economist);
  for (const key of RESOURCE_KEYS) assert.equal(empty.resources[key], state.resources[key] + (preview.cost[key] ?? 0));
  for (const faction of state.factions) assert.equal(empty.factions.find(item => item.id === faction.id)!.relation,
    faction.relation + (preview.reactions.find(item => item.id === faction.id)?.delta ?? 0));
  const choice = empty.currentEvent!.choices[0];
  assert.equal(advisorOutlook(empty, choice)!.success.resources.economy.text, '?');
  assert.equal(advisorOutlook(empty, choice)!.risk.text, '?');
  assert.ok(!advisorDialogue(empty, choice).some(line => line.source.id === 'economist'));
  assert.throws(() => applyCabinetAction(empty, action), /Состав команды изменился/);
  assert.deepEqual(state, before);
  const filled = reload(hire(empty, 'economist'));
  assert.equal(filled.advisors.length, 4);
  assert.notEqual(filled.advisors.find(person => person.id === 'economist')!.name, economist.name);
  assert.notEqual(advisorOutlook(filled, choice)!.success.resources.economy.text, '?');
});

test('последовательные назначения не перегенерируют резерв; повторный указ и нехватка ресурсов безопасны', async () => {
  const state = await fresh(), pool = cabinetCandidates(state), candidate = pool[0];
  const action = { kind: 'hire' as const, candidate: candidate.id };
  const first = applyCabinetAction(state, action);
  assert.equal(cabinetCandidates(first).length, 8);
  assert.deepEqual(cabinetCandidates(first).filter(person => pool.some(old => old.id === person.id)), pool.slice(1));
  assert.throws(() => applyCabinetAction(first, action));
  const second = cabinetCandidates(first).find(person => person.seat !== candidate.seat)!;
  assert.equal(cabinetPreview(first, { kind: 'hire', candidate: second.id }).cost.politicalCapital,
    (second.cost.politicalCapital ?? 0) - 4);
  const next = applyCabinetAction(first, { kind: 'hire', candidate: second.id });
  assert.equal(next.cabinet!.changes, 2);
  assert.deepEqual(cabinetCandidates(reload(next)).filter(person => pool.some(old => old.id === person.id)),
    pool.filter(person => ![candidate.id, second.id].includes(person.id)));
  const poor = { ...state, resources: { ...state.resources, politicalCapital: 5 } }, copy = structuredClone(poor);
  assert.throws(() => applyCabinetAction(poor, action), /Не хватает/);
  assert.deepEqual(poor, copy);
  const later = { ...next, turn: next.turn + 1 };
  assert.equal(cabinetPreview(later, { kind: 'hire', candidate: pool[1].id }).cost.politicalCapital,
    (pool[1].cost.politicalCapital ?? 0) - 2);
});

test('состав может быть пустым: сохранение, дело, подпись и досье не получают выдуманного советника', async () => {
  let state = await nextCase(await fresh(3));
  for (const role of ADVISOR_ROLES) state = dismiss(state, role.id);
  state = reload(state);
  assert.equal(state.advisors.length, 0);
  for (let i = 0; i < 4 && !state.ended; i++) {
    state = await signChoice(state, state.currentEvent!.choices[0].id);
    if (!state.ended) state = await nextCase(state);
    state = reload(state);
  }
  const withEconomist = hire(state, 'economist');
  assert.match(dossierBlocked(withEconomist, 'economist', 'collect') ?? '', /безопасности|квартале/);
  assert.equal(governmentActions({ ...state, advisors: [] }).some(action => action.id.startsWith('government:start:')), false);
});

test('вакантный координатор не исполняет лучше слабого; действующие договорные суммы известны', async () => {
  const state = await nextCase(await fresh()), choice = state.currentEvent!.choices[1];
  const weak = { ...state, advisors: state.advisors.map(person => ({ ...person, skill: 1 as const, loyalty: 70 })) };
  const empty = { ...weak, advisors: [] };
  assert.equal(successChance(weak, choice), successChance(empty, choice));
  const outlook = advisorOutlook(empty, choice)!;
  assert.equal(outlook.risk.text, '?');
  for (const effect of outlook.later) if (effect.payment) assert.notEqual(effect.resources.economy?.text, '?');
});

test('уход антагониста сохраняет имя, флаги и прошлые доклады, не назначает интригу преемнику', async () => {
  const state = await fresh(), advisor = state.advisors.find(person => person.id === 'security')!;
  const plotted = { ...state, turn: 22, arc: { id: 'mole', target: advisor.name, targetRole: advisor.role,
    flags: ['known'], done: [1], epilogue: null } };
  const empty = dismiss(plotted, advisor.id), filled = hire(empty, advisor.id);
  assert.equal(filled.arc!.target, advisor.name);
  assert.match(filled.arc!.targetRole, /^Бывший/);
  assert.deepEqual(filled.arc!.flags, ['known']);
  assert.deepEqual(filled.arc!.done, [1]);
  assert.notEqual(filled.advisors.find(person => person.id === advisor.id)!.name, filled.arc!.target);
  assert.deepEqual(filled.history, plotted.history);
  reload(filled);
});

test('передача программы сохраняет прогресс, срок, расходы; штраф действует один квартал', async () => {
  let state = await fresh();
  for (let turn = 0; turn < 5; turn++) state = await signChoice(await nextCase(state), 'a');
  state = await nextCase(state);
  assert.ok(state.world?.government);
  const program = state.world.government.programs.find(program => program.id === 'exports')!;
  const old = state.advisors.find(person => person.id === 'diplomat')!;
  Object.assign(program, { status: 'running', progress: 20, coordinator: old.id, name: old.name, started: 5, due: 9 });
  const empty = dismiss(state, 'diplomat');
  const paused = structuredClone(empty.world!);
  stepGovernment(empty, paused, 6);
  assert.equal(paused.government!.programs.find(program => program.id === 'exports')!.progress, 20);
  const dispatch = paused.dispatches.find(report => report.id === '6:government:exports')!;
  assert.match(dispatch.text, /Канцелярия: координатор не назначен/);
  assert.ok(!dispatch.text.includes(old.name));
  const filled = reload(hire(empty, 'diplomat')), after = filled.world!.government!.programs.find(program => program.id === 'exports')!;
  assert.equal(after.progress, 20); assert.equal(after.due, 9); assert.equal(after.started, 5);
  assert.equal(after.name, filled.advisors.find(person => person.id === 'diplomat')!.name);
  for (const turn of [6, 7]) {
    const actual = structuredClone(filled.world!), normal = structuredClone(filled.world!);
    delete normal.government!.programs.find(program => program.id === 'exports')!.handoverTurn;
    stepGovernment(filled, actual, turn); stepGovernment(filled, normal, turn);
    const result = actual.government!.programs.find(program => program.id === 'exports')!;
    assert.equal(normal.government!.programs.find(program => program.id === 'exports')!.progress - result.progress, turn === 6 ? 5 : 0);
  }
  assert.equal(state.world.government.programs.find(program => program.id === 'exports')!.name, old.name);
});

test('архив, Daily и завершённая партия не допускают новый кадровый указ', async () => {
  const state = await fresh(), action = { kind: 'dismiss' as const, seat: state.advisors[0].id, name: state.advisors[0].name };
  for (const closed of [{ ...state, country: 'Украина' }, { ...state, daily: '2026-11-11' }, { ...state, ended: true }]) {
    const before = structuredClone(closed);
    assert.throws(() => applyCabinetAction(closed, action));
    assert.deepEqual(closed, before);
  }
});

test('жильё получает преемника и явный доклад; вакансия не сдвигает срок и не ведёт работу', async () => {
  let state = await fresh();
  for (let turn = 0; turn < 5; turn++) state = await signChoice(await nextCase(state), 'a');
  state = await nextCase(state);
  const old = state.advisors.find(person => person.id === 'economist')!;
  Object.assign(state.world!.government!.programs.find(program => program.id === 'housing')!, {
    status: 'completed', progress: 100, coordinator: old.id, name: old.name, started: 0, due: 4, reviewed: true,
  });
  state.world!.government!.housingNext = { mode: 'settle', status: 'running', originProgress: 100,
    previousName: old.name, progress: 20, started: 4, due: 8, coordinator: old.id, name: old.name, reviewed: false, factors: [] };
  const empty = dismiss(state, old.id);
  assert.match(empty.world!.government!.housingNext!.factors[0], /вакантно/);
  const paused = structuredClone(empty.world!);
  stepHousingNext(empty, paused, 6);
  assert.equal(paused.government!.housingNext!.progress, 20);
  assert.equal(paused.government!.housingNext!.due, 8);
  assert.match(paused.dispatches.at(-1)!.text, /Канцелярия: координатор не назначен/);
  assert.ok(!paused.dispatches.at(-1)!.text.includes(old.name));
  const filled = reload(hire(empty, old.id)), project = filled.world!.government!.housingNext!;
  assert.match(project.factors[0], /принимает/);
  assert.equal(project.previousName, old.name);
  assert.equal(project.name, filled.advisors.find(person => person.id === old.id)!.name);
  for (const turn of [6, 7]) {
    const actual = structuredClone(filled.world!), normal = structuredClone(filled.world!);
    delete normal.government!.housingNext!.handoverTurn;
    stepHousingNext(filled, actual, turn); stepHousingNext(filled, normal, turn);
    assert.equal(normal.government!.housingNext!.progress - actual.government!.housingNext!.progress, turn === 6 ? 5 : 0);
  }
  assert.equal(validHousingNext({ ...project, handoverTurn: 99 }, 8), false);
});

test('три найма в одну должность оставляют две альтернативы без повторного найма прежних людей', async () => {
  let state = await fresh(19);
  const names = new Set(state.advisors.map(person => person.name));
  for (let i = 0; i < 3; i++) {
    const candidate = cabinetCandidates(state, 'economist')[0];
    assert.ok(!names.has(candidate.name));
    names.add(candidate.name);
    state = reload(applyCabinetAction(state, { kind: 'hire', candidate: candidate.id }));
    assert.equal(cabinetCandidates(state, 'economist').length, 2);
    assert.ok(cabinetCandidates(state).every(person => !names.has(person.name)));
  }
});

test('проверка сохранения отвергает повреждённые новые записи и принимает старые без них', async () => {
  const old = await fresh(); reload(old);
  const state = hire(old, 'economist');
  assert.equal(validCabinet(state.cabinet, state.turn), true);
  for (const corrupt of [
    { ...state.cabinet!, year: 999 }, { ...state.cabinet!, changedTurn: -1 }, { ...state.cabinet!, roster: [] },
    { ...state.cabinet!, departed: [{ id: 'x' }] },
    { ...state.cabinet!, roster: state.cabinet!.roster.map((candidate, i) => i ? candidate : { ...candidate, skill: 8 }) },
  ]) {
    assert.equal(validCabinet(corrupt, state.turn), false);
    assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: { ...state, cabinet: corrupt } })), null);
  }
});
