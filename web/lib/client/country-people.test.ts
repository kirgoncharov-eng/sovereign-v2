import { test } from "node:test";
import assert from "node:assert/strict";
import { countryNotes, sheetAlerts, staffNote } from "./country-people.ts";
import { classicApi } from "../game/classic.ts";
import { COUNTRIES, CRISIS_THRESHOLD, HOSTILE_RELATION } from "../game/data.ts";
import { DISLOYAL_BELOW, createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import { DESK_FROM } from "../game/desk-timing.ts";
import { candidatePool, hireAdvisor } from "../game/staffing.ts";
import type { GameState } from "../game/types.ts";

async function fresh(country = "Грузия", seed = 4): Promise<GameState> {
  return createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", seed), seededRandom(seed));
}

test("тревоги на кнопках: опоры ниже порога кризиса, нелояльные советники и враждебные лагеря", async () => {
  const state = await fresh();
  const calm = {
    ...state,
    resources: { ...state.resources, economy: 60, military: 60, internalLegitimacy: 60, externalReputation: 60, politicalCapital: 60, personalResource: 60 },
    factions: state.factions.map(faction => ({ ...faction, relation: 0 })),
    advisors: state.advisors.map(advisor => ({ ...advisor, loyalty: 70 })),
  };
  assert.deepEqual(sheetAlerts(calm), { country: 0, people: 0 });
  const troubled = {
    ...calm,
    resources: { ...calm.resources, economy: CRISIS_THRESHOLD - 1, military: CRISIS_THRESHOLD },
    factions: calm.factions.map((faction, index) => (index === 0 ? { ...faction, relation: HOSTILE_RELATION } : faction)),
    advisors: calm.advisors.map((advisor, index) => (index === 0 ? { ...advisor, loyalty: DISLOYAL_BELOW - 1 } : advisor)),
  };
  assert.deepEqual(sheetAlerts(troubled), { country: 1, people: 2 }, "ровно на пороге кризиса — ещё не тревога");
});

test("итоги свёрнутых разделов «Страны» во всех странах: без пустых слотов и с верными числами", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    let state = await fresh(country, 9);
    const empty = countryNotes(state);
    assert.equal(empty.chronicle, "пусто");
    assert.equal(empty.laws, "пока нет");
    for (let turn = 0; turn < 3; turn++) {
      state = startEvent(state, await classicApi.event(state));
      const id = state.currentEvent!.choices[0].id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
    }
    const notes = countryNotes(state);
    assert.equal(notes.chronicle, `${state.history.length} решения`);
    if (state.promises?.length) assert.match(notes.promises!, new RegExp(`^исполнено \\d из ${state.promises.length}`));
    for (const line of Object.values(notes)) assert.ok(line === null || !/\{|undefined|NaN/.test(line), `${country}: «${line}»`);
  }
  const state = await fresh();
  const withLaws = { ...state, laws: [{ id: "a", since: 1 }, { id: "b", since: 2 }] } as GameState;
  assert.equal(countryNotes(withLaws).laws, "2 закона");
  const promises = [{ status: "kept" }, { status: "broken" }, { status: "open" }] as GameState["promises"];
  assert.equal(countryNotes({ ...state, promises }).promises, "исполнено 1 из 3 · нарушено 1");
});

test("кадровый резерв: до стола молчит, затем считает кандидатов и помнит решение квартала", async () => {
  const state = await fresh("Армения", 6);
  assert.equal(staffNote(state), null, "на первых ходах кадров нет");
  const open = { ...state, turn: DESK_FROM };
  assert.equal(staffNote(open), "3 кандидата");
  const hired = hireAdvisor(open, candidatePool(open)[0].id);
  assert.equal(staffNote(hired), "решение квартала принято");
  assert.equal(staffNote({ ...hired, turn: hired.turn + 1 }), "2 кандидата");
  assert.equal(staffNote({ ...open, daily: "2026-10-10" }), null, "в «Деле дня» кадров нет");
});
