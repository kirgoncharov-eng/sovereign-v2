import { test } from "node:test";
import assert from "node:assert/strict";
import { countryNotes, governmentNote, inboxRows, sheetAlerts, staffNote } from "./country-people.ts";
import { presidentialMessages, presidentialReplyActions } from "./presidential-inbox.ts";
import { interveneWorld, openLivingWorld } from "../game/living-world.ts";
import { classicApi } from "../game/classic.ts";
import { COUNTRIES, CRISIS_THRESHOLD, HOSTILE_RELATION } from "../game/data.ts";
import { DISLOYAL_BELOW, createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import { DESK_FROM } from "../game/desk-timing.ts";
import { candidatePool, hireAdvisor } from "../game/staffing.ts";
import type { GameState } from "../game/types.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import { ALTERNATE_EVENTS } from "../content/alternate-history.ts";

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

test("обращения в «Людях»: кто ждёт ответа — первым, с заголовком; после ответа строка остаётся без требования", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const initial = await fresh(country, 15);
    const fuel = ALTERNATE_EVENTS.find(card => card.id === 'alt_fuel')!;
    const state = openLivingWorld(country === ALTERNATE_COUNTRY ? {
      ...initial, turn: 5,
      history: [{ year: 1979, title: fuel.title, choice: fuel.choices[0].text, headline: '', historianNote: '', success: true }],
    } : initial);
    const rows = inboxRows(state);
    const messages = presidentialMessages(state);
    assert.ok(rows.length > 0, `${country}: на столе есть обращения`);
    assert.equal(rows.filter(row => row.waiting).length, new Set(messages.filter(m => m.needsReply).map(m => m.person)).size);
    const firstCalm = rows.findIndex(row => !row.waiting);
    assert.ok(firstCalm === -1 || rows.slice(firstCalm).every(row => !row.waiting), `${country}: ждущие ответа идут первыми`);
    for (const row of rows) {
      assert.ok(row.name && row.role && row.note && !/\{|undefined/.test(row.note), `${country}: «${row.note}»`);
      if (row.waiting) assert.match(row.note, /^ждёт ответа: /);
    }
  }
  const state = openLivingWorld(await fresh("Украина", 15));
  const energy = presidentialMessages(state).find(message => message.key === "energy")!;
  const answered = interveneWorld(state, presidentialReplyActions(state, energy)[0].id);
  const row = inboxRows(answered).find(entry => entry.id === energy.person);
  assert.equal(row?.waiting ?? false, false, "после назначения энергосеть больше не ждёт ответа");
  assert.deepEqual(inboxRows({ ...state, daily: "2026-10-12" }), [], "в «Деле дня» стола нет");
});

test("правительство в «Стране»: программы в работе и личное поручение квартала", async () => {
  const state = openLivingWorld(await fresh("Молдова", 3));
  assert.deepEqual(governmentNote(state), { programs: "0 из 2 в работе", quota: "одно личное поручение на квартал свободно" });
  const energy = presidentialMessages(state).find(message => message.key === "energy")!;
  const assigned = interveneWorld(state, presidentialReplyActions(state, energy)[0].id);
  assert.deepEqual(governmentNote(assigned), { programs: "1 из 2 в работе", quota: "личное поручение квартала подписано" });
  assert.equal(governmentNote({ ...state, world: undefined }), null);
});
