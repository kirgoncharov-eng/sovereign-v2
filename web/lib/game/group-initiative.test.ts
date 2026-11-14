import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { groupActions, groupDecision, groupReplyDeadline, stepGroups, validGroups } from './group-initiative.ts';
import { interveneWorld, livingActions, stepLivingWorld } from './living-world.ts';
import { applyDeltas, planTurn, startEvent } from './engine.ts';
import { parseSave } from '../client/save.ts';
import { COUNTRIES, SAVE_VERSION } from './data.ts';
import { MONTHS_GEN, turnDate } from './calendar.ts';
import { presidentialMessages, presidentialSender } from '../client/presidential-inbox.ts';
import { correspondenceStatus } from '../client/correspondence.ts';
import { personProfiles } from '../client/people-text.ts';
import { openStops, dueStops } from '../client/chronicle-stops.ts';
import type { GameState } from './types.ts';
import type { LivingWorld } from './living-world.ts';

async function fixture(seed = 3) {
  let s = await newTerm(startFromSeed(seed, 'debut'));
  for (let i = 0; i < 6; i++) {
    s = await nextCase(s);
    s = await signChoice(s, s.currentEvent!.choices[0].id);
  }
  assert.ok(s.world);
  return { ...s, resources: Object.fromEntries(Object.keys(s.resources).map(k => [k, 70])) as GameState['resources'],
    factions: s.factions.map(f => ({ ...f, relation: 30 })) };
}
function tick(s: GameState) {
  const result = stepLivingWorld(s, s.turn + 1);
  return { ...s, turn: s.turn + 1, world: result.world, resources: applyDeltas(s.resources, result.res) };
}
function reload(s: GameState) {
  const parsed = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: s }));
  assert.ok(parsed, `save at ${s.world?.groups?.phase}`);
  assert.deepEqual(parsed.state.world?.groups, s.world?.groups);
  return parsed.state;
}
async function offer() {
  let s = await fixture();
  while (s.world?.groups?.phase !== 'offer' && s.turn < 12) s = tick(s);
  assert.equal(s.world?.groups?.phase, 'offer');
  return reload(s);
}
const options = (s: GameState) => groupActions(s).map(a => a.id);

test('срок называет последний доступный день; переход к следующему делу закрывает ответ', async () => {
  const s = await offer();
  for (const seed of [3, 7, 19, 24]) for (const due of [12, 13, 16, 17]) {
    const last = { ...s, seed, turn: due - 1,
      world: { ...s.world!, lastTick: due - 1, groups: { ...s.world!.groups!, due } } };
    const date = turnDate(seed, COUNTRIES[s.country].startYear, last.turn);
    const note = groupReplyDeadline(last, due);
    assert.ok(note.includes(`${date.day} ${MONTHS_GEN[date.month]} ${date.year}`));
    assert.ok(note.includes('После решения дела за эту дату срок истечёт'));
    assert.doesNotMatch(note, /квартала \d/);
    assert.ok(groupActions(last).length > 0, 'в названный день варианты ещё доступны');
    const expired = tick(last);
    assert.equal(expired.world!.groups!.phase, 'settled');
    assert.equal(groupActions(expired).length, 0, 'следующее дело уже за границей срока');
    const letter = presidentialMessages(last).find(m => m.key === 'group-initiative')!;
    assert.equal(correspondenceStatus(last, letter), note);
    const author = personProfiles(last).find(p => p.id === letter.person)!;
    assert.equal(presidentialSender(last, letter), `${author.name} · ${author.role}`);
    assert.equal(presidentialSender(last, { ...letter, action: 'sponsor' }), author.name);
  }
  assert.doesNotMatch(s.world!.groups!.text, /квартала \d/);
  assert.match(s.world!.groups!.text, /\+1 к экономике/);
  const dispute = tick(interveneWorld(s, 'groups:offer:back'));
  assert.doesNotMatch(dispute.world!.groups!.text, /квартала \d/);
  const shipping = interveneWorld(dispute, 'groups:dispute:fuel');
  assert.doesNotMatch(shipping.world!.groups!.text, /квартала \d/);
  assert.equal(tick(shipping).world!.groups!.phase, 'shipping');
  assert.equal(tick(tick(shipping)).world!.groups!.phase, 'settled');
});

