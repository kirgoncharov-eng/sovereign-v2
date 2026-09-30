import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, CRISIS_DRAIN, LIMITS, MAX_TURNS, START_RES } from "./data.ts";
import {
  applyDeltas, choiceEffects, computePublicApproval, createInitialState, detectEnd, planTurn, resolveTurn, startEvent, tickCrises,
} from "./engine.ts";
import type { Choice, GameEvent, GameState, Narration } from "./types.ts";

const intro = {
  leader: { name: "Андрей Ковальчук", party: "Новая Беларусь", bio: "Бывший дипломат." },
  speech: "Речь.",
  situation: "Ситуация.",
  players: ["Иван Петров", "Сергей Орлов"],
};

// «Дебют» без давления обстоятельств — эффекты решений видны в чистом виде.
const newGame = (): GameState => createInitialState("Беларусь", "debut", "pragmatist", intro, () => 0.5);

const choice = (id: string, tags: Choice["tags"], resolvesCrisis: string | null = null): Choice =>
  ({ id, text: `Вариант ${id}`, hint: "", tags, resolvesCrisis });

const event = (choices: Choice[] = [choice("a", ["social"]), choice("b", ["repress"])]): GameEvent => ({
  title: "Забастовка на МАЗе", source: "Улица", description: "", isCritical: false,
  affectedFactions: [], choices, randomEvent: null,
});

const narration: Narration = {
  headline: "Заголовок", narrative: "Текст", reactions: [], historianNote: "Историк.",
  crisisTitle: null, crisisDescription: null, powerLoss: null,
};

test("createInitialState: стартовые ресурсы, фракции с блоками, имена фигур", () => {
  const s = newGame();
  assert.deepEqual(s.resources, START_RES.debut);
  assert.equal(s.factions.length, 8);
  assert.equal(s.factions.find(f => f.id === "siloviki")?.bloc, "security");
  assert.equal(s.keyFigures[0].name, "Иван Петров");
  assert.equal(s.keyFigures[2].name, "Посол России");
});

test("applyDeltas держит ресурсы в 0..100", () => {
  const r = applyDeltas({ ...START_RES.debut, economy: 98 }, { economy: 10, military: -100 });
  assert.equal(r.economy, 100);
  assert.equal(r.military, 0);
});

test("choiceEffects: цена решения берётся из каталога действий и блоков фракций", () => {
  const s = newGame();
  const fx = choiceEffects(s, choice("a", ["repress"]));
  assert.deepEqual(fx.resources, ACTIONS.repress.res);
  assert.equal(fx.factionRel.siloviki, ACTIONS.repress.rel.security);
  assert.equal(fx.factionRel.opposition, ACTIONS.repress.rel.liberal);
  assert.equal(fx.factionRel.church, undefined);
});

test("choiceEffects: идеология усиливает свои решения и наказывает чужие", () => {
  const liberal = { ...newGame(), ideo: "liberal" as const };
  const own = choiceEffects(liberal, choice("a", ["reform"])).resources.personalResource ?? 0;
  const alien = choiceEffects(liberal, choice("a", ["repress"])).resources.personalResource ?? 0;
  assert.ok(own > (ACTIONS.reform.res.personalResource ?? 0));
  assert.ok(alien < 0);
});

test("choiceEffects: два тега суммируются, но не выходят за лимит", () => {
  const fx = choiceEffects(newGame(), choice("a", ["security", "repress"]));
  assert.equal(fx.resources.military, Math.min(LIMITS.resourceDelta, 12));
});

test("resolveTurn применяет посчитанный движком итог и пишет отчёт", () => {
  const s = startEvent(newGame(), event());
  const next = resolveTurn(s, "a", narration);
  assert.equal(next.turn, 1);
  assert.equal(next.resources.economy, START_RES.debut.economy + (ACTIONS.social.res.economy ?? 0));
  assert.equal(next.history[0].choice, "Вариант a");
  assert.equal(next.currentEvent, null);
  assert.deepEqual(next.lastTurn?.tags, ["social"]);
  assert.deepEqual(next.prevResources, START_RES.debut);
});

