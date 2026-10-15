import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { PARTIES, TERM } from "./data.ts";
import { termFinale, termMemories } from "./term-finale.ts";
import { ALTERNATE_EVENTS } from "../content/alternate-history.ts";
import { PARTY_GENITIVE, TERM_FINALE, TERM_MEMORY } from "../content/term-finale.ts";
import type { Election, GameState, HistoryEntry } from "./types.ts";

// Критерии #147 (п. 6): ночь выборов в кампании 1978 года подводит итог срока, а не прячет его за делом дня.
async function playToElection(country: string, seed: number): Promise<GameState> {
  const intro = await classicApi.setup(country, "debut", "pragmatist", seed);
  let state = createInitialState(country, "debut", "pragmatist", intro, seededRandom(seed));
  // Выборы конца срока проходят при переходе к ходу TERM: на этом ходе газета и подводит итог.
  while (!state.ended && state.elections?.at(-1)?.turn !== TERM) {
    state = startEvent(state, await classicApi.event(state));
    const choices = state.currentEvent!.choices;
    const id = choices[(state.turn + seed) % choices.length].id;
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
  }
  return state;
}

const entry = (title: string, choice: string, success = true): HistoryEntry =>
  ({ year: 1978, title, choice, success, headline: "", historianNote: "" });
const caseEntry = (id: string, option = 0, success = true) => {
  const card = ALTERNATE_EVENTS.find(event => event.id === id)!;
  return entry(card.title, card.choices[option].text, success);
};
const election = (outcome: Election["outcome"], leader: number, share: number): Election =>
  ({ turn: TERM, kind: "president", leader, top: { id: "citizens", name: "Гражданское движение", share }, outcome });
const stateWith = (history: HistoryEntry[], extra: Partial<GameState> = {}) =>
  ({ country: ALTERNATE_COUNTRY, turn: history.length + 1, history, laws: [], promises: [], ...extra }) as unknown as GameState;

test("память срока написана для каждого варианта всех восьми дел и для их провала", () => {
  for (const card of ALTERNATE_EVENTS.filter(event => event.id.startsWith("alt_"))) {
    const memory = TERM_MEMORY[card.id];
    assert.ok(memory, `${card.id}: нет памяти срока`);
    assert.deepEqual(Object.keys(memory.choices).sort(), card.choices.map(choice => choice.text).sort(), `${card.id}: варианты`);
    for (const line of [...Object.values(memory.choices), memory.failed]) {
      assert.ok(line.length <= 160 && !/\{|undefined/.test(line), `${card.id}: «${line}»`);
    }
  }
  for (const party of PARTIES[ALTERNATE_COUNTRY]) assert.ok(PARTY_GENITIVE[party.name], `${party.name}: нет родительного падежа`);
});

test("память срока: по одной строке на дело, провал помнят провалом, больше трёх — начало, середина и конец", () => {
  const ids = ["alt_wages", "alt_fuel", "alt_standards", "alt_district", "alt_rail"];
  const history = [caseEntry("alt_wages", 1), entry("Звонок из прошлого", "Ответить"), caseEntry("alt_fuel", 0, false),
    caseEntry("alt_wages", 2), ...ids.slice(2).map(id => caseEntry(id, 2))];
  const lines = termMemories(stateWith(history));
  assert.deepEqual(lines, [
    TERM_MEMORY.alt_wages.choices["Получить аванс под трёхлетний российский заказ"],
    TERM_MEMORY.alt_standards.choices["Позволить двум заводам конкурировать за контракт"],
    TERM_MEMORY.alt_rail.choices["Согласовать единый график с министрами"],
  ]);
  assert.deepEqual(termMemories(stateWith(history.slice(0, 3))), [
    TERM_MEMORY.alt_wages.choices["Получить аванс под трёхлетний российский заказ"],
    TERM_MEMORY.alt_fuel.failed,
  ]);
  // Во втором сроке вспоминают только его дела.
  const second = [...Array.from({ length: TERM }, () => caseEntry("alt_wages")), caseEntry("alt_radio", 1)];
  assert.deepEqual(termMemories(stateWith(second)), [TERM_MEMORY.alt_radio.choices["Проверить магазин до следующего выпуска"]]);
});

test("ночь выборов: падеж партии, перевес, законы и обещания; поражение — одной строкой", () => {
  const state = stateWith([caseEntry("alt_harvest", 0)], {
    laws: [{ id: "alt_export_guarantee", since: 5 }],
    promises: [{ id: "a", progress: 1, status: "kept" }, { id: "b", progress: 0, status: "broken" }, { id: "c", progress: 0, status: "open" }],
  });
  const won = termFinale(state, election("won", 27, 26), 1);
  assert.equal(won.result, `${TERM_FINALE.won.replace("{pct}", "27").replace("{rivalPct}", "26").replace("{rival}", "Гражданского движения")} `
    + TERM_FINALE.margin.narrow);
  assert.match(won.summary[0], /Повысить|закупочную цену подняли/);
  assert.match(won.summary[0], /Из 3 предвыборных обещаний выполнено 1, нарушено 1/);
  assert.match(won.summary[1], /^Второй срок начинается в январе/);
  assert.equal(termFinale(state, election("won", 50, 20), 1).result.endsWith(TERM_FINALE.margin.wide), true);
  const lost = termFinale(state, election("lost", 24, 38), 1);
  assert.equal(lost.result, "Президентские выборы. К полуночи всё ясно: у «Гражданского движения» 38%, у вас 24%. "
    + "В штабе молча выключают телевизоры.");
  assert.deepEqual(lost.summary, []);
  assert.match(termFinale(stateWith([]), election("won", 40, 30), 1).summary[0], new RegExp(TERM_FINALE.noCases));
});

test("кампания 1978: газета ночи выборов открывается результатом и подводит итог срока", async () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const state = await playToElection(ALTERNATE_COUNTRY, seed);
    const report = state.lastTurn!;
    const result = state.elections?.at(-1);
    if (result?.turn !== TERM || result.kind !== "president") continue;
    const narrative = report.narrative;
    assert.doesNotMatch(narrative, /у «Гражданское движение»|у «Труд и порядок»|у «Союз республики»|\{|undefined/, `seed ${seed}`);
    if (result.outcome !== "won" || !narrative.startsWith("Президентские выборы.")) continue; // особая развязка «вопроса о сроках»
    wins++;
    assert.match(narrative, /Наутро газеты вспоминают весь срок\./, `seed ${seed}`);
    assert.match(narrative, /Второй срок начинается в январе/, `seed ${seed}`);
  }
  assert.ok(wins >= 3, `обычных побед на выборах за 12 партий: ${wins}`);
});

test("прежние страны — архив: ночь выборов пишется по-старому", async () => {
  for (const seed of [1, 2, 3]) {
    const state = await playToElection("Грузия", seed);
    const narrative = state.lastTurn?.narrative ?? "";
    assert.doesNotMatch(narrative, /Наутро газеты вспоминают весь срок|срок начинается в январе/, `seed ${seed}`);
  }
});
