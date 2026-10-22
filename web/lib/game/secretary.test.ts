import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { createInitialState, hashSeed, leakingAdvisors, planTurn, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { openDeskWhenDue } from './desk-timing.ts';
import { interveneWorld, openLivingWorld } from './living-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import { candidatePool, hireAdvisor } from './staffing.ts';
import { presidentialMessages } from '../client/presidential-inbox.ts';
import { actSecretary, ensureSecretary, finishSecretaryTurn, gossipConfirmed, pendingSecretaryFavor, secretaryActions,
  secretaryAvailable, secretaryInventory, secretaryPreventsLeak, secretarySurname, secretaryDueEffects, validSecretary } from './secretary.ts';
import type { FavorId, SecretaryState } from './secretary.ts';
import type { DifficultyId, GameState } from './types.ts';

async function fresh(seed = 2, country = ALTERNATE_COUNTRY, diff: DifficultyId = 'coalition') {
  return createInitialState(country, diff, 'pragmatist', await classicApi.setup(country, diff, 'pragmatist', seed), seededRandom(seed));
}

// Explicitly opened programmes provide isolated character tests; they do not model natural unlock timing.
async function fixture(seed = 2, diff: DifficultyId = 'coalition') {
  let gs = await fresh(seed, ALTERNATE_COUNTRY, diff);
  gs = startEvent(gs, await classicApi.event(gs));
  const first = resolveTurn(gs, gs.currentEvent!.choices[0].id, await classicApi.consequence(gs, gs.currentEvent!.choices[0].id)).history[0];
  gs = { ...gs, turn: 5, resources: Object.fromEntries(Object.keys(gs.resources).map(k => [k, 80])) as GameState['resources'],
    history: [...gs.history, ...['alt_fuel', 'alt_district'].map(id => ({ ...first, title: ALTERNATE_EVENTS.find(e => e.id === id)!.title }))] };
  return ensureSecretary(openLivingWorld(gs));
}

function offer(gs: GameState, id: FavorId): GameState {
  const secretary = structuredClone(gs.world!.secretary!);
  secretary.favors = [{ id, offered: gs.turn, answer: null, answered: null, outcome: null }];
  return { ...gs, world: { ...gs.world!, secretary } };
}

test('секретарь появляется с папкой после пяти решений, не меняет архив и Daily', async () => {
  let state = await fresh(3);
  for (let turn = 0; turn < 5; turn++) {
    state = openDeskWhenDue(state);
    state = startEvent(state, await classicApi.event(state));
    assert.equal(state.world?.secretary, undefined);
    const choice = state.currentEvent!.choices[0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  state = openDeskWhenDue(state);
  assert.ok(state.world?.secretary);
  const before = JSON.stringify(state);
  const first = startEvent(state, await classicApi.event(state));
  assert.equal(JSON.stringify(state), before, 'event preparation is immutable');
  assert.equal(first.turn, 5);
  assert.deepEqual(ensureSecretary(first), first, 'reading cannot reroll the character');
  assert.ok(secretaryInventory(first)?.includes(first.world!.secretary!.name));
  for (const country of LEGACY_COUNTRIES) {
    const legacy = { ...await fresh(3, country), turn: 12 };
    assert.equal(ensureSecretary(legacy), legacy);
  }
  const daily = { ...await fixture(), daily: '2026-10-22' };
  assert.equal(ensureSecretary(daily), daily);
  assert.deepEqual(secretaryActions(daily), []);
  assert.equal(secretaryInventory(daily), null);
});

test('имя женщины корректно и не повторяет фамилий кабинета на 60 зёрнах трёх сложностей', async () => {
  for (const diff of ['debut', 'coalition', 'crisis'] as const) for (let seed = 1; seed <= 60; seed++) {
    const gs = await fixture(seed, diff);
    const s = gs.world!.secretary!;
    assert.match(s.name, /^(Нина|Вера|Ольга|Лидия) /);
    assert.doesNotMatch(s.name, / (Яровой|Луговой|[А-ЯЁа-яё]+ский|[А-ЯЁа-яё]+ин)$/);
    const others = [gs.leader.name, ...gs.advisors.map(p => p.name), ...gs.keyFigures.map(p => p.name),
      ...gs.world!.people.map(p => p.name), gs.arc!.target];
    assert.ok(!others.some(name => secretarySurname(name) === secretarySurname(s.name)), `${seed}/${diff}/${s.name}`);
    assert.ok(validSecretary(s, gs.turn));
  }
});

test('ответ сохраняется, стоит ресурсов один раз, не двигает ход, квоту и черновик', async () => {
  const gs = offer(await fixture(), 'nephew');
  gs.quarterDraft = { turn: gs.turn, event: gs.currentEvent!.title, move: { id: gs.currentEvent!.choices[0].id } };
  const before = structuredClone(gs);
  const next = interveneWorld(gs, 'secretary:favor:nephew:grant');
  assert.deepEqual(gs, before);
  assert.equal(next.resources.politicalCapital, gs.resources.politicalCapital - 1);
  assert.equal(next.turn, gs.turn);
  assert.deepEqual(next.quarterDraft, gs.quarterDraft);
  assert.equal(next.world!.lastActionTurn, gs.world!.lastActionTurn);
  assert.equal(next.world!.secretary!.trust, 1);
  assert.throws(() => actSecretary(next, 'secretary:favor:nephew:grant'));
  const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: next }));
  assert.ok(saved);
  assert.deepEqual(saved.state, JSON.parse(JSON.stringify(next)));
  assert.deepEqual(ensureSecretary(saved.state), saved.state);
  assert.equal(presidentialMessages(next).find(m => m.action === 'secretary')?.needsReply, false);
  const poor = { ...gs, resources: { ...gs.resources, politicalCapital: 5 } };
  assert.throws(() => actSecretary(poor, 'secretary:favor:nephew:grant'));
  assert.ok(secretaryActions(poor).find(a => a.id.endsWith(':refuse'))?.blocked === null);
});