test("planTurn и resolveTurn детерминированы: сервер и клиент считают одно и то же", () => {
  const s = startEvent(createInitialState("Украина", "ruins", "leftist", intro, () => 0.3), event());
  assert.deepEqual(planTurn(s, "b").resources, planTurn(s, "b").resources);
  assert.deepEqual(resolveTurn(s, "b", narration).resources, planTurn(s, "b").resources);
});

test("фигуры следуют за своей фракцией", () => {
  const s = startEvent(newGame(), event());
  const next = resolveTurn(s, "b", narration); // repress: силовики теплеют
  const kgb = (st: GameState) => st.keyFigures.find(f => f.id === "kgb")!.relation;
  assert.ok(kgb(next) > kgb(s));
});

test("отказ при неизвестном выборе или без события", () => {
  assert.throws(() => resolveTurn(newGame(), "a", narration));
  assert.throws(() => resolveTurn(startEvent(newGame(), event()), "z", narration));
});

test("провал ресурса ниже порога порождает кризис с названием от модели", () => {
  const base = { ...newGame(), resources: { ...START_RES.debut, economy: 22 } };
  const next = resolveTurn(startEvent(base, event()), "a", { ...narration, crisisTitle: "Дефолт" }); // social: экономика -7
  assert.equal(next.activeCrises.length, 1);
  assert.equal(next.activeCrises[0].title, "Дефолт");
  assert.deepEqual(next.activeCrises[0].resourceDrain, { economy: -CRISIS_DRAIN });
  assert.equal(next.lastTurn?.newCrisis?.title, "Дефолт");
});

test("решение с resolvesCrisis закрывает кризис", () => {
  const crisis = { id: "c1", title: "Блэкаут", description: "", severity: "high" as const, resourceDrain: { economy: -2 }, turnsActive: 0 };
  const s = startEvent({ ...newGame(), activeCrises: [crisis] }, event([choice("a", ["social"], "c1"), choice("b", ["delay"])]));
  const next = resolveTurn(s, "a", narration);
  assert.equal(next.activeCrises.length, 0);
  assert.equal(next.lastTurn?.resolvedCrisis, "Блэкаут");
  const kept = resolveTurn(s, "b", narration);
  assert.equal(kept.activeCrises.length, 1);
});

test("враждебная фракция вредит каждый ход", () => {
  const base = newGame();
  const hostile = { ...base, factions: base.factions.map(f => f.id === "gossektor" ? { ...f, relation: -90 } : f) };
  const calm = resolveTurn(startEvent(base, event([choice("a", ["delay"]), choice("b", ["delay"])])), "a", narration);
  const hurt = resolveTurn(startEvent(hostile, event([choice("a", ["delay"]), choice("b", ["delay"])])), "a", narration);
  assert.ok(hurt.resources.economy < calm.resources.economy);
});

test("tickCrises: кризис затухает по истечении срока", () => {
  const crisis = { id: "c1", title: "Слухи", description: "", severity: "low" as const, resourceDrain: { economy: -1 }, turnsActive: 2 };
  const r = tickCrises([crisis], START_RES.debut);
  assert.equal(r.crises.length, 0);
  assert.deepEqual(r.expired, ["Слухи"]);
});

test("detectEnd: поражение важнее конца мандата, легитимность → революция", () => {
  const s = newGame();
  assert.equal(detectEnd(s.resources, s.factions, 3), null);
  assert.equal(detectEnd(s.resources, s.factions, MAX_TURNS), "mandate");
  assert.equal(detectEnd({ ...s.resources, economy: LIMITS.endResource }, s.factions, MAX_TURNS), "collapse");
  assert.equal(detectEnd({ ...s.resources, internalLegitimacy: 0 }, s.factions, 5), "revolution");
  const angry = s.factions.map(f => ({ ...f, approval: 0 }));
  assert.equal(computePublicApproval(angry), 0);
  assert.equal(detectEnd(s.resources, angry, 5), "revolution");
});

test("powerLoss сохраняется только при поражении", () => {
  const s = startEvent({ ...newGame(), resources: { ...START_RES.debut, economy: 8 } }, event());
  const next = resolveTurn(s, "a", { ...narration, powerLoss: "Переворот." });
  assert.equal(next.endType, "collapse");
  assert.equal(next.powerLoss, "Переворот.");
});
