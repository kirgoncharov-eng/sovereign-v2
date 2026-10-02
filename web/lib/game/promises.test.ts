import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMISES, PROMISE_BROKEN, PROMISE_KEPT, PROMISE_OFFER, PROMISE_PICK } from "../content/promises.ts";
import { ACTION_TAGS, IDEOLOGIES, START_RES } from "./data.ts";
import { conflicts, initPromises, offeredPromises, promiseGoalText, promiseImpact, stepPromises } from "./promises.ts";
import { createInitialState, planTurn, resolveTurn, startEvent } from "./engine.ts";
import type { Faction, GameEvent, Narration } from "./types.ts";

const factions = [
  { id: "opp", name: "Оппозиция", bloc: "liberal", relation: 0, approval: 30 },
  { id: "sil", name: "Силовики", bloc: "security", relation: 0, approval: 30 },
] as Faction[];

test("обещания: каталог согласован с действиями, набор на выбор детерминирован и без противоречий в подсказке", () => {
  for (const p of PROMISES) {
    if (p.goal.kind !== "resource") assert.ok(p.goal.tags.every(t => (ACTION_TAGS as readonly string[]).includes(t)), p.id);
    assert.ok(promiseGoalText(p).length > 10);
  }
  for (const i of IDEOLOGIES) for (let seed = 1; seed < 200; seed += 7) {
    const a = offeredPromises(seed, i.id), b = offeredPromises(seed, i.id);
    assert.deepEqual(a, b, "одно зерно — один набор");
    assert.equal(new Set(a.offered).size, PROMISE_OFFER);
    assert.equal(a.suggested.length, PROMISE_PICK, `${i.id}: курсу хватает своих обещаний`);
    assert.ok(a.suggested.every(id => a.offered.includes(id)));
    const defs = a.suggested.map(id => PROMISES.find(p => p.id === id)!);
    assert.ok(!defs.some(x => defs.some(y => x !== y && conflicts(x, y))), "подсказанные обещания не противоречат друг другу");
  }
});

test("обещания: исполненное решение продвигает, на счётчике — исполнено, запретное — нарушено сразу", () => {
  let ps = initPromises(["europe", "no_batons", "growth"], START_RES.coalition);
  const r = START_RES.coalition;
  assert.deepEqual(promiseImpact(ps, ["pro_west", "repress"]), { advances: ["Курс на Европу"], breaks: ["Никаких дубинок"] });

  let st = stepPromises(ps, ["pro_west"], false, 1, r, factions);
  assert.equal(st.promises[0].progress, 0, "сорванное решение не засчитывается");
  st = stepPromises(ps, ["pro_west"], true, 1, r, factions);
  assert.equal(st.promises[0].progress, 1);
  assert.deepEqual(st.news.advanced, ["Курс на Европу"]);
  ps = st.promises;
  ps = stepPromises(ps, ["pro_west"], true, 2, r, factions).promises;
  st = stepPromises(ps, ["pro_west", "dialogue"], true, 3, r, factions);
  assert.equal(st.promises[0].status, "kept");
  assert.equal(st.res.internalLegitimacy, PROMISE_KEPT.res.internalLegitimacy);
  assert.equal(st.rel.opp, PROMISE_KEPT.rel, "довольны те, кому обещали");
  assert.equal(st.rel.sil, undefined);

  st = stepPromises(st.promises, ["repress"], false, 4, r, factions);
  assert.equal(st.promises[1].status, "broken", "умысел важнее исполнения");
  assert.equal(st.rel.opp, PROMISE_BROKEN.rel);
  assert.deepEqual(st.news.broken, ["Никаких дубинок"]);
});

test("обещания: в срок проверяются пороги, невыполненное считается нарушенным, «никогда» — исполненным", () => {
  const ps = initPromises(["fair_vote", "thieves", "free_press"], START_RES.coalition);
  assert.equal(ps[0].target, START_RES.coalition.internalLegitimacy + 5, "порог — рост от стартового уровня");
  const poor = { ...START_RES.coalition, internalLegitimacy: 30 };
  let st = stepPromises(ps, ["delay"], true, 10, poor, factions);
  assert.equal(st.promises[0].status, "broken", "легитимность ниже обещанного к выборам");
  assert.equal(st.promises[1].status, "open", "срок «до конца» ещё не наступил");
  st = stepPromises(st.promises, ["delay"], true, 20, poor, factions);
  assert.deepEqual(st.promises.map(p => p.status), ["broken", "broken", "kept"]);
  const rich = { ...START_RES.coalition, internalLegitimacy: 60 };
  assert.equal(stepPromises(initPromises(["fair_vote"], START_RES.coalition), [], true, 10, rich, factions).promises[0].status, "kept");
});

test("обещания в партии: planTurn применяет награду, отчёт хода сообщает о переменах", () => {
  const intro = { leader: { name: "Л", party: "П", bio: "" }, speech: "", situation: "", players: [] };
  const s0 = { ...createInitialState("Грузия", "coalition", "liberal", intro, () => 0.3), promises: initPromises(["no_batons"], START_RES.coalition) };
  const ev: GameEvent = { title: "Т", source: "", description: "", isCritical: false, affectedFactions: [], randomEvent: null,
    choices: [{ id: "a", text: "Разогнать", hint: "", tags: ["repress"], resolvesCrisis: null }, { id: "b", text: "Ждать", hint: "", tags: ["delay"], resolvesCrisis: null }] };
  const s = startEvent(s0, ev);
  const narr: Narration = { headline: "h", narrative: "n", reactions: [], historianNote: "", crisisTitle: null, crisisDescription: null, powerLoss: null };
  const bad = planTurn(s, "a"), calm = planTurn(s, "b");
  assert.equal(bad.promises[0].status, "broken");
  assert.ok(bad.resources.internalLegitimacy < calm.resources.internalLegitimacy);
  const next = resolveTurn(s, "a", narr);
  assert.deepEqual(next.lastTurn?.promises?.broken, ["Никаких дубинок"]);
  assert.equal(next.promises?.[0].status, "broken");
  // старые сохранения без обещаний продолжают работать
  const old = startEvent({ ...s0, promises: undefined }, ev);
  assert.deepEqual(planTurn(old, "a").promises, []);
});
