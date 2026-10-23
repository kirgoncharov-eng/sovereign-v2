import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetChoice, classicApi } from './classic.ts';
import { BUDGET_ITEMS } from '../content/budget.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { RESOURCE_KEYS, SAVE_VERSION } from './data.ts';
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { interveneWorld, livingActions, openLivingWorld } from './living-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { parseSave } from '../client/save.ts';
import { resourceDetail } from '../client/resource-detail.ts';
import { prepareQuarterResolution } from '../client/quarter-inbox.ts';
import { openDeskWhenDue } from './desk-timing.ts';
import { botTurn } from '../../scripts/bot.ts';
import { confirmInitiative, initiativeOptions, interventionUsed, validInitiatives } from './initiatives.ts';
import type { InitiativeId } from './initiatives.ts';
import type { GameEvent, GameState, Narration } from './types.ts';

const narration: Narration = { headline: 'Итог', narrative: 'Доклад', reactions: [], historianNote: 'Запись',
  crisisTitle: null, crisisDescription: null, powerLoss: null };
const calm: GameEvent = { title: 'Текущая переписка', source: 'Канцелярия', description: '', isCritical: false,
  affectedFactions: [], randomEvent: null, choices: [{ id: 'quiet', text: 'Принять к сведению', hint: '', tags: [], resolvesCrisis: null }, { id: 'other', text: 'Отложить', hint: '', tags: [], resolvesCrisis: null }] };
async function fresh(seed = 2): Promise<GameState> {
  let gs = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed), seededRandom(seed));
  gs = startEvent(gs, await classicApi.event(gs));
  const id = gs.currentEvent!.choices[0].id;
  gs = resolveTurn(gs, id, await classicApi.consequence(gs, id));
  return { ...gs, resources: Object.fromEntries(RESOURCE_KEYS.map(k => [k, 60])) as GameState['resources'],
    factions: gs.factions.map(f => ({ ...f, relation: 30 })), keyFigures: gs.keyFigures.map(f => ({ ...f, relation: 30 })),
    advisors: gs.advisors.map(a => ({ ...a, loyalty: 100 })), currentEvent: calm, activeCrises: [], pending: [] };
}
const option = (gs: GameState, id: InitiativeId) => initiativeOptions(gs).find(o => o.id === id)!;
const step = (gs: GameState) => resolveTurn({ ...gs, currentEvent: calm }, 'quiet', narration);
function reload(gs: GameState) {
  const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: gs }));
  assert.ok(saved, 'подписанная мера должна загружаться');
  return saved.state;
}
function desk(gs: GameState) {
  const first = gs.history[0];
  return openLivingWorld({ ...gs, history: [...gs.history, ...['alt_fuel', 'alt_district'].map(id => ({
    ...first, title: ALTERNATE_EVENTS.find(e => e.id === id)!.title,
  }))] });
}

test('после первого решения доступны восемь вариантов шести опор, без создания стола', async () => {
  const gs = await fresh();
  assert.equal(gs.world, undefined);
  assert.equal(initiativeOptions(gs).length, 8);
  assert.equal(option({ ...gs, turn: 0 }, 'advance:domestic').blocked?.code, 'first_decision');
  assert.throws(() => confirmInitiative({ ...gs, turn: 0 }, 'advance:domestic'), /first_decision/);
  assert.throws(() => confirmInitiative(gs, 'support:ruling'));
  for (const resource of RESOURCE_KEYS) for (const value of [21, 10]) {
    const state = { ...gs, resources: { ...gs.resources, [resource]: value } };
    const options = initiativeOptions(state, resource);
    assert.ok(options.length);
    const available = options.find(o => !o.blocked)!;
    assert.ok(available, `${resource}:${value}`);
    const after = confirmInitiative(state, available.id);
    for (const key of RESOURCE_KEYS) assert.equal(after.resources[key] - state.resources[key], available.immediate[key] ?? 0);
  }
});

test('подпись чистая, сохраняет дело и резолюцию, а прогноз показывает clamp100', async () => {
  const gs = prepareQuarterResolution(await fresh(), 'quiet');
  const before = JSON.stringify(gs);
  const signed = confirmInitiative(gs, 'advance:domestic');
  assert.equal(JSON.stringify(gs), before);
  assert.equal(signed.turn, gs.turn);
  assert.equal(signed.currentEvent, gs.currentEvent);
  assert.equal(signed.quarterDraft, gs.quarterDraft);
  assert.equal(signed.lastTurn, gs.lastTurn, 'не переписываем прошлую газету');
  assert.throws(() => confirmInitiative(signed, 'advance:domestic'), /intervention_used/);
  const high = { ...gs, resources: { ...gs.resources, economy: 98 } };
  assert.equal(option(high, 'advance:domestic').immediate.economy, 2);
  assert.equal(confirmInitiative(high, 'advance:domestic').resources.economy, 100);
  assert.equal(option({ ...high, resources: { ...high.resources, economy: 100 } }, 'advance:domestic').blocked?.code, 'no_gain');
});

