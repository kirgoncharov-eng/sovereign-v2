import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "../game/classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import { debate } from "../game/forecasts.ts";
import { hasPresidentialCouncil, isPresidentialDiscussion } from "../game/presidential-story.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import type { DifficultyId } from "../game/types.ts";
import { ADVISOR_VOICES, ENVOY_DEEDS, MANNER_LINES } from "./advisor-voices.ts";

const TERM = 20;
const DIFFICULTIES: DifficultyId[] = ["debut", "coalition", "crisis", "ruins"];
const RUNS: [number, DifficultyId][] = [3, 7, 11, 19, 23, 31, 40, 52].map((seed, index) => [seed, DIFFICULTIES[index % 4]]);

// Связка узнаётся по самому длинному постоянному куску шаблона, который не входит в другие шаблоны.
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
    if (pieces.some((other, at) => at !== index && other.includes(piece))) return;
    marks.set(piece, template);
  });
  return marks;
}

async function termDebates(seed: number, difficulty: DifficultyId): Promise<string[]> {
  const setup = await classicApi.setup(ALTERNATE_COUNTRY, difficulty, "pragmatist", seed);
  let state = createInitialState(ALTERNATE_COUNTRY, difficulty, "pragmatist", setup, seededRandom(seed));
  const texts: string[] = [];
  while (!state.ended && state.turn < TERM) {
    state = startEvent(state, await classicApi.event(state));
    // Игрок видит спор, только если вместо него не идёт «Разговор в кабинете» (стол и хроника).
    const visible = !hasPresidentialCouncil(state) && !isPresidentialDiscussion(state);
    for (const take of visible ? debate(state) ?? [] : []) texts.push(take.text);
    const event = state.currentEvent!;
    const choice = event.press || event.call || event.budget ? event.choices[1] : event.choices.find(option => !option.path) ?? event.choices[0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  return texts;
}

test("1978: в споре, который видит игрок, связка советника звучит за первый срок не больше двух раз", async () => {
  const marks = tics();
  assert.ok(marks.size > 60, `узнаваемых связок ${marks.size}`);
  for (const [seed, difficulty] of RUNS) {
    const texts = await termDebates(seed, difficulty);
    assert.ok(texts.length >= 2, `${seed}/${difficulty}: видимых реплик ${texts.length}`);
    const all = texts.join("\n");
    for (const [piece, template] of marks) {
      const count = all.split(piece).length - 1;
      assert.ok(count <= 2, `${seed}/${difficulty}: «${template}» — ${count} раза`);
    }
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
