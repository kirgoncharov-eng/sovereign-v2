import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom, successChance, shiftedLoyalty, leakingAdvisors, saboteurOf, ownPersonCarries, startEvent, conveneCouncil } from './engine.ts';
import { candidatePool, hireAdvisor, dismissalOf, applyDossier } from './staffing.ts';
import { advisorProfile } from './advisors.ts';
import { advisorNews } from './forecasts.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { OWN_LOYALTY_FLOOR, KINSHIP_1978 } from '../content/staffing.ts';
import { choicePrice } from '../client/choice-price.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { Choice, GameState } from './types.ts';

async function fresh(seed = 7, country = ALTERNATE_COUNTRY): Promise<GameState> {
  const state = createInitialState(country, 'debut', 'pragmatist', await classicApi.setup(country, 'debut', 'pragmatist', seed), seededRandom(seed));
  return { ...state, turn: 4, arc: null,
    resources: { economy: 60, internalLegitimacy: 60, externalReputation: 60, military: 60, personalResource: 24, politicalCapital: 60 } };
}

test('резерв 1978: умение по биографии, сильная родня дороже, оба рода и все типы встречаются', async () => {
  const relatives = new Set<number>(), hiredSkills = new Set<number>(), freaks = new Map<string, Set<number>>();
  let female = false;
  for (let seed = 1; seed <= 60; seed++) {
    const state = await fresh(seed);
    for (let year = 0; year < 4; year++) for (const candidate of candidatePool({ ...state, turn: 4 + year * 4 })) {
      if (candidate.channel === 'relative') {
        relatives.add(candidate.skill); female ||= candidate.bio.startsWith('Ваша');
        assert.equal(candidate.skill, /Гарварда/.test(candidate.bio) ? 3 : /инженером/.test(candidate.bio) ? 2 : 1);
        assert.deepEqual(candidate.cost, KINSHIP_1978[candidate.skill].cost);
        assert.deepEqual(candidate.relation, KINSHIP_1978[candidate.skill].relation);
        assert.doesNotMatch(candidate.bio, /вернулся|вернулась/);
        if (!hiredSkills.has(candidate.skill)) {
          const before = { ...state, turn: 4 + year * 4 };
          const previous = before.advisors.find(member => member.id === candidate.seat)!;
          const dismissal = dismissalOf(before, previous);
          const after = hireAdvisor(before, candidate.id);
          assert.equal(after.resources.internalLegitimacy, before.resources.internalLegitimacy
            + candidate.cost.internalLegitimacy! + (dismissal.cost.internalLegitimacy ?? 0));
          const liberal = before.factions.find(faction => faction.bloc === 'liberal')!;
          assert.equal(after.factions.find(faction => faction.id === liberal.id)!.relation, liberal.relation
            + candidate.relation.liberal! + (dismissal.camp?.id === liberal.id ? -6 : 0));
          const member = after.advisors.find(member => member.id === candidate.seat)!;
          assert.equal(member.origin, 'relative'); assert.equal(member.skill, candidate.skill);
          assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: after }))!.state.advisors
            .find(member => member.id === candidate.seat)!.skill, candidate.skill);
          hiredSkills.add(candidate.skill);
        }
      }
      if (candidate.channel === 'freak') {
        const values = freaks.get(candidate.title) ?? new Set<number>(); values.add(candidate.skill); freaks.set(candidate.title, values);
        const skills = /викторины/.test(candidate.title) ? [2, 3] : /передачи/.test(candidate.title) ? [2] : [1];
        assert.ok(skills.includes(candidate.skill), `${candidate.title}: ${candidate.skill}`);
        assert.doesNotMatch(candidate.bio, /подписчик|миллион|онлайн/);
      }
    }
  }
  assert.deepEqual([...relatives].sort(), [1, 2, 3]); assert.deepEqual([...hiredSkills].sort(), [1, 2, 3]);
  assert.ok(female); assert.equal(freaks.size, 5);
  assert.deepEqual([...freaks.get('чемпион телевикторины')!].sort(), [2, 3]);
});