test('отказы различаются по доверию; отгул и увольнение отключают нужные строки', async () => {
  const gs = await fixture();
  gs.world!.secretary!.trust = 2;
  const dubious = actSecretary(offer(gs, 'archiveKey'), 'secretary:favor:archiveKey:refuse');
  assert.equal(dubious.world!.secretary!.trust, 2);
  const refused = actSecretary(offer(gs, 'leave'), 'secretary:favor:leave:refuse');
  assert.equal(refused.world!.secretary!.trust, 1);
  const leave = actSecretary(offer(gs, 'leave'), 'secretary:favor:leave:grant');
  const absent = ensureSecretary({ ...leave, turn: leave.turn + 1 });
  assert.equal(secretaryAvailable(absent), false);
  assert.equal(secretaryInventory(absent), null);
  assert.equal(absent.world!.secretary!.gossip, null);
  assert.equal(secretaryAvailable({ ...absent, turn: absent.turn + 1 }), true);
  const left = actSecretary(offer(gs, 'herSeat'), 'secretary:favor:herSeat:refuse');
  assert.equal(left.world!.secretary!.present, false);
  assert.equal(secretaryActions(left).length, 0);
  assert.match(secretaryInventory(left)!, /канцелярия/);
});

test('просьбы и сцены детерминированы, не повторяются и не возникают раньше своих условий', async () => {
  let gs = await fixture(7);
  const ids: FavorId[] = [];
  for (let turn = 5; turn < 20; turn++) {
    gs = ensureSecretary({ ...gs, turn });
    const f = pendingSecretaryFavor(gs);
    if (f) {
      assert.ok(turn >= 6);
      assert.ok(!ids.includes(f.id));
      assert.notEqual(f.id, 'sister', 'housing was not started');
      assert.notEqual(f.id, 'archiveKey', 'archive episode was not signed');
      assert.ok(f.id !== 'leave' || turn >= 9);
      assert.ok(f.id !== 'herSeat' || turn >= 15);
      ids.push(f.id);
      gs = actSecretary(gs, `secretary:favor:${f.id}:grant`);
    }
    const serialized = JSON.parse(JSON.stringify(gs));
    assert.deepEqual(ensureSecretary(serialized), gs);
  }
  assert.ok(ids.length >= 3);
  assert.equal(new Set(gs.world!.secretary!.seenScenes).size, gs.world!.secretary!.seenScenes.length);
});