test('финансовый резерв общий для трёх авансов; смена человека и перезагрузка его не восстанавливают', async () => {
  const gs = await fresh();
  for (const id of ['advance:domestic', 'advance:russia', 'advance:west'] as const) {
    let signed = reload(confirmInitiative(gs, id));
    signed = step(signed);
    for (const other of ['advance:domestic', 'advance:russia', 'advance:west'] as const) {
      assert.equal(option(signed, other).blocked?.code, 'reserve_used');
    }
    assert.equal(signed.initiatives!.signed.length, 1);
    assert.equal(option({ ...signed, keyFigures: signed.keyFigures.map(f => ({ ...f, name: 'Новый представитель' })) }, id).reserveRemaining, 0);
  }
});

test('каждый из шести резервов конечен в сроке; новый срок не стирает историю и старые обязательства', async () => {
  let gs = await fresh();
  for (const id of ['advance:domestic', 'support:regional', 'garrison', 'settlement', 'payments', 'delegate'] as const) {
    gs = step(confirmInitiative(gs, id));
    assert.equal(option(gs, id).blocked?.code, 'reserve_used');
  }
  assert.equal(gs.initiatives!.signed.length, 6);
  const nextTerm = { ...gs, turn: 20 };
  assert.equal(option(nextTerm, 'payments').reserveRemaining, 1);
  assert.equal(option(confirmInitiative(nextTerm, 'payments'), 'payments').reserveRemaining, 0);
  assert.equal(nextTerm.initiatives!.signed.length, 6);
});

test('квота общая в обе стороны, в том числе до открытия стола; старый world.lastActionTurn действует', async () => {
  const gs = await fresh();
  const early = confirmInitiative(gs, 'delegate');
  const opened = desk(early);
  assert.ok(opened.world);
  assert.equal(opened.initiatives, early.initiatives);
  assert.equal(interventionUsed(opened), true);
  const action = livingActions(opened).find(a => !a.id.startsWith('secretary:'))!;
  assert.ok(action.blocked?.includes('уже использовано'));
  assert.throws(() => interveneWorld(opened, action.id));
  const originalDesk = desk(gs);
  const first = livingActions(originalDesk).find(a => !a.blocked && !a.id.startsWith('secretary:'))!;
  const acted = interveneWorld(originalDesk, first.id);
  assert.equal(acted.initiatives, undefined);
  assert.equal(option(acted, 'delegate').blocked?.code, 'intervention_used');
  assert.throws(() => confirmInitiative(acted, 'delegate'), /intervention_used/);
  assert.equal(option(step(acted), 'delegate').blocked, null);
});

test('порог4 и переход через20 блокируются; при уже низком платимом ресурсе цена остаётся возможной', async () => {
  const gs = await fresh();
  for (const [economy, code] of [[0, 'resource_floor'], [9, 'resource_floor'], [21, 'resource_threshold']] as const) {
    const s = { ...gs, resources: { ...gs.resources, economy } };
    assert.equal(option(s, 'payments').blocked?.code, code);
    assert.throws(() => confirmInitiative(s, 'payments'), new RegExp(code));
  }
  const low = { ...gs, resources: { ...gs.resources, economy: 10 } };
  assert.equal(option(low, 'payments').blocked, null);
  assert.equal(confirmInitiative(low, 'payments').resources.economy, 5);
});

test('исполнители реальны; внутренний аванс и снабжение не требуют дружбы с антагонистом/силовой фигурой', async () => {
  const gs = await fresh();
  assert.equal(option(gs, 'advance:domestic').actor?.id, 'economist');
  assert.equal(option(gs, 'garrison').actor?.id, 'security');
  const hostileFigure = { ...gs, keyFigures: gs.keyFigures.map(f => ({ ...f, relation: -99 })) };
  assert.equal(option(hostileFigure, 'advance:domestic').blocked, null);
  assert.equal(option(hostileFigure, 'garrison').blocked, null);
  assert.equal(option(hostileFigure, 'advance:russia').blocked?.code, 'partner_refuses');
  assert.equal(option({ ...gs, advisors: [] }, 'payments').blocked?.code, 'actor_missing');
  assert.equal(option({ ...gs, keyFigures: [] }, 'advance:west').blocked?.code, 'actor_missing');
});

