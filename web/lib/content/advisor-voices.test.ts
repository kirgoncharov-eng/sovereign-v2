import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "../game/classic.ts";
import { createDailyState } from "../game/daily-run.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import { debate } from "../game/forecasts.ts";
import { hasPresidentialCouncil, isPresidentialDiscussion } from "../game/presidential-story.ts";
import { unifiedResolution } from "../client/advisor-outlook.ts";
import { hasInvestigationDebate } from "./investigation-debates.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import type { Choice, DifficultyId, GameEvent, GameState } from "../game/types.ts";
import { ADVISOR_VOICES, ENVOY_DEEDS, MANNER_LINES } from "./advisor-voices.ts";

const TERM = 20;
const DAILY_DATES = ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];

// Связка узнаётся по самому длинному постоянному куску шаблона, если его нет в тексте других шаблонов.
function tics(): Map<string, string> {
  const templates = [
    ...Object.values(ADVISOR_VOICES).flatMap(voice => [...voice.verdict, ...voice.agree, ...voice.noStake]),
    ...Object.values(MANNER_LINES).flat(),
  ];
  const pieces = templates.map(template => template.split(/\{[^}]*\}/).map(piece => piece.trim()).sort((a, b) => b.length - a.length)[0]);
  const marks = new Map<string, string>();
  templates.forEach((template, index) => {
    const piece = pieces[index];
    if (piece.length < 8) return;
    if (templates.some((other, at) => at !== index && other.includes(piece))) return;
    marks.set(piece, template);
  });
  return marks;
}

// Спор под делом виден только на старом экране резолюции — так же, как в /game и /chronicle (#381).
const debateVisible = (state: GameState) => !unifiedResolution(state) && !hasPresidentialCouncil(state)
  && !isPresidentialDiscussion(state) && !hasInvestigationDebate(state);

const pickChoice = (event: GameEvent, index: number): Choice => event.press || event.call || event.budget
  ? event.choices[1] : event.choices.filter(option => !option.path)[index] ?? event.choices[0];

test("1978: спор советников в обычной партии скрыт экраном резолюции — голоса звучат в «Деле дня»", async () => {
  const setup = await classicApi.setup(ALTERNATE_COUNTRY, "coalition", "pragmatist", 3);
  let state = createInitialState(ALTERNATE_COUNTRY, "coalition", "pragmatist", setup, seededRandom(3));
  let visible = 0;
  while (!state.ended && state.turn < TERM) {
    state = startEvent(state, await classicApi.event(state));
    if (debate(state) && debateVisible(state)) visible++;
    const choice = pickChoice(state.currentEvent!, 0);
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  assert.equal(visible, 0);
});

test("«Дело дня» 1978: связка советника не повторяется за партию", async () => {
  const marks = tics();
  assert.ok(marks.size > 60, `узнаваемых связок ${marks.size}`);
  let shown = 0;
  for (const [index, date] of DAILY_DATES.entries()) {
    let state = await createDailyState(date);
    assert.equal(state.country, ALTERNATE_COUNTRY);
    const texts: string[] = [];
    while (!state.ended && state.turn < 40) {
      state = startEvent(state, await classicApi.event(state));
      if (debateVisible(state)) for (const take of debate(state) ?? []) texts.push(take.text);
      const choice = pickChoice(state.currentEvent!, index % 2);
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    }
    shown += texts.length;
    const all = texts.join("\n");
    for (const [piece, template] of marks) {
      const count = all.split(piece).length - 1;
      assert.ok(count <= 1, `${date}: «${template}» — ${count} раза`);
    }
  }
  assert.ok(shown >= 40, `видимых реплик ${shown}`);
});

// Постоянная часть поступка посла: всё после «{name}, {role}, ».
const ENVOY_TAILS = Object.values(ENVOY_DEEDS).flatMap(deeds => [...deeds.pro, ...deeds.con]).map(line => line.replace("{name}, {role}, ", ""));

test("1978: посол не повторяет поступок, пока в пуле есть новые (seed 19: ходы 1 и 6 на a5520bb)", async () => {
  const runs: [number, DifficultyId][] = [[19, "coalition"], [11, "crisis"], [3, "coalition"], [7, "debut"], [23, "ruins"]];
  for (const [seed, difficulty] of runs) {
    const setup = await classicApi.setup(ALTERNATE_COUNTRY, difficulty, "pragmatist", seed);
    let state = createInitialState(ALTERNATE_COUNTRY, difficulty, "pragmatist", setup, seededRandom(seed));
    const seen = new Map<string, number>();
    while (!state.ended && state.turn < TERM) {
      state = startEvent(state, await classicApi.event(state));
      const choice = pickChoice(state.currentEvent!, 1);
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
      const told = [state.lastTurn?.narrative ?? "", ...(state.lastTurn?.reactions ?? [])].join("\n");
      for (const tail of ENVOY_TAILS) if (told.includes(tail)) seen.set(tail, (seen.get(tail) ?? 0) + 1);
    }
    for (const [tail, count] of seen) assert.equal(count, 1, `${seed}/${difficulty}: «${tail}» — ${count} раза`);
  }
});

test("1978: у каждого советника свои вступления и свои слова о том, что его не касается", () => {
  const roles = Object.values(ADVISOR_VOICES);
  for (const voice of roles) {
    assert.ok(voice.verdict.length >= 10 && voice.noStake.length >= 10, "по десять вариантов");
    for (const line of [...voice.verdict, ...voice.agree]) assert.match(line, /\{n\}/, line);
    for (const line of voice.noStake) assert.doesNotMatch(line, /\{/, line);
  }
  const lines = roles.flatMap(voice => [...voice.verdict, ...voice.noStake]);
  assert.equal(new Set(lines).size, lines.length, "одна и та же фраза у двух ролей");
});

// Прошедшее время и краткие прилагательные выдают род: «видел», «согласна», «уверен». Существительные на -л — в исключениях.
const NOT_VERBS = new Set(["протокол", "протокола", "отдел", "дел", "дела", "стол"]);
const SHORT_FORMS = /(?:^|\s)(?:уверен|уверена|согласен|согласна|готов|готова|должен|должна|рад|рада)(?=[\s.,!?:]|$)/iu;

test("1978: фразы советников и послов без рода говорящего", () => {
  const all = [
    ...Object.values(ADVISOR_VOICES).flatMap(voice => [...voice.verdict, ...voice.agree, ...voice.noStake]),
    ...Object.values(MANNER_LINES).flat(),
    ...Object.values(ENVOY_DEEDS).flatMap(deeds => [...deeds.pro, ...deeds.con]),
  ];
  for (const line of all) {
    const words = line.replace(/\{[^}]*\}/g, "").split(/[\s.,!?«»:—]+/u).filter(Boolean);
    assert.deepEqual(words.filter(word => /(?:ла|л)$/u.test(word) && !NOT_VERBS.has(word.toLowerCase())), [], line);
    assert.doesNotMatch(line, SHORT_FORMS, line);
  }
});

test("1978: послы России и Торгового союза ведут себя по-разному", () => {
  const russia = [...ENVOY_DEEDS.amb_russia.pro, ...ENVOY_DEEDS.amb_russia.con];
  const union = [...ENVOY_DEEDS.amb_eu.pro, ...ENVOY_DEEDS.amb_eu.con];
  assert.ok(russia.every(line => !union.includes(line)));
  for (const line of [...russia, ...union]) assert.match(line, /^\{name\}, \{role\}, /, line);
  for (const deeds of Object.values(ENVOY_DEEDS)) assert.ok(deeds.pro.length >= 5 && deeds.con.length >= 5);
});
