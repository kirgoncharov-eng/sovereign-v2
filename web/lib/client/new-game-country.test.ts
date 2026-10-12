import test from "node:test";
import assert from "node:assert/strict";
import { countryForNewRun, NEW_GAME_COUNTRY } from "./new-game-country.ts";
import { COUNTRIES, SAVE_VERSION } from "../game/data.ts";
import { dailyCaseForDate } from "../game/daily.ts";
import { classicApi } from "../game/classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import { parseSave } from "./save.ts";

test("новая обычная кампания начинается в альтернативном 1978 году; общее дело дня не переназначается", () => {
  assert.equal(NEW_GAME_COUNTRY, "Беларусь · 1978");
  assert.equal(countryForNewRun(), NEW_GAME_COUNTRY);
  assert.equal(countryForNewRun(null), NEW_GAME_COUNTRY);
  const dailyCountries = new Set<string>();
  for (let day = 1; day <= 31; day++) {
    const daily = dailyCaseForDate(`2026-10-${String(day).padStart(2, "0")}`);
    const before = JSON.stringify(daily);
    assert.equal(countryForNewRun(daily), daily.country);
    assert.equal(JSON.stringify(daily), before);
    dailyCountries.add(daily.country);
  }
  assert.ok(dailyCountries.size > 1);
});

test("прежние и историческая кампании продолжаются и повторно загружаются без смены страны", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const seed = 1;
    const intro = await classicApi.setup(country, "debut", "pragmatist", seed);
    let state = createInitialState(country, "debut", "pragmatist", intro, seededRandom(seed));
    state = startEvent(state, await classicApi.event(state));
    const raw = JSON.stringify({ version: SAVE_VERSION, screen: "game", state });
    const loaded = parseSave(raw)!;
    assert.ok(loaded, country);
    assert.equal(loaded.state.country, country);
    const choice = loaded.state.currentEvent!.choices[0];
    const next = resolveTurn(loaded.state, choice.id, await classicApi.consequence(loaded.state, choice.id));
    const reloaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: next }))!;
    assert.equal(reloaded.state.country, country);
    assert.equal(reloaded.state.turn, 1);
    assert.deepEqual(reloaded.state, next);
  }
});