test('снабжение не создаёт переворот при силовом предупреждении; внешняя цена совпадает с прогнозом', async () => {
  const gs = await fresh();
  for (const relation of [-55, -70, -80]) {
    const state = { ...gs, turn: 3, resources: { ...gs.resources, military: 35 },
      factions: gs.factions.map(f => f.bloc === 'security' ? { ...f, relation } : f) };
    assert.equal(option(state, 'garrison').blocked?.code, 'security_warning');
    assert.throws(() => confirmInitiative(state, 'garrison'));
  }
  for (const id of ['advance:russia', 'advance:west'] as const) {
    const offer = option(gs, id), after = confirmInitiative(gs, id);
    for (const faction of after.factions) assert.equal(faction.relation - gs.factions.find(f => f.id === faction.id)!.relation,
      offer.factionChanges[faction.id] ?? 0);
    assert.equal(after.resources.personalResource, 58);
  }
});

test('аванс: подпись → reload → due, долг применяется один раз и заранее виден вместе с бюджетным', async () => {
  let gs = { ...await fresh(), turn: 7 };
  const budget = budgetChoice(gs, Object.fromEntries(BUDGET_ITEMS.map((item, i) => [item.id, i < 3 ? 3 : 2])), true);
  gs = { ...gs, currentEvent: { ...calm, choices: [budget, calm.choices[0]] } };
  gs = reload(confirmInitiative(gs, 'advance:domestic'));
  gs = reload(resolveTurn(gs, budget.id, narration));
  const budgetId = gs.pending.find(p => p.id !== gs.initiatives!.signed[0].repaymentId)!.id;
  const id = gs.initiatives!.signed[0].repaymentId!;
  assert.equal(gs.pending.find(p => p.id === id)!.due, 11);
  assert.ok(resourceDetail(gs, 'economy').upcoming.some(p => p.delta === -10));
  assert.ok(resourceDetail(gs, 'economy').upcoming.some(p => p.delta === -6));
  while (gs.turn < 10) {
    gs = reload(step(gs));
    assert.ok(gs.pending.some(p => p.id === id));
  }
  const plan = planTurn({ ...gs, currentEvent: calm }, 'quiet');
  assert.deepEqual(plan.matured.map(p => p.id).sort(), [budgetId, id].sort());
  assert.equal(plan.matured.reduce((sum, p) => sum + (p.res.economy ?? 0), 0), -16);
  gs = reload(step(gs));
  assert.ok(!gs.pending.some(p => p.id === id));
  assert.equal(planTurn({ ...gs, currentEvent: calm }, 'quiet').matured.some(p => p.id === id), false);
});

test('долг не теряется при переполнении очереди; бюджетные последствия сохраняют прежние слоты', async () => {
  let gs = confirmInitiative(await fresh(), 'advance:domestic');
  const id = gs.initiatives!.signed[0].repaymentId!;
  gs = { ...gs, pending: [...gs.pending, ...Array.from({ length: 8 }, (_, i) => ({ id: `ordinary${i}`, due: 10,
    label: 'Обязательство', source: 'Дело', res: { economy: -1 } }))] };
  gs = reload(step(gs));
  assert.equal(gs.pending.length, 9);
  assert.ok(gs.pending.some(p => p.id === id));
  for (let i = 0; i < 8; i++) assert.ok(gs.pending.some(p => p.id === `ordinary${i}`));
});

test('платёж на20 допускается, на21 запрещён; путь продолжения не обходит конец срока', async () => {
  const gs = await fresh();
  assert.equal(option({ ...gs, turn: 16 }, 'advance:domestic').repayment?.due, 20);
  assert.equal(option({ ...gs, turn: 16 }, 'advance:domestic').blocked, null);
  for (const path of [null, { id: 'dictatorship' as const, turn: 17 }, { id: 'run' as const, turn: 17 }]) {
    const late = { ...gs, turn: 17, path };
    assert.equal(option(late, 'advance:domestic').blocked?.code, 'repayment_after_term');
    assert.throws(() => confirmInitiative(late, 'advance:domestic'));
  }
});

