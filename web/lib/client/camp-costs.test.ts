import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMP_COST_MIN, campCosts } from "./camp-costs.ts";
import { classicApi } from "../game/classic.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import type { GameState } from "../game/types.ts";

// #196: строка «Лагеря» обещает то, что случится с отношениями при исполнении, и не появляется на первом ходу.
async function fresh(country: string, seed: number): Promise<GameState> {
  return createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", seed), seededRandom(seed));
}

test("цена по лагерям: совпадает с исполненным решением, силовики видны до предупреждения", async () => {
  let warnedSecurity = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let state = await fresh(ALTERNATE_COUNTRY, seed);
    while (!state.ended && state.turn < 20) {
      const started = startEvent(state, await classicApi.event(state));
      const choices = started.currentEvent!.choices;
      if (started.turn === 0) for (const choice of choices) assert.deepEqual(campCosts(started, choice), [], "первый ход без новых строк");
      const choice = choices[(started.turn + seed) % choices.length];
      const shown = campCosts(started, choice);
      if (shown.some(camp => camp.delta < 0 && started.factions.find(f => f.id === camp.id)?.bloc === "security")) warnedSecurity++;
      state = resolveTurn(started, choice.id, await classicApi.consequence(started, choice.id));
      if (state.lastTurn?.success === false) continue;
      for (const camp of shown) {
        const actual = state.lastTurn!.factionRelChanges[camp.id] ?? 0;
        assert.ok(Math.sign(actual) === Math.sign(camp.delta), `${seed}, ход ${state.turn}, ${camp.name}: обещано ${camp.delta}, вышло ${actual}`);
      }
      assert.ok(shown.length <= 3 && shown.every(camp => Math.abs(camp.delta) >= CAMP_COST_MIN));
    }
  }
  assert.ok(warnedSecurity >= 6, `предупреждений о силовиках в вариантах: ${warnedSecurity}`);
});

test("цена по лагерям: архивные страны не меняются", async () => {
  const state = await fresh("Грузия", 3);
  const started = startEvent({ ...state, turn: 2 }, await classicApi.event({ ...state, turn: 2 }));
  for (const choice of started.currentEvent!.choices) assert.deepEqual(campCosts(started, choice), []);
});
