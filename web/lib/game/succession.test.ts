import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { SAVE_VERSION } from "./data.ts";
import { parseSave } from "../client/save.ts";
import type { GameState } from "./types.ts";

// Критерий #143: человек, ушедший с поста в истории письма, не продолжает звонить и выступать в прежней должности.
async function play(country: string, seed: number, turns: number, onTurn: (before: GameState, after: GameState) => void) {
  const intro = await classicApi.setup(country, "debut", "pragmatist", seed);
  let state = createInitialState(country, "debut", "pragmatist", intro, seededRandom(seed));
  for (let turn = 0; turn < turns && !state.ended; turn++) {
    // Холодные отношения со всеми — истории идут к уходу с поста, а не к примирению.
    state = { ...state, keyFigures: state.keyFigures.map(figure => ({ ...figure, relation: -40 })) };
    state = startEvent(state, await classicApi.event(state));
    const choices = state.currentEvent!.choices;
    const id = choices[(turn + seed) % choices.length].id;
    const before = state;
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
    onTurn(before, state);
  }
  return state;
}

test("кампания 1978: после ухода с поста в должность заступает преемник, газета называет его", async () => {
  let departures = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const gone = new Set<string>();
    await play(ALTERNATE_COUNTRY, seed, 40, (before, after) => {
      // Ушедшие на прошлых ходах не возвращаются; в сам ход ухода письмо, конечно, от уходящего.
      for (const name of gone) {
        assert.ok(!after.keyFigures.some(figure => figure.name === name), `seed ${seed}: ушедший ${name} снова в должности`);
        assert.ok(!(after.lastTurn?.letters ?? []).some(letter => letter.from === name), `seed ${seed}: ушедший ${name} снова пишет`);
      }
      for (const heir of after.lastTurn?.succession ?? []) {
        departures++;
        const old = before.keyFigures.find(figure => figure.id === heir.figure)!;
        const now = after.keyFigures.find(figure => figure.id === heir.figure)!;
        assert.notEqual(now.name, old.name, `seed ${seed}: ${old.role} сменился`);
        assert.equal(now.name, heir.name);
        assert.ok(after.former?.includes(old.name), `seed ${seed}: ${old.name} в списке бывших`);
        assert.ok(after.lastTurn!.letters!.some(letter => letter.text.includes(`— ${heir.name}.`)), "газета называет преемника");
        gone.add(old.name);
      }
      const raw = JSON.stringify({ version: SAVE_VERSION, screen: after.ended ? "ending" : "game", state: after });
      assert.equal(JSON.stringify(parseSave(raw)?.state), JSON.stringify(after), "сохранение с преемником восстанавливается");
    });
  }
  assert.ok(departures >= 3, `уходов с поста за 6 партий: ${departures}`);
});

test("прежние страны — архив: письма об уходе не меняют людей и не называют преемника", async () => {
  for (const seed of [1, 2, 3]) {
    await play("Грузия", seed, 30, (_before, after) => {
      assert.equal(after.lastTurn?.succession, undefined);
      for (const letter of after.lastTurn?.letters ?? []) {
        assert.ok(!letter.role || !letter.text.includes(` Новый ${letter.role.toLowerCase()} — `), `seed ${seed}: «${letter.text}»`);
      }
    });
  }
});