test('инициатива начинается из положения страны, не из последней подписи; ранние ходы, архив и Daily не затронуты', async () => {
  const base = await fixture();
  for (const [country, daily, turn] of [['Украина', undefined, 8], [base.country, '2026-11-13', 8], [base.country, undefined, 2]] as const) {
    const s = { ...base, country, daily, world: { ...base.world!, groups: undefined } };
    const world = structuredClone(s.world);
    const result = stepGroups(s, world, turn);
    assert.equal(result.story, null); assert.equal(world.groups, undefined);
  }
  const idle = { ...base, world: { ...base.world!, groups: undefined }, resources: { ...base.resources, economy: 70, externalReputation: 30 } };
  const noNeed = structuredClone(idle.world);
  assert.equal(stepGroups(idle, noNeed, 8).story, null);
  const weak = { ...idle, resources: { ...idle.resources, economy: 40 } };
  const first: LivingWorld = structuredClone(weak.world), second: LivingWorld = structuredClone(weak.world);
  stepGroups(weak, first, 8); stepGroups({ ...weak, history: [], currentEvent: null }, second, 8);
  assert.deepEqual(first.groups, second.groups); assert.equal(first.groups?.cause, 'orders');
  assert.match(first.groups!.text, /не дожидаясь поручения/);
});

test('поддержка и встречные условия открывают разные решения; плата один раз, результат в срок', async () => {
  const s = await offer(), frozen = JSON.stringify(s);
  const backed = reload(interveneWorld(s, 'groups:offer:back'));
  assert.equal(backed.resources.politicalCapital, s.resources.politicalCapital - 2);
  assert.equal(JSON.stringify(s), frozen, 'предпросмотр/подпись не мутируют прошлое состояние');
  assert.throws(() => interveneWorld(backed, 'groups:offer:back'));
  assert.ok(livingActions(backed).every(a => a.blocked));
  const dispute = reload(tick(backed));
  const bargain = reload(tick(interveneWorld(s, 'groups:offer:conditions')));
  assert.equal(dispute.world!.groups!.phase, 'dispute'); assert.equal(bargain.world!.groups!.phase, 'bargain');
  assert.match(dispute.world!.groups!.text, /Областные советы удерживают/);
  assert.match(bargain.world!.groups!.text, /Областные советы предлагают/);
  assert.ok(options(dispute).includes('groups:dispute:fuel'));
  assert.ok(!options(bargain).some(id => id.endsWith(':fuel')));
  assert.ok(options(bargain).includes('groups:bargain:shared'));
  const shipping = reload(interveneWorld(bargain, 'groups:bargain:shared'));
  assert.equal(shipping.resources.economy, bargain.resources.economy - 2);
  assert.equal(tick(shipping).world!.groups!.phase, 'shipping');
  const settled = reload(tick(reload(tick(shipping))));
  assert.equal(settled.world!.groups!.phase, 'settled'); assert.equal(settled.world!.groups!.outcome, 'shared');
  const repeated = stepLivingWorld(settled, settled.turn);
  assert.deepEqual(repeated.res, {});
  const next = stepLivingWorld(settled, settled.turn + 1);
  assert.ok(!next.effects.some(e => e.label === 'экспортный заказ палаты и областей'));
});

test('молчание имеет срок: группы могут договориться сами или потерять заказ; спор не ждёт бесконечно', async () => {
  const s = await offer();
  const friends = reload(tick(tick(s)));
  assert.equal(friends.world!.groups!.outcome, 'private');
  const hostile = { ...s, factions: s.factions.map(f => ({ ...f, relation: -30 })) };
  const failed = reload(tick(tick(hostile)));
  assert.equal(failed.world!.groups!.outcome, 'lost');
  const dispute = tick(interveneWorld(s, 'groups:offer:back'));
  assert.equal(tick(tick(dispute)).world!.groups!.outcome, 'lost');
  const beforeDue = tick(s);
  const plan = planTurn(startEvent(beforeDue, { title: 'Заседание', description: 'Проверка ведомости', source: 'Кабинет',
    isCritical: false, affectedFactions: [], randomEvent: null,
    choices: [{ id: 'continue', text: 'Продолжить', hint: '', tags: [], resolvesCrisis: null, deal: { pure: true } }] }), 'continue');
  assert.ok(plan.sources.economy?.some(([label, amount]) => label === 'экспортный заказ палаты и областей' && amount === 1));
});

