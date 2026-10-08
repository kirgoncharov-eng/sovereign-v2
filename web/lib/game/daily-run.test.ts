import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDailyMove, createDailyState, replayDaily, validDailyMoves } from "./daily-run.ts";
import { classicApi, budgetChoice, callChoice, pressChoice } from "./classic.ts";
import { conveneCouncil, resolveTurn, startEvent } from "./engine.ts";
import { runScore } from "./daily.ts";
import type { DailyMove, GameState } from "./types.ts";
import { POST } from "../../app/api/daily/route.ts";

// Независимо собираем ходы так, как это делает UI, затем сравниваем с серверным воспроизведением.
async function play(date: string) {
  let s = await createDailyState(date);
  const moves: DailyMove[] = [];
  const kinds = new Set<string>();
  while (!s.ended && moves.length < 400) {
    s = startEvent(s, await classicApi.event(s));
    const ev = s.currentEvent!;
    let choice = ev.choices.find(c => c.path === "exit") ?? ev.choices[0];
    const move: DailyMove = { id: choice.id };
    if (ev.budget) { move.budget = { alloc: { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, debt: false }; choice = budgetChoice(s, move.budget.alloc, false); kinds.add("budget"); }
    else if (ev.call) { move.call = { approach: "numbers", ending: "deal" }; choice = callChoice(s, "numbers", "deal"); kinds.add("call"); }
    else if (ev.press) { move.press = [0, -1, 2]; choice = pressChoice(s, move.press); kinds.add("press"); }
    else if (ev.doc) { choice = ev.choices.find(c => c.id === "c")!; kinds.add("inspect"); }
    else if (!ev.beat && !ev.special && s.councilCharges > 0) {
      const proposals = await classicApi.council(s);
      s = conveneCouncil(s, proposals);
      if (proposals.length) { move.council = true; choice = proposals[0]; kinds.add("council"); }
    }
    if (ev.budget || ev.call || ev.press) s = { ...s, currentEvent: { ...ev, choices: [choice, ev.choices[1]] } };
    move.id = choice.id;
    moves.push(move);
    s = resolveTurn(s, choice.id, await classicApi.consequence(s, choice.id));
  }
  return { state: s, moves, kinds };
}

test("дело дня: сервер воспроизводит решения, совет и все динамические дела", async () => {
  const seen = new Set<string>();
  for (let day = 1; day <= 24; day++) {
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    const { state, moves, kinds } = await play(date);
    kinds.forEach(k => seen.add(k));
    assert.ok(state.ended);
    const replay = await replayDaily(date, moves);
    assert.deepEqual(replay, state);
    assert.equal(runScore(replay), runScore(state));
  }
  assert.deepEqual([...seen].sort(), ["budget", "call", "council", "inspect", "press"]);
});

test("дело дня: незавершённые и невозможные партии не принимаются", async () => {
  assert.equal(validDailyMoves([{ id: "p", budget: { alloc: { army: 6, social: 6, economy: 6, apparatus: 6, culture: 6 }, debt: false } }]), false);
  assert.equal(validDailyMoves(Array.from({ length: 401 }, () => ({ id: "a" }))), false);
  await assert.rejects(replayDaily("2026-10-08", []));
  await assert.rejects(replayDaily("2026-10-08", [{ id: "invented" }]));
  await assert.rejects(replayDaily("2026-10-08", [{ id: "a" }]));
  const { moves } = await play("2026-10-08");
  await assert.rejects(replayDaily("2026-10-08", [...moves, { id: "a" }]));
  const s: GameState = await createDailyState("2026-10-08");
  await assert.rejects(applyDailyMove(s, { id: "p", press: [0, 0, 0] }));
});

test("API дела дня: выдуманные очки отвергаются, настоящие пересчитываются", async () => {
  const date = new Date().toISOString().slice(0, 10);
  const request = (body: Record<string, unknown>) => new Request("http://localhost/api/daily", { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "daily-test" }, body: JSON.stringify({ uid: "auditvalid01", action: "submit", date, ...body }) });
  assert.equal((await POST(request({ score: 9999, turns: 400 }))).status, 400);
  const { state, moves } = await play(date);
  const r = await POST(request({ moves, score: 9999, turns: 400, title: "Подделка" }));
  assert.equal(r.status, 200);
  const board = await r.json();
  assert.equal(board.me.turns, state.turn);
  assert.equal(board.me.score, Math.min(9999, runScore(state)));
  assert.notEqual(board.top[0].title, "Подделка");
  const duplicate = await POST(request({ moves: [] }));
  assert.equal(duplicate.status, 200);
  assert.deepEqual((await duplicate.json()).me, board.me);
});
