import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_ARC } from './alternate-history.ts';
import { hasInvestigationDebate, INVESTIGATION_DEBATES } from './investigation-debates.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, conveneCouncil, seededRandom, startEvent } from '../game/engine.ts';
import { presidentialConversation, hasAuthoredDebate } from '../game/presidential-story.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { parseSave } from '../client/save.ts';
import { advisorNews, forecastReview } from '../game/forecasts.ts';
import { SAVE_VERSION } from '../game/data.ts';

test('every branch of the five contract episodes speaks through two actual advisors, including the former director', async () => {
  const base = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
  const seen = new Set<string>();
  for (const beat of ALTERNATE_ARC.beats) for (const variant of beat.variants) {
    const event = { ...await classicApi.event(base), card: undefined,
      title: variant.title, beat: { arcId: ALTERNATE_ARC.id, arcTitle: ALTERNATE_ARC.title,
        turn: beat.turn, episode: 1, total: 5 },
      choices: variant.choices.map((choice, index) => ({
        id: String(index), text: choice.text, hint: choice.hint, tags: choice.tags, resolvesCrisis: null,
      })),
    };
    const state = startEvent(base, event);
    assert.equal(hasInvestigationDebate(state), true);
    for (let index = 0; index < event.choices.length; index++) {
      const key = event.choices[index].text;
      seen.add(key);
      const lines = presidentialConversation(state, index);
      assert.equal(lines.length, 3, key);
      for (const failed of [false, true]) {
        const choiceId = state.currentEvent!.choices[index].id;
        const updates = advisorNews(state, choiceId, failed);
        assert.deepEqual(forecastReview(state, choiceId, failed), []);
        assert.equal(updates.length, 2);
        for (const update of updates) {
          const person = state.advisors.find(advisor => advisor.id === update.id)!;
          assert.equal(update.loyalty, person.name === lines[0].name ? 3 : -5, key);
          assert.equal(update.right + update.wrong, 0);
        }
      }
      assert.equal(new Set(lines.map(line => line.name)).size, 2);
      assert.ok(lines.every(line => state.advisors.some(advisor => advisor.name === line.name)));
      assert.equal(hasAuthoredDebate(state, index), true);
      assert.doesNotMatch(lines.map(line => line.text).join(' '), /казна просядет|признание власти|%/);
    }
    assert.equal(hasInvestigationDebate({ ...state, daily: '2026-10-14' }), false);
    assert.equal(hasInvestigationDebate({ ...state, country: 'Беларусь' }), false);
  }
  assert.deepEqual([...seen].sort(), Object.keys(INVESTIGATION_DEBATES).sort());
});

test('discussion of identical historical choices works with zero charges; Daily and alternative proposals retain their cost', async () => {
  const base = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 21), seededRandom(21));
  const state = startEvent({ ...base, councilCharges: 0 }, await classicApi.event(base));
  const proposals = await classicApi.council(state);
  const opened = conveneCouncil(state, proposals);
  assert.deepEqual(opened.currentEvent!.council, state.currentEvent!.choices);
  assert.equal(opened.councilCharges, 0);
  assert.deepEqual(opened.stats, state.stats);
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: opened }))!.state;
  assert.deepEqual(loaded.currentEvent!.council, opened.currentEvent!.council);
  assert.deepEqual(conveneCouncil(opened, proposals), opened);
  const daily = { ...state, daily: '2026-10-14', councilCharges: 2 };
  assert.equal(conveneCouncil(daily, proposals).councilCharges, 1);
  const alternative = [{ ...proposals[0], id: 'another-policy', text: 'Другая политика' }];
  assert.equal(conveneCouncil({ ...state, councilCharges: 2 }, alternative).councilCharges, 1);
  assert.deepEqual(conveneCouncil(state, alternative), state);
});