test('поручение учитывает компетенцию, лояльность и отставку конкретного советника', async () => {
  const s = await offer();
  for (const [skill, loyalty, fired, expected] of [[3, 80, false, 'bargain'], [1, 80, false, 'dispute'], [3, 20, false, 'dispute'], [3, 80, true, 'dispute']] as const) {
    const prepared = { ...s, advisors: s.advisors.map(a => a.id === 'economist' ? { ...a, skill, loyalty } : a) };
    let delegated = reload(interveneWorld(prepared, 'groups:offer:delegate'));
    if (fired) delegated = { ...delegated, advisors: delegated.advisors.filter(a => a.id !== 'economist') };
    const result = reload(tick(delegated));
    assert.equal(result.world!.groups!.phase, expected);
    if (fired) assert.match(result.world!.groups!.text, /покинул совет/);
  }
  assert.ok(!options({ ...s, advisors: [] }).some(id => id.endsWith(':delegate')));
});

test('сокращённый заказ и отказ завершаются отдельно; недостаток ресурса и истёкший срок запрещают подпись', async () => {
  const s = await offer(), dispute = tick(interveneWorld(s, 'groups:offer:back'));
  const small = reload(interveneWorld(dispute, 'groups:dispute:small'));
  assert.equal(reload(tick(tick(small))).world!.groups!.outcome, 'small');
  const withdrawn = reload(interveneWorld(dispute, 'groups:dispute:withdrawn'));
  assert.equal(withdrawn.world!.groups!.phase, 'settled');
  assert.equal(withdrawn.world!.groups!.outcome, 'withdrawn');
  assert.deepEqual(withdrawn.resources, dispute.resources);
  assert.equal(groupActions(withdrawn).length, 0);
  assert.throws(() => interveneWorld({ ...s, resources: { ...s.resources, politicalCapital: 5 } }, 'groups:offer:back'));
  assert.throws(() => interveneWorld({ ...s, turn: s.world!.groups!.due }, 'groups:offer:back'));
  assert.deepEqual(groupActions({ ...s, daily: '2026-11-13' }), []);
});

test('сведения доступны сразу; обязательная остановка только перед сроком, старое сохранение читается', async () => {
  const s = await offer();
  const active = await nextCase(s);
  assert.ok(presidentialMessages(active).some(m => m.key === 'group-initiative'));
  assert.equal(presidentialMessages(active).find(m => m.key === 'group-initiative')!.deadline, s.world!.groups!.due);
  assert.ok(openStops(active).some(m => m.key === 'group-initiative'));
  assert.ok(!dueStops(active, openStops(active), {}).some(m => m.key === 'group-initiative'));
  const urgent = { ...tick(active), currentEvent: active.currentEvent };
  assert.ok(dueStops(urgent, openStops(urgent), {}).some(m => m.key === 'group-initiative'));
  const legacy = { ...s, world: { ...s.world! } }; delete legacy.world.groups;
  reload(legacy);
  for (const patch of [{ due: -1 }, { phase: 'unknown' }, { outcome: 'fuel' }, { business: null }, { changed: s.turn + 1 }]) {
    assert.equal(validGroups({ ...s.world!.groups, ...patch }, s.turn), false);
    assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: {
      ...s, world: { ...s.world, groups: { ...s.world!.groups, ...patch } } } })), null);
  }
  const world = structuredClone(s.world!);
  assert.throws(() => groupDecision(s, world, 'groups:dispute:fuel'));
  assert.deepEqual(world, s.world);
});