test('правдивые сплетни проверяются по состоянию, а неверное имя помечено в данных', async () => {
  let truths = 0, mistakes = 0;
  for (let seed = 1; seed <= 30; seed++) {
    let gs = await fixture(seed);
    gs.advisors = gs.advisors.map((a, i) => ({ ...a, loyalty: i === 0 ? 10 : 80 }));
    for (let turn = 6; turn < 12; turn++) {
      gs = ensureSecretary({ ...gs, turn });
      const g = gs.world!.secretary!.gossip;
      if (!g) continue;
      assert.equal(gossipConfirmed(gs, g), g.truthful);
      if (g.truthful) truths++; else { mistakes++; assert.equal(g.source, 'mistake'); }
    }
  }
  assert.ok(truths > 0 && mistakes > 0);
});

test('директор передаёт ложь через архив; проверка раскрывает и закрывает канал', async () => {
  let gs = actSecretary(offer(await fixture(), 'archiveKey'), 'secretary:favor:archiveKey:grant');
  gs.advisors = gs.advisors.map(a => ({ ...a, loyalty: 80 }));
  gs.world!.secretary!.lastGossipTurn = null;
  for (let turn = gs.turn + 1; turn < 20; turn++) {
    gs = ensureSecretary({ ...gs, turn });
    if (gs.world!.secretary!.gossip?.source === 'director') break;
  }
  const g = gs.world!.secretary!.gossip!;
  assert.equal(g.source, 'director');
  assert.equal(g.truthful, false);
  assert.equal(gossipConfirmed(gs, g), false);
  const checked = actSecretary(gs, 'secretary:verify');
  assert.equal(checked.world!.secretary!.channelExposed, true);
  assert.equal(checked.world!.secretary!.planted, false);
  assert.match(checked.world!.secretary!.receipt!, /директору/);
  assert.throws(() => actSecretary(checked, 'secretary:verify'));
});

test('поручение за личный ресурс предотвращает только текущую утечку названного советника', async () => {
  let gs = await fixture();
  gs.advisors = gs.advisors.map(a => ({ ...a, loyalty: 10 }));
  while (!leakingAdvisors(gs).length) gs.turn++;
  gs.world!.secretary!.trust = 2;
  gs.world!.secretary!.lastGossipTurn = null;
  gs = ensureSecretary({ ...gs, turn: gs.turn + 1 });
  while (!gs.world!.secretary!.gossip || gs.world!.secretary!.gossip!.kind !== 'leak') gs = ensureSecretary({ ...gs, turn: gs.turn + 1 });
  gs.world!.lastTick = gs.turn;
  const g = gs.world!.secretary!.gossip!;
  const advisor = gs.advisors.find(a => a.id === g.subject)!;
  const protectedState = actSecretary(gs, 'secretary:protect');
  assert.equal(protectedState.resources.personalResource, gs.resources.personalResource - 1);
  assert.equal(protectedState.resources.politicalCapital, gs.resources.politicalCapital);
  assert.throws(() => actSecretary(protectedState, 'secretary:protect'));
  assert.ok(secretaryPreventsLeak(protectedState, advisor));
  assert.equal(secretaryPreventsLeak({ ...protectedState, turn: gs.turn + 1 }, advisor), false);
  assert.equal(secretaryPreventsLeak(protectedState, { ...advisor, name: 'Другой человек' }), false);
  const cost = planTurn(gs, gs.currentEvent!.choices[0].id).sources;
  const reduced = planTurn(protectedState, gs.currentEvent!.choices[0].id).sources;
  const originalLeak = Object.values(cost).flat().filter(([label]) => label === `утечка: ${advisor.name}`);
  const protectedLeak = Object.values(reduced).flat().filter(([label]) => label === `утечка: ${advisor.name}`);
  assert.ok(originalLeak.length > 0);
  assert.equal(protectedLeak.length, 0);
  assert.ok(!planTurn(protectedState, gs.currentEvent!.choices[0].id).leaks.includes(advisor.id));
  const result = resolveTurn(protectedState, gs.currentEvent!.choices[0].id,
    await classicApi.consequence(protectedState, gs.currentEvent!.choices[0].id));
  assert.match(result.lastTurn!.narrative, /Утечку предотвратили/);
  assert.doesNotMatch(result.lastTurn!.narrative, /половину черновика/);
  const saved = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: protectedState }));
  assert.ok(saved && secretaryPreventsLeak(saved.state, advisor));
  const other = gs.advisors.find(a => a.id !== advisor.id)!;
  assert.equal(secretaryPreventsLeak(protectedState, other), false);
});

