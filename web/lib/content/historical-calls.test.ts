import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORICAL_CALL_TOPICS } from './historical-calls.ts';
import { approachWorks, callChoice, callEvent, classicApi } from '../game/classic.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from '../game/data.ts';
import type { Choice, GameState } from '../game/types.ts';

async function fixture(country = ALTERNATE_COUNTRY, seed = 7): Promise<GameState> {
  const intro = await classicApi.setup(country, 'debut', 'pragmatist', seed);
  return { ...createInitialState(country, 'debut', 'pragmatist', intro, seededRandom(seed)), turn: 16, arc: null };
}

function mechanicalChoice(choice: Choice) {
  const { scene, sceneFail, headline, headlineFail, ...mechanics } = choice;
  void scene; void sceneFail; void headline; void headlineFail;
  if (mechanics.deal?.later) {
    const { story, ...later } = mechanics.deal.later;
    void story;
    mechanics.deal = { ...mechanics.deal, later };
  }
  return mechanics;
}

test('исторический звонок: все собеседники и исходы называют предмет, сохраняя цены и отношения', async () => {
  const base = await fixture();
  for (const faction of base.factions) {
    const caller = base.keyFigures.find(figure => figure.faction === faction.id);
    if (!caller) continue;
    const topic = HISTORICAL_CALL_TOPICS[faction.bloc];
    assert.ok(topic, `нет темы для ${faction.id}`);
    const state = { ...base, keyFigures: [caller] };
    const event = callEvent(state)!;
    assert.equal(event.call!.demand, topic.demand);
    const active = startEvent(state, event);
    const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: active }));
    assert.ok(loaded, 'новое требование загружается без изменения формата сохранений');
    assert.deepEqual(loaded.state.currentEvent, active.currentEvent);
    const legacy = { ...active, currentEvent: { ...event, call: { ...event.call!, demand: 'Старое сохранённое требование' } } };
    for (const approach of ['offer', 'principle', 'pressure', 'numbers'] as const) {
      for (const ending of ['deal', 'refuse', 'later'] as const) {
        const choice = callChoice(active, approach, ending);
        assert.deepEqual(mechanicalChoice(choice), mechanicalChoice(callChoice(legacy, approach, ending)));
        assert.ok(choice.headline!.includes(topic.subject));
        assert.ok(choice.scene!.includes(caller.name));
        assert.doesNotMatch(choice.headline!, /лагерь|договорились/);
        assert.doesNotMatch(choice.scene!, /Сделка укладывается|\{[a-z]+\}/);
        assert.deepEqual(callChoice(loaded.state, approach, ending), choice, 'перезагрузка сохраняет развязку');
        if (ending === 'later') assert.ok(choice.deal!.later!.story!.includes(topic.subject));
        if (ending === 'deal') assert.ok(choice.scene!.includes(topic.agreement));
        if (ending === 'refuse') assert.ok(choice.scene!.includes(topic.refusal));
      }
    }
  }
});

test('архив, Daily, другой срок и сохранённый общий звонок не получают новые темы', async () => {
  for (const country of [ALTERNATE_COUNTRY, ...LEGACY_COUNTRIES]) {
    const base = await fixture(country);
    const states = country === ALTERNATE_COUNTRY
      ? [{ ...base, daily: '2026-10-26' }, { ...base, turn: 36 }]
      : [base];
    for (const state of states) {
      const event = callEvent(state)!;
      assert.ok(event?.call);
      const caller = state.keyFigures.find(figure => figure.id === event.call!.figure)!;
      const faction = state.factions.find(group => group.id === caller.faction)!;
      assert.notEqual(event.call!.demand, HISTORICAL_CALL_TOPICS[faction.bloc]?.demand);
      const choice = callChoice(startEvent(state, event), 'numbers', 'deal');
      assert.match(choice.headline!, /лагерь/);
    }
  }
});

test('естественный выбор звонящего сохраняется, предметная газета и отсрочка проходят через движок', async () => {
  for (const seed of [1, 7, 12, 21]) {
    const state = await fixture(ALTERNATE_COUNTRY, seed);
    const event = await classicApi.event(state);
    assert.ok(event.call && !event.call.negotiation);
    const caller = state.keyFigures.find(figure => figure.id === event.call!.figure)!;
    const faction = state.factions.find(group => group.id === caller.faction)!;
    const topic = HISTORICAL_CALL_TOPICS[faction.bloc]!;
    assert.equal(event.call.demand, topic.demand);
    const active = startEvent(state, event);
    const approach = (['offer', 'principle', 'pressure', 'numbers'] as const)
      .find(candidate => approachWorks(event.call!.trait, candidate))!;
    for (const ending of ['deal', 'refuse', 'later'] as const) {
      const choice = callChoice(active, approach, ending);
      const ready = { ...active, currentEvent: { ...event, choices: [choice, event.choices[1]] } };
      const result = resolveTurn(ready, choice.id, await classicApi.consequence(ready, choice.id));
      assert.equal(result.lastTurn!.headline, choice.headline);
      assert.ok(result.lastTurn!.narrative.includes(topic.demand));
      if (ending === 'later') {
        const pending = result.pending.find(entry => entry.label === 'Обещание повисло в воздухе');
        assert.ok(pending);
        assert.ok(pending.story?.includes(topic.subject));
        assert.equal(pending.due, 19);
      }
    }
  }
});
