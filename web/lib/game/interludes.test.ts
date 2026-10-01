import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi, inspectEvent, inspectTurns, pressChoice, pressEvent, PRESS_TURNS } from "./classic.ts";
import { BIOGRAPHIES, BIO_RES, START_RES } from "./data.ts";
import { createInitialState, planTurn, resolveTurn, startEvent, successChance } from "./engine.ts";
import type { Choice, GameState } from "./types.ts";

const newGame = async (seed = 3, bio?: string): Promise<GameState> =>
  createInitialState("Украина", "coalition", "liberal", await classicApi.setup("Украина", "coalition", "liberal", seed), () => 0.4, "classic", bio);
const at = (s: GameState, turn: number): GameState => ({ ...s, turn: turn - 1, arc: null });

test("проверка документа: три доклада за партию, первый лжёт, исходы зависят от отмеченной строки", async () => {
  const s0 = await newGame();
  const turns = inspectTurns(s0.seed);
  const docs = turns.map(t => inspectEvent(at(s0, t)));
  assert.ok(docs.every(Boolean));
  assert.equal(docs.filter(d => d!.doc!.key === null).length, 1, "один честный доклад");
  assert.notEqual(docs[0]!.doc!.key, null, "первый доклад лжёт");
  const ev = docs[0]!;
  const s = startEvent(at(s0, turns[0]), ev);
  // подписать ложь: сейчас выгодно, через два хода всплывёт со своей сценой
  const accept = planTurn(s, "a");
  assert.equal(accept.success, true);
  assert.ok(accept.scheduled.some(p => p.story && p.due === s.turn + 3));
  // уличить верно — легитимность растёт, ошибиться — падает
  assert.ok((planTurn(s, "c").effects.resources.internalLegitimacy ?? 0) > 0);
  assert.ok((planTurn(s, "d").effects.resources.internalLegitimacy ?? 0) < 0);
  // предпросмотр «Утвердить» и «Вернуть» не выдаёт, лжёт ли доклад
  const honest = docs.find(d => d!.doc!.key === null)!;
  const pick = (e: typeof ev, id: string) => e.choices.find(c => c.id === id)!.deal;
  assert.deepEqual(pick(ev, "a")!.res, pick(honest, "a")!.res);
  assert.deepEqual(pick(ev, "b")!.res, pick(honest, "b")!.res);
});

test("пресс-конференция: накануне выборов, три вопроса без повторов, молчание наказуемо", async () => {
  let s = await newGame();
  const first = pressEvent(at(s, PRESS_TURNS[0]))!;
  assert.equal(first.press!.questions.length, 3);
  s = startEvent(at(s, PRESS_TURNS[0]), first);
  const talk = pressChoice(s, [0, 0, 0]), silent = pressChoice(s, [-1, -1, -1]);
  assert.ok((silent.deal!.res!.internalLegitimacy ?? 0) <= -6);
  assert.ok(talk.headline!.startsWith("Президент: «"));
  assert.ok(talk.scene!.includes("На вопрос"));
  const withFinal: GameState = { ...s, currentEvent: { ...s.currentEvent!, choices: [talk, s.currentEvent!.choices[1]] } };
  const next = resolveTurn(withFinal, "p", await classicApi.consequence(withFinal, "p"));
  assert.equal(next.lastTurn!.success, true);
  const second = pressEvent(at(next, PRESS_TURNS[1]))!;
  const ids = (e: typeof first) => e.press!.questions.map(q => q.id);
  assert.ok(ids(second).every(id => !ids(first).includes(id)), "вопросы не повторяются");
});

test("биография: свои решения надёжнее, одна опора на старте крепче", async () => {
  const plain = await newGame(3), officer = await newGame(3, "officer");
  const bio = BIOGRAPHIES.find(b => b.id === "officer")!;
  assert.equal(officer.resources[bio.res], Math.min(100, START_RES.coalition[bio.res] + BIO_RES));
  const c: Choice = { id: "a", text: "", hint: "", tags: ["security"], resolvesCrisis: null };
  assert.ok(successChance(officer, c) > successChance(plain, c));
});