test('публичная замена названного советника снижает доверие и вызывает квартал молчания', async () => {
  let gs = await fixture(3);
  gs = { ...gs, turn: 8 };
  const candidate = candidatePool(gs)[0];
  const old = gs.advisors.find(a => a.id === candidate.seat)!;
  const s = gs.world!.secretary!;
  s.trust = 2;
  s.gossip = { turn: gs.turn, kind: 'disloyal', source: 'state', subject: old.id, name: old.name,
    text: 'Сведения о советнике', truthful: true, checked: null, protected: false, exposed: false };
  const changed = hireAdvisor(gs, candidate.id);
  assert.equal(changed.world!.secretary!.trust, 1);
  assert.equal(changed.world!.secretary!.muteUntil, gs.turn + 1);
  assert.equal(secretaryAvailable(changed), false);
  assert.notEqual(changed.advisors.find(a => a.id === candidate.seat)!.name, old.name);
});

test('отложенная цена кумовства начисляется один раз, финал не обещает смену президента', async () => {
  let gs = offer(await fixture(), 'sister');
  while (hashSeed(gs.seed, 'secretary-nepotism', gs.turn) % 4 !== 0) {
    gs.turn++;
    gs.world!.secretary!.favors[0].offered = gs.turn;
  }
  gs = actSecretary(gs, 'secretary:favor:sister:grant');
  const plan = planTurn(gs, gs.currentEvent!.choices[0].id);
  assert.ok(Object.values(plan.sources).flat().some(([label, delta]) => label.includes('кумовство') && delta === -2));
  const next = resolveTurn(gs, gs.currentEvent!.choices[0].id, await classicApi.consequence(gs, gs.currentEvent!.choices[0].id));
  assert.equal(next.world!.secretary!.pending.length, 0);
  const finale = finishSecretaryTurn(next, { ...next, turn: 20 });
  assert.ok(finale.world!.secretary!.finale);
  assert.doesNotMatch(finale.world!.secretary!.finale!, /новому хозяину|на прощание/);
});

test('старое и повреждённое необязательное состояние не лишают игрока сохранения', async () => {
  const gs = await fixture();
  const encode = (state: unknown) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state });
  assert.ok(parseSave(encode(gs)));
  for (const bad of [null, {}, { ...gs.world!.secretary, trust: 100 }, { ...gs.world!.secretary, gossip: { protected: true } }]) {
    const loaded = parseSave(encode({ ...gs, world: { ...gs.world!, secretary: bad } }));
    assert.ok(loaded);
    assert.equal(loaded.state.world!.secretary, undefined);
    assert.ok(ensureSecretary(loaded.state).world!.secretary);
  }
  const old = { ...gs, world: { ...gs.world! } };
  delete old.world.secretary;
  assert.ok(parseSave(encode(old)));
  const invalid = structuredClone(gs.world!.secretary!) as SecretaryState;
  invalid.favors = [{ id: 'leave', offered: gs.turn, answer: 'grant', answered: null, outcome: null }];
  assert.equal(validSecretary(invalid, gs.turn), false);
});


test('прогноз относится к следующему незаменённому делу, а не к текущему или его версии', async () => {
  const base = await fixture();
  base.advisors = base.advisors.map(a => ({ ...a, loyalty: 80 }));
  base.prevFigures = base.keyFigures.map(f => ({ ...f }));
  const forecast = (turn: number, usedEvents: string[] = []) => {
    const gs = structuredClone(base);
    gs.turn = turn;
    gs.usedEvents = usedEvents;
    gs.world!.secretary!.updated = turn - 1;
    gs.world!.secretary!.lastGossipTurn = null;
    return ensureSecretary(gs);
  };
  const next = forecast(18);
  const gossip = next.world!.secretary!.gossip!;
  assert.equal(gossip.kind, 'nextCase');
  assert.equal(gossip.subject, 'alt_archive');
  assert.ok(gossipConfirmed(next, gossip));
  assert.equal(gossipConfirmed({ ...next, usedEvents: ['alt_archive'] }, gossip), false);
  for (const turn of [6, 8, 11, 13]) assert.notEqual(forecast(turn).world!.secretary!.gossip?.kind, 'nextCase');
  assert.notEqual(forecast(18, ['alt_archive']).world!.secretary!.gossip?.kind, 'nextCase');
});