test('пакт: нет дохода в квартале подписи, три следующих выплаты; запреты и разрыв прежние', async () => {
  const gs = await fresh();
  const signed = reload(confirmInitiative(gs, 'support:regional'));
  const pact = signed.pacts![0];
  const label = `союз с «${gs.factions.find(f => f.id === pact.faction)!.name}»`;
  assert.equal(planTurn(signed, 'quiet').sources.politicalCapital?.some(([source]) => source === label), false);
  let state = step(signed);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(planTurn({ ...state, currentEvent: calm }, 'quiet').sources.politicalCapital?.find(([source]) => source === label), [label, 2]);
    state = reload(step(state));
  }
  assert.equal(state.pacts!.length, 0);
  const breach = { ...signed, currentEvent: { ...calm, choices: [{ ...calm.choices[0], tags: [pact.ban[0]] }] } };
  const plan = planTurn(breach, 'quiet');
  assert.equal(plan.pacts.length, 0);
  assert.equal(plan.betrayals, (gs.betrayals ?? 0) + 1);
  assert.equal(plan.pactNews.broken.length, 1);
  assert.equal(option({ ...gs, pacts: [pact] }, 'support:regional').blocked?.code, 'pact_exists');
  assert.equal(option({ ...gs, pacts: [{ ...pact, faction: 'one' }, { ...pact, faction: 'two' }] }, 'support:regional').blocked?.code, 'pact_limit');
});

test('источник инициативы относится к текущей газете, без повторной цены в следующей', async () => {
  const gs = await fresh();
  const signed = confirmInitiative(gs, 'payments');
  const result = step(signed);
  assert.deepEqual(result.prevResources, gs.resources);
  assert.ok(result.lastTurn!.sources!.internalLegitimacy!.some(([label, delta]) => label === 'Резерв срочных выплат' && delta === 6));
  assert.ok(!step(result).lastTurn!.sources!.internalLegitimacy?.some(([label]) => label === 'Резерв срочных выплат'));
});

test('старое открытое дело загружается; повреждённые резервы или потерянный долг не обнуляются молча', async () => {
  const gs = await fresh();
  assert.deepEqual(reload(gs).currentEvent, gs.currentEvent);
  assert.equal(reload(gs).initiatives, undefined);
  const signed = confirmInitiative(gs, 'advance:domestic');
  assert.equal(validInitiatives(signed.initiatives, signed), true);
  for (const state of [
    { ...signed, pending: [] },
    { ...signed, initiatives: { ...signed.initiatives!, lastActionTurn: null } },
    { ...signed, initiatives: { ...signed.initiatives!, signed: [...signed.initiatives!.signed, signed.initiatives!.signed[0]] } },
    { ...signed, initiatives: { ...signed.initiatives!, signed: [{ ...signed.initiatives!.signed[0], turn: 2 }] } },
  ]) assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state })), null);
});

test('архив и Daily не активируют меры, сервис подтверждения отказывает', async () => {
  const gs = await fresh();
  for (const state of [...LEGACY_COUNTRIES.map(country => ({ ...gs, country })), { ...gs, daily: '2026-10-23' }]) {
    const before = JSON.stringify(state);
    assert.deepEqual(initiativeOptions(state), []);
    assert.throws(() => confirmInitiative(state, 'payments'));
    assert.equal(JSON.stringify(state), before);
  }
});

test('инициативы в настоящих партиях трёх сложностей детерминированы и переживают reload каждого дела', async () => {
  async function campaign(diff: 'debut' | 'coalition' | 'crisis', seed: number) {
    let gs = createInitialState(ALTERNATE_COUNTRY, diff, 'pragmatist',
      await classicApi.setup(ALTERNATE_COUNTRY, diff, 'pragmatist', seed), seededRandom(seed));
    while (!gs.ended && gs.turn < 20) {
      gs = openDeskWhenDue(gs);
      gs = startEvent(gs, await classicApi.event(gs));
      const offers = initiativeOptions(gs).filter(o => !o.blocked && gs.resources[o.resource] <= 35)
        .sort((a, b) => gs.resources[a.resource] - gs.resources[b.resource]);
      if (offers.length) gs = reload(confirmInitiative(gs, offers[0].id));
      const move = botTurn(gs, 'honest');
      gs = reload(resolveTurn(move.state, move.choice.id, await classicApi.consequence(move.state, move.choice.id)));
    }
    return gs;
  }
  let signatures = 0;
  for (const diff of ['debut', 'coalition', 'crisis'] as const) for (const seed of [2, 12]) {
    const first = await campaign(diff, seed), second = await campaign(diff, seed);
    assert.deepEqual(second, first, `${diff}/${seed}`);
    signatures += first.initiatives?.signed.length ?? 0;
  }
  assert.ok(signatures > 0, 'прогон действительно использовал меры');
});