test('старый свой человек не саботирует, не сливает, уходит тихо; пол действует при отказе и досье', async () => {
  const state = await fresh();
  state.advisors = state.advisors.map(advisor => ({ ...advisor, origin: 'freak', loyalty: 10 }));
  const advisor = state.advisors.find(member => member.id === 'security')!;
  assert.equal(shiftedLoyalty(state, advisor, -10), 10);
  assert.equal(shiftedLoyalty(state, { ...advisor, loyalty: 56 }, -5), OWN_LOYALTY_FLOOR);
  for (let turn = 4; turn < 40; turn++) assert.deepEqual(leakingAdvisors({ ...state, turn }), []);
  const choice: Choice = { id: 'a', text: 'Проверка', hint: '', tags: ['anticorruption'], resolvesCrisis: null };
  assert.equal(saboteurOf(state, choice), null); assert.equal(dismissalOf(state, advisor).scandal, false);
  assert.equal(advisorProfile(state, advisor).harmful, false);
  const target = state.advisors.find(member => member.id !== 'security')!;
  const dossier = applyDossier(state, target.id, 'collect');
  assert.equal(dossier.advisors.find(member => member.id === 'security')!.loyalty, 10);
  const ready = { ...state, currentEvent: { ...await classicApi.event(state), card: 'alt_wages' } };
  const news = advisorNews(ready, ready.currentEvent.choices[0].id, false);
  assert.ok(news.length > 0); for (const entry of news) assert.ok(entry.loyalty >= 0);
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state }))!.state;
  assert.equal(dismissalOf(restored, restored.advisors[0]).scandal, false);
});

test('нехватка сил: +5 вместо −5, цена и граница 25 честные; архив/daily прежние', async () => {
  const state = await fresh();
  const member = { ...state.advisors[0], origin: 'relative', skill: 2 as const, loyalty: 60 };
  state.advisors = [member]; state.factions = state.factions.map(faction => ({ ...faction, relation: 0 })); state.keyFigures = []; state.bio = 'diplomat';
  const choice: Choice = { id: 'own', text: 'Поручить закупку', hint: '', tags: ['investment'], resolvesCrisis: null,
    advisor: { id: member.id, name: member.name, role: member.role, skill: member.skill } };
  const ordinary = { ...state, advisors: [{ ...member, origin: 'civil' }] };
  assert.equal(ownPersonCarries(state, choice), true);
  assert.equal(Math.round((successChance(state, choice) - successChance(ordinary, choice)) * 100), 10);
  assert.equal(choicePrice(state, choice)!.failurePercent, Math.round((1 - successChance(state, choice)) * 100));
  assert.equal(ownPersonCarries({ ...state, resources: { ...state.resources, personalResource: 25 } }, choice), false);
  assert.equal(ownPersonCarries(state, { ...choice, deal: { pure: true } }), false);
  assert.equal(ownPersonCarries(state, { ...choice, advisor: { ...choice.advisor!, name: 'Прежний человек' } }), false);
  for (const excluded of [{ ...state, country: 'Беларусь' }, { ...state, daily: '2026-11-03' }]) {
    assert.equal(ownPersonCarries(excluded, choice), false);
    assert.equal(successChance(excluded, choice), successChance({ ...excluded, advisors: ordinary.advisors }, choice));
    assert.equal(shiftedLoyalty(excluded, { ...member, loyalty: 56 }, -5), 51);
  }
});

test('нынешний совет: поддержка автора из диалога после обсуждения; возражение и другие резолюции бонуса не дают', async () => {
  let state = await fresh();
  state.advisors = state.advisors.map(member => ({ ...member, origin: member.id === 'economist' ? 'relative' : 'civil' }));
  state = startEvent(state, await classicApi.event({ ...state, turn: 0 }));
  const choice = state.currentEvent!.choices[0];
  assert.equal(ownPersonCarries(state, choice), false);
  state = conveneCouncil(state, state.currentEvent!.choices);
  assert.equal(ownPersonCarries(state, choice), true);
  assert.equal(ownPersonCarries(state, state.currentEvent!.choices[1]), false, 'другой автор');
  const critic = { ...state, advisors: state.advisors.map(member => ({ ...member, origin: member.id === 'strategist' ? 'relative' : 'civil' })) };
  assert.equal(ownPersonCarries(critic, choice), false);
  const ordinary = { ...state, advisors: state.advisors.map(member => ({ ...member, origin: 'civil' })) };
  assert.equal(Math.round((successChance(state, choice) - successChance(ordinary, choice)) * 100), 10);
  assert.equal(ownPersonCarries({ ...state, daily: '2026-11-03' }, choice), false);
});
