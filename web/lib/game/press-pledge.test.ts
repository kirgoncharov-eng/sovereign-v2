import test from "node:test";
import assert from "node:assert/strict";
import { classicApi, pressChoice, pressEvent, PRESS_TURNS } from "./classic.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { createInitialState, planTurn, seededRandom, startEvent } from "./engine.ts";
import { pledgeCase, pledgeQuestion, PLEDGE_QUESTION_ID } from "./press-pledge.ts";
import type { GameState, PromiseState } from "./types.ts";

const newGame = async (seed = 7): Promise<GameState> => {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, "coalition", "pragmatist", seed);
  return createInitialState(ALTERNATE_COUNTRY, "coalition", "pragmatist", intro, seededRandom(seed));
};
const at = (state: GameState, turn: number, promises: PromiseState[]): GameState => ({ ...state, turn: turn - 1, arc: null, promises });
const OPEN: PromiseState = { id: "dialogue", progress: 0, status: "open" };

test("вопрос об обещании строится из обещания партии и попадает на пресс-конференцию первым", async () => {
  const state = at(await newGame(), PRESS_TURNS[0], [OPEN]);
  const question = pledgeQuestion(state)!;
  assert.ok(question.text.includes("разговаривать даже с теми"), question.text);
  assert.ok(question.text.includes("исполнено 0 из 3"), question.text);
  assert.equal(question.answers.length, 3);
  assert.equal(new Set(question.answers.map(a => a.tone)).size, 3);
  assert.ok(question.answers.every(a => a.stake), "цена названа словами");
  const event = pressEvent(state)!;
  assert.equal(event.press!.questions[0].id, PLEDGE_QUESTION_ID);
  assert.equal(event.press!.questions[0].seconds, 30);
});

test("без обещаний, у архивных стран и в «Деле дня» вопрос не появляется", async () => {
  const base = await newGame();
  assert.equal(pledgeCase(at(base, PRESS_TURNS[0], [])), null);
  assert.equal(pledgeCase(at(base, PRESS_TURNS[0], [{ ...OPEN, status: "kept" }])), null);
  assert.equal(pledgeCase(at(base, PRESS_TURNS[0], [{ id: "neighbour", progress: 0, status: "open" }])), null, "«никогда» держится само");
  assert.equal(pledgeCase({ ...at(base, PRESS_TURNS[0], [OPEN]), country: "Украина" }), null);
  assert.equal(pledgeCase({ ...at(base, PRESS_TURNS[0], [OPEN]), daily: "2026-10-30" }), null);
});

test("нарушенное обещание спрашивают раньше открытого", async () => {
  const state = at(await newGame(), PRESS_TURNS[0], [OPEN, { id: "no_batons", progress: 0, status: "broken", turn: 4 }]);
  assert.equal(pledgeCase(state)!.promise.id, "no_batons");
  assert.ok(pledgeQuestion(state)!.text.includes("нарушено"));
});

test("признание, доказательство и отказ стоят по-разному; пустое доказательство замечают", async () => {
  const empty = at(await newGame(), PRESS_TURNS[0], [OPEN]);
  const done = at(await newGame(), PRESS_TURNS[0], [{ ...OPEN, progress: 2 }]);
  const [admit, prove, renounce] = pledgeQuestion(done)!.answers;
  const [, emptyProve] = pledgeQuestion(empty)!.answers;
  assert.ok((admit.res.politicalCapital ?? 0) < 0 && (admit.res.internalLegitimacy ?? 0) > 0);
  assert.ok((prove.res.politicalCapital ?? 0) > 0 && !prove.after);
  assert.ok((emptyProve.res.internalLegitimacy ?? 0) < 0 && emptyProve.after, "противоречие слову замечено");
  assert.ok((renounce.rel.liberal ?? 0) < 0 && renounce.renounce === "dialogue");
  assert.notEqual(prove.text, emptyProve.text);
});

test("публичный отказ закрывает обещание как нарушенное; признание и доказательство его не трогают", async () => {
  const base = at(await newGame(), PRESS_TURNS[0], [OPEN]);
  const state = startEvent(base, pressEvent(base)!);
  const picks = (index: number) => [index, -1, -1];
  const after = (index: number) => {
    const choice = pressChoice(state, picks(index));
    const played = { ...state, currentEvent: { ...state.currentEvent!, choices: [choice] } };
    return planTurn(played, choice.id).promises[0];
  };
  assert.equal(after(0).status, "open");
  assert.equal(after(1).status, "open");
  assert.equal(after(2).status, "broken");
  const choice = pressChoice(state, [2, -1, -1]);
  assert.ok(choice.scene!.includes("дословную фразу"), "реакция лагеря в тексте хода");
});