test('канал директора подменяет только часть сообщений, не повторяя одну строку подряд', async () => {
  let gs = await fixture();
  gs.advisors = gs.advisors.map(a => ({ ...a, loyalty: 80 }));
  gs.world!.secretary!.planted = true;
  gs.world!.secretary!.trust = 2;
  const sources = new Set<string>();
  let previous = '';
  for (let turn = 6; turn < 20; turn++) {
    gs = ensureSecretary({ ...gs, turn });
    const g = gs.world!.secretary!.gossip;
    if (!g) continue;
    sources.add(g.source);
    if (g.source === 'director') assert.notEqual(g.text, previous);
    previous = g.text;
  }
  assert.ok(sources.has('state') && sources.has('director'));
});

test('канун настоящих выборов обходит очередь сцен; отменённые выборы не анонсируются', async () => {
  const base = await fixture();
  base.world!.secretary!.nextScene = 99;
  const election = ensureSecretary({ ...base, turn: 8 });
  assert.equal(election.world!.secretary!.scene?.id, 'electionEve');
  const postponed = ensureSecretary({ ...base, turn: 18, path: { id: 'postpone', turn: 17 } });
  assert.equal(postponed.world!.secretary!.scene, null);
});

test('опись не повторяется подряд; напоминание директора не создаёт пустой расход', async () => {
  let gs = await fixture();
  gs.activeCrises = [];
  gs.resources.economy = 20;
  let previous = '';
  for (const turn of [10, 11, 12, 13]) {
    gs = ensureSecretary({ ...gs, turn });
    const text = secretaryInventory(gs)!;
    assert.notEqual(text, previous);
    previous = text;
  }
  gs.world!.secretary!.pending = [{ id: 'directorRemembers', due: gs.turn + 1, text: 'Напоминание', res: {} }];
  assert.deepEqual(secretaryDueEffects(gs, gs.turn + 1), []);
  const next = finishSecretaryTurn(gs, { ...gs, turn: gs.turn + 1 });
  assert.match(next.world!.secretary!.receipt!, /Напоминание/);
});


test('ложное предупреждение тратит личный ресурс, не отменяет чужие утечки и не обещает успех', async () => {
  let gs = await fixture();
  gs.advisors = gs.advisors.map((a, i) => ({ ...a, loyalty: i === 0 ? 80 : 10 }));
  while (!leakingAdvisors(gs).length) gs.turn++;
  const innocent = gs.advisors[0];
  gs.world!.secretary!.gossip = { turn: gs.turn, kind: 'leak', text: 'Ложное предупреждение', truthful: false,
    source: 'director', subject: innocent.id, name: innocent.name, checked: null, protected: false, exposed: false };
  const protectedState = actSecretary(gs, 'secretary:protect');
  assert.equal(protectedState.resources.personalResource, gs.resources.personalResource - 1);
  assert.equal(protectedState.resources.politicalCapital, gs.resources.politicalCapital);
  const before = planTurn(gs, gs.currentEvent!.choices[0].id);
  const after = planTurn(protectedState, gs.currentEvent!.choices[0].id);
  assert.deepEqual(after.leaks, before.leaks);
  const result = resolveTurn(protectedState, gs.currentEvent!.choices[0].id,
    await classicApi.consequence(protectedState, gs.currentEvent!.choices[0].id));
  assert.doesNotMatch(result.lastTurn!.narrative, /Утечку предотвратили/);
  const poor = { ...gs, resources: { ...gs.resources, personalResource: 5 } };
  assert.throws(() => actSecretary(poor, 'secretary:protect'));
  assert.match(secretaryActions(poor).find(a => a.id === 'secretary:protect')!.blocked!, /личного ресурса/);
});
