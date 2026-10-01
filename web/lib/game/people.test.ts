import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi, specialEvent } from "./classic.ts";
import { COUNTRIES } from "./data.ts";
import { createInitialState, planTurn, resolveTurn, startEvent, successChance } from "./engine.ts";
import { PACT_BROKEN, PACT_KEPT, TRAITS, bondOf, personalDelta, traitOf } from "./people.ts";
import { sanitizeState } from "./sanitize.ts";
import type { Choice, GameState, Narration } from "./types.ts";

const narration: Narration = { headline: "h", narrative: "n", reactions: [], historianNote: "", crisisTitle: null, crisisDescription: null, powerLoss: null };
const newGame = async (country = "Беларусь"): Promise<GameState> =>
  createInitialState(country, "coalition", "liberal", await classicApi.setup(country, "coalition", "liberal", 7), () => 0.5);
const withEvent = (s: GameState, choices: Choice[], extra = {}) =>
  startEvent(s, { title: "Дело", source: "", description: "", isCritical: false, affectedFactions: [], choices, randomEvent: null, ...extra });
const choice = (id: string, tags: Choice["tags"], deal?: Choice["deal"]): Choice => ({ id, text: id, hint: "", tags, resolvesCrisis: null, ...(deal ? { deal } : {}) });

test("люди: характер оценивает решение лично, отдельно от лагеря", async () => {
  const s = await newGame();
  const fig = s.keyFigures[0];
  const t = TRAITS[traitOf(s.seed, fig)];
  assert.ok(personalDelta(s.seed, fig, undefined, [t.like[0]], false) > 0);
  assert.ok(personalDelta(s.seed, fig, undefined, [t.dislike[0]], false) < 0);
  // Отношение человека меняется не так, как отношение его лагеря.
  const g = withEvent(s, [choice("a", [t.like[0]])]);
  const plan = planTurn(g, "a", { assumeSuccess: true });
  const facDelta = plan.effects.factionRel[fig.faction] ?? 0;
  const figDelta = plan.keyFigures[0].relation - fig.relation;
  assert.notEqual(figDelta, Math.round(facDelta * 0.8));
});

test("люди: свой человек во враждебном лагере и червоточина в дружественном", () => {
  const fig = { id: "x", role: "", faction: "f", name: "", loyalty: "нейтрал" as const, relation: 50 };
  const fac = { id: "f", name: "", desc: "", emoji: "", baseApproval: 10, bloc: "security" as const, approval: 10, relation: -40 };
  assert.equal(bondOf(fig, fac), "insider");
  assert.equal(bondOf({ ...fig, relation: -50 }, { ...fac, relation: 40 }), "mole");
  assert.equal(bondOf({ ...fig, relation: 40 }, { ...fac, relation: 40 }), "ally");
});

test("союз: подписание, доход каждый ход, исполнение в срок", async () => {
  let s = await newGame();
  const fac = s.factions.find(f => f.bloc === "west")!;
  s = withEvent(s, [choice("a", ["delay"], { pact: { faction: fac.id, turns: 2, ban: ["pro_russia"] } })]);
  s = resolveTurn(s, "a", narration);
  assert.equal(s.pacts?.length, 1);
  assert.deepEqual(s.lastTurn?.pacts?.signed, [fac.name]);
  const before = s.factions.find(f => f.id === fac.id)!.relation;
  for (let i = 0; i < 2; i++) { s = withEvent(s, [choice("a", ["delay"])]); s = resolveTurn(s, "a", narration); }
  assert.equal(s.pacts?.length, 0);
  assert.deepEqual(s.lastTurn?.pacts?.kept, [fac.name]);
  assert.equal(s.factions.find(f => f.id === fac.id)!.relation, before + PACT_KEPT.faction);
});

test("союз: запретное решение рвёт договор и бьёт по репутации у всех", async () => {
  let s = await newGame();
  const fac = s.factions.find(f => f.bloc === "west")!;
  s = withEvent(s, [choice("a", ["delay"], { pact: { faction: fac.id, turns: 4, ban: ["pro_russia"] } })]);
  s = resolveTurn(s, "a", narration);
  s = withEvent(s, [choice("a", ["pro_russia"])]);
  const plan = planTurn(s, "a");
  assert.ok((plan.effects.factionRel[fac.id] ?? 0) <= PACT_BROKEN.faction);
  s = resolveTurn(s, "a", narration);
  assert.equal(s.pacts?.length, 0);
  assert.equal(s.betrayals, 1);
  assert.deepEqual(s.lastTurn?.pacts?.broken, [fac.name]);
});

test("союз повышает шанс исполнения руками союзника", async () => {
  const s = await newGame();
  const fac = s.factions.find(f => f.bloc === "west")!;
  const c = choice("a", ["pro_west"]);
  const pact = { faction: fac.id, figure: null, since: 1, until: 5, ban: [], against: null };
  assert.ok(successChance({ ...s, pacts: [pact] }, c) >= successChance(s, c));
});

test("особые дела: появляются, без пустых слотов, сделка переживает сохранение", async () => {
  const kinds = new Set<string>();
  for (const country of Object.keys(COUNTRIES)) for (let seed = 1; seed <= 12; seed++) {
    let s = createInitialState(country, "coalition", "liberal", await classicApi.setup(country, "coalition", "liberal", seed), () => (seed * 0.07) % 1);
    while (!s.ended) {
      const ev = await classicApi.event(s);
      s = startEvent(s, ev);
      if (ev.special) {
        kinds.add(ev.special.kind);
        const text = [ev.title, ev.description, ...ev.choices.flatMap(c => [c.text, c.hint, c.scene, c.sceneFail, c.headline])].join(" ");
        assert.ok(!/\{\w+(:\w+)?\}/.test(text), `слот не заполнен: ${text}`);
        assert.ok(!text.includes("оппоненты"), text);
        const restored = sanitizeState(JSON.parse(JSON.stringify(s)))!;
        assert.deepEqual(restored.currentEvent?.choices.map(c => c.deal), ev.choices.map(c => c.deal));
        assert.deepEqual(restored.currentEvent?.special, ev.special);
        // Проверки документов и пресс-конференции идут по своему графику, а дела о людях и союзах — не подряд.
        if (!["inspect", "press"].includes(ev.special.kind)) assert.equal(specialEvent({ ...restored, turn: restored.turn + 1 }), null, "особые дела не идут подряд");
      }
      const id = ev.choices[0].id;
      s = resolveTurn(s, id, await classicApi.consequence(s, id));
    }
  }
  for (const k of ["pact", "overture"]) assert.ok(kinds.has(k), `нет дела ${k}`);
});
