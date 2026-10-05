import { test } from "node:test";
import assert from "node:assert/strict";
import { LAWS } from "../content/laws.ts";
import { EVENT_CARDS } from "../content/events.ts";
import { ACTION_TAGS, COUNTRIES, START_RES } from "./data.ts";
import { cardAvailable, classicApi, fill, lawEvent } from "./classic.ts";
import { createInitialState, planTurn, resolveTurn, startEvent } from "./engine.ts";
import { stepLaws } from "./laws.ts";
import type { Faction, GameState } from "./types.ts";

test("законы: каталог согласован, у каждого есть дело-последствие с текстами", () => {
  const ids = new Set(LAWS.map(l => l.id));
  assert.equal(ids.size, LAWS.length);
  for (const l of LAWS) {
    for (const t of [...l.tags, ...l.veto]) assert.ok((ACTION_TAGS as readonly string[]).includes(t), `${l.id}: ${t}`);
    for (const c of l.conflicts ?? []) assert.ok(ids.has(c), `${l.id} → ${c}`);
    for (const c of l.countries ?? []) assert.ok(COUNTRIES[c], `${l.id}: ${c}`);
    assert.ok(l.pitch.includes(`{fac:${l.bloc}}`), `${l.id}: законопроект вносит {fac:${l.bloc}}`);
    assert.ok(l.passed.length > 80 && l.failed.length > 60 && l.vetoed.length > 60, l.id);
    assert.ok(Object.values(l.perTurn).every(v => Math.abs(v ?? 0) <= 2), `${l.id}: закон действует мягко, но каждый ход`);
    assert.ok(EVENT_CARDS.some(c => c.id === `law_${l.id}` && c.when?.law === l.id), `${l.id}: дело-последствие`);
  }
});

test("закон: принятый действует со следующего хода и каждый ход, отменённый — перестаёт", () => {
  const factions = [{ id: "opp", name: "Оппозиция", bloc: "liberal", relation: 0, approval: 30 }] as Faction[];
  let st = stepLaws([], { id: "foreign_agents", act: "enact" }, true, 3, factions);
  assert.deepEqual(st.laws, [{ id: "foreign_agents", since: 3 }]);
  assert.deepEqual(st.res, {}, "в ход принятия закон ещё не действует");
  st = stepLaws(st.laws, undefined, true, 4, factions);
  assert.deepEqual(st.res, { military: 1, externalReputation: -1 });
  assert.equal(st.rel.opp, -1);
  assert.equal(stepLaws([], { id: "foreign_agents", act: "enact" }, false, 3, factions).laws.length, 0, "парламент провалил — закона нет");
  st = stepLaws(st.laws, { id: "foreign_agents", act: "repeal" }, true, 5, factions);
  assert.deepEqual([st.laws, st.res], [[], {}]);
});

test("законопроект в партии: вносится, проходит, ложится в свод, приносит дело-последствие; конфликтующий не вносится", async () => {
  const intro = await classicApi.setup("Армения", "coalition", "liberal", 7);
  let s: GameState = createInitialState("Армения", "coalition", "liberal", intro, () => 0.5);
  s = { ...s, resources: { ...START_RES.debut }, arc: s.arc ? { ...s.arc, done: [1, 3, 7, 12, 16] } : null };
  // ищем ход, на котором вносят законопроект
  let bill = null;
  for (let t = 1; t < 18 && !bill; t++) bill = lawEvent({ ...s, turn: t, seed: s.seed + t * 7919 });
  assert.ok(bill, "законопроекты вносятся");
  assert.ok(!/\{\w+/.test(bill!.title + bill!.description + bill!.choices.map(c => c.scene).join("")), "слоты заполнены");
  const enact = bill!.choices.find(c => c.law?.act === "enact")!;
  s = startEvent({ ...s, turn: 2 }, bill!);
  const plan = planTurn(s, enact.id, { assumeSuccess: true });
  assert.equal(plan.laws[0]?.id, enact.law!.id);
  const next = resolveTurn(s, enact.id, await classicApi.consequence(s, enact.id));
  if (next.lastTurn?.success) {
    assert.deepEqual(next.lastTurn.law, { id: enact.law!.id, act: "enact", passed: true });
    const card = EVENT_CARDS.find(c => c.id === `law_${enact.law!.id}`)!;
    assert.equal(cardAvailable(card, { ...next, turn: next.turn }), false, "последствие — не сразу");
    assert.equal(cardAvailable(card, { ...next, turn: next.turn + 2 }), true, "через два хода — может прийти");
  }
  // евроинтеграция и союзный договор не уживаются
  const withUnion = { ...s, laws: [{ id: "union_treaty", since: 1 }], usedEvents: [] };
  for (let t = 3; t < 18; t++) {
    const b = lawEvent({ ...withUnion, turn: t, seed: s.seed + t * 104729 });
    assert.notEqual(b?.choices[0].law?.id, "eu_course");
  }
  assert.ok(fill("{fac:security}", s));
});
