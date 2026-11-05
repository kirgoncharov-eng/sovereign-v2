import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executionProfile, executionRisk } from './execution-risk.ts';
import { choiceEffects, conveneCouncil, ownPersonCarries, rollSuccess, successChance } from './engine.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from './alternate-world.ts';
import { SAVE_VERSION } from './data.ts';
import { OWN_CRISIS_BELOW } from '../content/staffing.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from '../client/chronicle.ts';
import { choiceOutcomes } from '../client/choice-outcomes.ts';
import { parseSave } from '../client/save.ts';
import type { Bloc, Choice, GameState } from './types.ts';

async function neutralFirst(): Promise<GameState> {
  const state = await nextCase(await newTerm(startFromSeed(7, 'coalition')));
  return {
    ...state, bio: '', pacts: [],
    resources: { economy: 60, military: 60, internalLegitimacy: 60, externalReputation: 60, politicalCapital: 60, personalResource: 60 },
    factions: state.factions.map(faction => ({ ...faction, relation: 0 })),
    keyFigures: state.keyFigures.map(figure => ({ ...figure, relation: 0, loyalty: 'нейтрал' as const })),
    advisors: state.advisors.map(advisor => ({ ...advisor, skill: 2 as const, loyalty: 70, origin: undefined, dossier: undefined })),
  };
}

function relation(state: GameState, bloc: Bloc, value: number): GameState {
  const groups = new Set(state.factions.filter(faction => faction.bloc === bloc).map(faction => faction.id));
  return {
    ...state,
    factions: state.factions.map(faction => groups.has(faction.id) ? { ...faction, relation: value } : faction),
    keyFigures: state.keyFigures.map(figure => groups.has(figure.faction) ? { ...figure, relation: value } : figure),
  };
}

function coordinator(state: GameState, id: string, changes: Partial<GameState['advisors'][number]>): GameState {
  return { ...state, advisors: state.advisors.map(advisor => advisor.id === id ? { ...advisor, ...changes } : advisor) };
}

function outcome(state: GameState, choice: Choice, success: boolean): GameState {
  for (let seed = 1; seed <= 1000; seed++) {
    const candidate = { ...state, seed };
    if (rollSuccess(candidate, choice) === success) return candidate;
  }
  throw new Error('Не найден проверяемый исход');
}

test('завод: явная цепочка различает выплату, российский аванс и поставку оборудования', async () => {
  const state = await neutralFirst();
  const profiles = state.currentEvent!.choices.map(choice => executionProfile(state, choice));
  assert.deepEqual(profiles.map(profile => profile?.blocs), [['business'], ['business', 'russia'], ['business', 'west']]);
  assert.deepEqual(profiles.map(profile => profile?.coordinators),
    [['economist'], ['economist', 'diplomat'], ['economist', 'diplomat']]);
  for (const choice of state.currentEvent!.choices) {
    const profile = executionProfile(state, choice)!;
    assert.ok(executionRisk(state, choice)!.reason.startsWith(profile.responsibility));
  }
});

test('пресса и приходы реагируют на выплату, но их симпатии не проводят банковский платёж', async () => {
  const state = await neutralFirst();
  const choices = state.currentEvent!.choices;
  for (const choice of choices) {
    const profile = executionProfile(state, choice)!;
    for (const faction of state.factions) {
      if (profile.blocs.includes(faction.bloc)) continue;
      assert.equal(successChance(relation(state, faction.bloc, -60), choice), successChance(state, choice), faction.name);
      assert.equal(successChance(relation(state, faction.bloc, 60), choice), successChance(state, choice), faction.name);
    }
  }
  const effects = choiceEffects(state, choices[0]);
  assert.ok(effects.factionRel.media > 0, 'политическая благодарность редакции остаётся');
  assert.ok(effects.factionRel.opposition > 0, 'публичная поддержка не удалена вместе с исполнительским бонусом');
});

test('выплата зависит от промышленного контрагента, аванс — также от российской стороны, оборудование — от торговой', async () => {
  const state = await neutralFirst();
  for (const choice of state.currentEvent!.choices) {
    for (const bloc of executionProfile(state, choice)!.blocs) {
      assert.ok(successChance(relation(state, bloc, 40), choice) > successChance(relation(state, bloc, -40), choice), bloc);
    }
    const director = { ...state, keyFigures: state.keyFigures.map(figure => figure.id === 'oligarch' ? { ...figure, relation: 40 } : figure) };
    assert.ok(successChance(director, choice) > successChance(state, choice), 'директор способен содействовать исполнению');
  }
});

