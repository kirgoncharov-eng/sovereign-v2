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

test("звонок: дважды за партию, разные собеседники, подход по характеру делает разговор дешевле", async () => {
  const { callEvent, callChoice, approachWorks, CALL_TURNS } = await import("./classic.ts");
  const s0 = await newGame();
  const first = callEvent(at(s0, CALL_TURNS[0]))!;
  assert.ok(first.call && first.special?.kind === "call");
  const s = startEvent(at(s0, CALL_TURNS[0]), first);
  const all = ["offer", "principle", "pressure", "numbers"] as const;
  const good = all.find(a => approachWorks(first.call!.trait, a))!, bad = all.find(a => !approachWorks(first.call!.trait, a))!;
  const g = callChoice(s, good, "deal"), b = callChoice(s, bad, "deal");
  const cost = (c: Choice) => Object.values(c.deal!.res ?? {}).reduce((x, y) => x + (y ?? 0), 0);
  assert.ok(cost(g) > cost(b), "верный подход — уступка дешевле");
  assert.ok((g.deal!.figureRel ?? 0) > (b.deal!.figureRel ?? 0));
  assert.ok(!/\{\w+\}/.test(g.scene!), g.scene);
  const second = callEvent({ ...at(s, CALL_TURNS[1]), usedEvents: s.usedEvents })!;
  assert.notEqual(second.call!.figure, first.call!.figure, "второй звонок — от другого человека");
});

test("контент вставок полон: доклады, вопросы прессы, требования в звонках", async () => {
  const { INSPECT_DOCS } = await import("../content/inspect.ts");
  const { PRESS_QUESTIONS } = await import("../content/press.ts");
  const { CALL_DEMANDS, CALL_REPLIES } = await import("../content/calls.ts");
  for (const d of INSPECT_DOCS) {
    assert.ok(d.facts.length >= 2 && d.lines.length === 6, d.id);
    if (d.lie === null) assert.ok(!d.reveal && !d.exposed, `${d.id}: у честного доклада нет разоблачения`);
    else assert.ok(d.reveal && d.head && d.exposed?.story && d.lie < d.lines.length, `${d.id}: разоблачение и последствие`);
  }
  assert.equal(new Set(INSPECT_DOCS.map(d => d.id)).size, INSPECT_DOCS.length);
  for (const q of PRESS_QUESTIONS) {
    assert.equal(new Set(q.answers.map(a => a.tone)).size, 3, `${q.id}: три разных тона`);
  }
  assert.equal(new Set(PRESS_QUESTIONS.map(q => q.id)).size, PRESS_QUESTIONS.length);
  for (const list of Object.values(CALL_DEMANDS)) assert.ok(list.length >= 3);
  for (const r of Object.values(CALL_REPLIES)) assert.ok(r.ok.length >= 2 && r.no.length >= 2);
});
