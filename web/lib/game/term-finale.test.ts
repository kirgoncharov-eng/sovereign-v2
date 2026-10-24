import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { PARTIES, TERM } from "./data.ts";
import { termFinale, termMemories } from "./term-finale.ts";
import { ALTERNATE_EVENTS } from "../content/alternate-history.ts";
import { PARTY_GENITIVE, TERM_FINALE, TERM_MEMORY } from "../content/term-finale.ts";
import { NEWS_LEAD, splitLead, withoutHeadline } from "../client/brief.ts";
import type { Election, GameState, HistoryEntry } from "./types.ts";

// Критерии #147 (п. 6): ночь выборов в кампании 1978 года подводит итог срока, а не прячет его за делом дня.
async function playToElection(country: string, seed: number, promises?: GameState["promises"]): Promise<GameState> {
  const intro = await classicApi.setup(country, "debut", "pragmatist", seed);
  let state = createInitialState(country, "debut", "pragmatist", intro, seededRandom(seed));
  if (promises) state = { ...state, promises };
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

test("память срока: у каждого варианта всех восьми дел свой успех и свой провал", () => {
  for (const card of ALTERNATE_EVENTS.filter(event => event.id.startsWith("alt_"))) {
    const memory = TERM_MEMORY[card.id];
    assert.ok(memory, `${card.id}: нет памяти срока`);
    assert.deepEqual(Object.keys(memory).sort(), card.choices.map(choice => choice.text).sort(), `${card.id}: варианты`);
    const lines = Object.values(memory).flatMap(choice => [choice.ok, choice.failed]);
    assert.equal(new Set(lines).size, lines.length, `${card.id}: у вариантов не должно быть общей строки`);
    for (const line of lines) assert.ok(line.length <= 160 && !/\{|undefined/.test(line), `${card.id}: «${line}»`);
    // Подпись и её исход — именно эта строка, а не строка соседнего варианта.
    card.choices.forEach((choice, index) => {
      assert.deepEqual(termMemories(stateWith([caseEntry(card.id, index, true)])), [memory[choice.text].ok], `${card.id}/${index} ok`);
      assert.deepEqual(termMemories(stateWith([caseEntry(card.id, index, false)])), [memory[choice.text].failed], `${card.id}/${index} fail`);
    });
  }
  for (const party of PARTIES[ALTERNATE_COUNTRY]) assert.ok(PARTY_GENITIVE[party.name], `${party.name}: нет родительного падежа`);
  // Срок — 20 кварталов, то есть пять лет, а не четыре.
  assert.equal(TERM / 4, 5);
  for (const line of [TERM_FINALE.noCases, TERM_FINALE.next]) assert.match(line, /пять лет/);
});

test("память срока: по одной строке на дело, больше трёх — начало, середина и конец; второй срок помнит только своё", () => {
  const ids = ["alt_wages", "alt_fuel", "alt_standards", "alt_district", "alt_rail"];
  const history = [caseEntry("alt_wages", 1), entry("Звонок из прошлого", "Ответить"), caseEntry("alt_fuel", 0, false),
    caseEntry("alt_wages", 2), ...ids.slice(2).map(id => caseEntry(id, 2))];
  const lines = termMemories(stateWith(history));
  assert.deepEqual(lines, [
    TERM_MEMORY.alt_wages["Получить аванс под трёхлетний российский заказ"].ok,
    TERM_MEMORY.alt_standards["Отдать контракт конкурсу заводов без гарантии казны"].ok,
    TERM_MEMORY.alt_rail["Согласовать единый график с министрами"].ok,
  ]);
  assert.deepEqual(termMemories(stateWith(history.slice(0, 3))), [
    TERM_MEMORY.alt_wages["Получить аванс под трёхлетний российский заказ"].ok,
    TERM_MEMORY.alt_fuel["Дать транзитный приоритет в обмен на скидку"].failed,
  ]);
  const second = [...Array.from({ length: TERM }, () => caseEntry("alt_wages")), caseEntry("alt_radio", 1)];
  assert.deepEqual(termMemories(stateWith(second)), [TERM_MEMORY.alt_radio["Проверить магазин до следующего выпуска"].ok]);
});

test("ночь выборов: падеж партии, перевес; законы и обещания — после решения хода выборов; поражение — одной строкой", () => {
  const open = { id: "a", progress: 0, status: "open" as const };
  const state = stateWith([caseEntry("alt_harvest", 0)], { laws: [], promises: [open] });
  const after = {
    laws: [{ id: "alt_export_guarantee", since: 5 }],
    promises: [{ id: "a", progress: 1, status: "kept" as const }, { id: "b", progress: 0, status: "broken" as const }, open],
  };
  const won = termFinale(state, election("won", 27, 26), 1, after);
  assert.ok(won.lead.startsWith(`${TERM_FINALE.won.replace("{pct}", "27").replace("{rivalPct}", "26").replace("{rival}", "Гражданского движения")} `
    + `${TERM_FINALE.margin.narrow} ${TERM_FINALE.summary}`));
  assert.match(won.lead, /закупочную цену подняли/);
  assert.match(won.lead, /«О гарантиях экспортных заказов»/);
  assert.match(won.lead, /Из 3 предвыборных обещаний выполнено 1, нарушено 1/);
  assert.match(won.after[0], /^Начинается второй срок\./);
  // Обещание, исполненное самим решением хода выборов, газета считает исполненным (замечание ревью #154).
  const keptNow = termFinale(state, election("won", 40, 30), 1, { laws: [], promises: [{ ...open, status: "kept" }] });
  assert.match(keptNow.lead, /Единственное предвыборное обещание выполнено\./);
  const brokenNow = termFinale(state, election("won", 40, 30), 1, { laws: [], promises: [{ ...open, status: "broken" }, { ...open, id: "b" }] });
  assert.match(brokenNow.lead, /не выполнено ни одного, нарушено 1/);
  assert.equal(termFinale(state, election("won", 50, 20), 1, after).lead.includes(TERM_FINALE.margin.wide), true);
  const lost = termFinale(state, election("lost", 24, 38), 1, after);
  assert.equal(lost.lead, "Президентские выборы. К полуночи всё ясно: у «Гражданского движения» 38%, у вас 24%. "
    + "В штабе молча выключают телевизоры.");
  assert.deepEqual(lost.after, []);
  assert.match(termFinale(stateWith([]), election("won", 40, 30), 1, { laws: [], promises: [] }).lead, new RegExp(TERM_FINALE.noCases));
});

test("кампания 1978: газета ночи выборов открывается результатом и подводит итог срока", async () => {
  let wins = 0;
  // «Никаких дубинок» исполняется самим решением хода выборов (срок обещания — 20-й ход): газета обязана это учесть.
  const pledged: GameState["promises"] = [{ id: "no_batons", progress: 0, status: "open" }, { id: "pensions", progress: 0, status: "open" }];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const state = await playToElection(ALTERNATE_COUNTRY, seed, pledged);
    const report = state.lastTurn!;
    const result = state.elections?.at(-1);
    if (result?.turn !== TERM || result.kind !== "president") continue;
    const narrative = report.narrative;
    assert.doesNotMatch(narrative, /у «Гражданское движение»|у «Труд и порядок»|у «Союз республики»|\{|undefined/, `seed ${seed}`);
    if (result.outcome !== "won" || !narrative.startsWith("Президентские выборы.")) continue; // особая развязка «вопроса о сроках»
    wins++;
    // Итог срока — в первом абзаце: газета показывает его без «Читать полностью».
    assert.match(narrative.split("\n\n")[0], /Наутро газеты вспоминают весь срок\./, `seed ${seed}`);
    assert.deepEqual(splitLead(withoutHeadline(narrative, report.headline), NEWS_LEAD).lead, [narrative.split("\n\n")[0]], `seed ${seed}`);
    assert.match(narrative, /Начинается второй срок\./, `seed ${seed}`);
    assert.doesNotMatch(narrative, /в январе/, `seed ${seed}`);
    const promises = state.promises ?? [];
    const kept = promises.filter(promise => promise.status === "kept").length;
    const broken = promises.filter(promise => promise.status === "broken").length;
    assert.ok(promises.every(promise => promise.status !== "open"), `seed ${seed}: к 20-му ходу обещания закрыты`);
    const counted = kept ? `Из ${promises.length} предвыборных обещаний выполнено ${kept}${broken ? `, нарушено ${broken}` : "."}`
      : `не выполнено ни одного, нарушено ${broken}`;
    assert.ok(narrative.includes(counted), `seed ${seed}: газета считает обещания после решения — ждали «${counted}»`);
  }
  assert.ok(wins >= 3, `обычных побед на выборах за 12 партий: ${wins}`);
});

test("прежние страны — архив: ночь выборов пишется по-старому", async () => {
  for (const seed of [1, 2, 3]) {
    const state = await playToElection("Грузия", seed);
    const narrative = state.lastTurn?.narrative ?? "";
    assert.doesNotMatch(narrative, /Наутро газеты вспоминают весь срок|Начинается второй срок\./, `seed ${seed}`);
  }
});