test('компетентность и саботаж учитывают назначенную координацию, а не любой совет под делом', async () => {
  const state = await neutralFirst();
  const [pay, advance, equipment] = state.currentEvent!.choices;
  for (const choice of [pay, advance, equipment]) {
    assert.ok(successChance(coordinator(state, 'economist', { skill: 3 }), choice)
      > successChance(coordinator(state, 'economist', { skill: 1 }), choice));
    assert.equal(successChance(coordinator(state, 'strategist', { skill: 3, loyalty: 0 }), choice), successChance(state, choice));
    assert.equal(successChance(coordinator(state, 'security', { loyalty: 0 }), choice), successChance(state, choice));
  }
  assert.equal(successChance(coordinator(state, 'diplomat', { skill: 1, loyalty: 0 }), pay), successChance(state, pay));
  for (const choice of [advance, equipment]) {
    assert.ok(successChance(coordinator(state, 'diplomat', { skill: 3 }), choice)
      > successChance(coordinator(state, 'diplomat', { skill: 1 }), choice));
    assert.ok(successChance(coordinator(state, 'diplomat', { loyalty: 0 }), choice) < successChance(state, choice));
    const restrained = coordinator(state, 'diplomat', { loyalty: 0, dossier: { fact: 'Проверенный документ', turn: 0 } });
    assert.equal(successChance(restrained, choice), successChance(state, choice));
  }
});

test('свой человек сохраняет правило обсуждения и помогает своей подписи, а не любому варианту', async () => {
  const initial = await neutralFirst();
  const tired = { ...initial, resources: { ...initial.resources, personalResource: OWN_CRISIS_BELOW - 1 } };
  assert.equal(ownPersonCarries(coordinator(tired, 'economist', { origin: 'relative' }), tired.currentEvent!.choices[0]), false);
  const state = conveneCouncil(tired, tired.currentEvent!.choices);
  const [pay, advance] = state.currentEvent!.choices;
  const relativeEconomist = coordinator(state, 'economist', { origin: 'relative' });
  assert.equal(ownPersonCarries(relativeEconomist, pay), true);
  assert.ok(successChance(relativeEconomist, pay) > successChance(state, pay));
  const relativeDiplomat = coordinator(state, 'diplomat', { origin: 'relative' });
  assert.equal(ownPersonCarries(relativeDiplomat, pay), false);
  assert.equal(ownPersonCarries(relativeDiplomat, advance), true);
  assert.equal(ownPersonCarries(relativeEconomist, advance), false, 'критик аванса не подменяет его автора');
  assert.equal(ownPersonCarries(coordinator(state, 'strategist', { origin: 'relative' }), pay), false);
});

test('старые подписи восстанавливают цепочку; архив, daily и переработанные предложения сохраняют общий расчёт', async () => {
  const state = await neutralFirst(), choice = state.currentEvent!.choices[0];
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }))!.state;
  assert.deepEqual(executionProfile(restored, choice), executionProfile(state, choice));
  assert.equal(successChance(restored, choice), successChance(state, choice));
  for (const country of LEGACY_COUNTRIES) {
    const legacy = { ...state, country };
    assert.equal(executionProfile(legacy, choice), null);
    assert.equal(successChance(legacy, choice), 0.8, 'нейтральный прежний расчёт без биографического бонуса');
  }
  const daily = { ...state, daily: '2026-11-05' };
  assert.equal(executionProfile(daily, choice), null);
  assert.equal(successChance(daily, choice), 0.8);
  const next = { ...state, currentEvent: { ...state.currentEvent!, card: 'alt_district' } };
  assert.equal(executionProfile(next, choice), null);
  assert.equal(successChance(next, choice), 0.8);
  for (const altered of [
    { ...choice, id: 's_economist' },
    { ...choice, policyEffect: { economy: -20 } },
    { ...choice, advisor: { id: 'economist', name: 'Другой советник', role: 'Экономист', skill: 3 as const } },
  ]) assert.equal(executionProfile(state, altered), null);
  assert.equal(executionProfile({ country: ALTERNATE_COUNTRY }, choice), null);
});

test('показанный риск, настоящая подпись, исход и будущий договор сохраняются после reload', async () => {
  const original = await neutralFirst();
  for (const choice of original.currentEvent!.choices) {
    const preview = choiceOutcomes(original, choice)!;
    assert.equal(preview.failurePercent, Math.round((1 - successChance(original, choice)) * 100));
    assert.ok(preview.reason?.includes(executionProfile(original, choice)!.responsibility));
    for (const success of [true, false]) {
      const state = outcome(original, choice, success), before = structuredClone(state);
      const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state }))!.state;
      assert.deepEqual(choiceOutcomes(restored, choice), choiceOutcomes(state, choice));
      const after = await signChoice(restored, choice.id);
      assert.equal(after.lastTurn!.success, success);
      assert.ok(after.lastTurn!.narrative.includes(success ? choice.scene! : choice.sceneFail!));
      assert.deepEqual(after.lastTurn!.resourceChanges, choiceEffects(state, choice, !success).resources);
      if (choice.deal?.later) {
        assert.equal(after.lastTurn!.scheduled.some(entry => entry.label === choice.deal!.later!.label), success);
      }
      assert.deepEqual(after, await signChoice(restored, choice.id));
      assert.deepEqual(state, before);
    }
  }
});

