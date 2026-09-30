import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, MAX_TURNS, START_RES } from "./data.ts";
import {
  applyDeltas, computePublicApproval, createInitialState, detectEnd, resolveTurn, startEvent, tickCrises,
} from "./engine.ts";
import type { Consequence, GameEvent, GameState } from "./types.ts";

const intro = {
  leader: { name: "Андрей Ковальчук", party: "Новая Беларусь", bio: "Бывший дипломат." },
  speech: "Речь.",
  situation: "Ситуация.",
  players: ["Иван Петров", "Сергей Орлов"],
};

const newGame = (): GameState => createInitialState("Беларусь", "coalition", "liberal", intro, () => 0.5);

const event: GameEvent = {
  title: "Забастовка на МАЗе",
  source: "Улица",
  description: "Рабочие перекрыли проспект.",
  isCritical: false,
  affectedFactions: ["gossektor"],
  choices: [
    { id: "a", text: "Выйти к рабочим", hint: "риск" },
    { id: "b", text: "Ввести ОМОН", hint: "цена" },
  ],
  randomEvent: null,
};

const consequence = (over: Partial<Consequence> = {}): Consequence => ({
  headline: "Президент вышел к рабочим",
  narrative: "Длинный текст.",
  resourceChanges: { economy: -5, internalLegitimacy: 8 },
  factionRelChanges: { gossektor: 10 },
  factionApprChanges: { youth: -3 },
  figureRelChanges: { interior: -20 },
  reactions: [],
  historianNote: "Историк.",
  newCrisis: null,
  crisisResolved: null,
  powerLoss: null,
  ...over,
});

test("createInitialState: стартовые ресурсы, фракции и имена фигур", () => {
  const s = newGame();
  assert.deepEqual(s.resources, START_RES.coalition);
  assert.equal(s.factions.length, 8);
  assert.equal(s.keyFigures[0].name, "Иван Петров");
  assert.equal(s.keyFigures[2].name, "Посол России"); // имени нет — остаётся роль
  assert.equal(s.turn, 0);
  assert.equal(s.ended, false);
});

test("applyDeltas держит ресурсы в 0..100 и игнорирует лишние ключи", () => {
  const r = applyDeltas({ ...START_RES.debut, economy: 98 }, { economy: 10, military: -100 });
  assert.equal(r.economy, 100);
  assert.equal(r.military, 0);
});

test("resolveTurn применяет изменения, пишет историю и отчёт", () => {
  const s = startEvent(newGame(), event);
  const next = resolveTurn(s, "a", consequence());
  assert.equal(next.turn, 1);
  assert.equal(next.resources.economy, START_RES.coalition.economy - 5);
  assert.equal(next.resources.internalLegitimacy, START_RES.coalition.internalLegitimacy + 8);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].choice, "Выйти к рабочим");
  assert.equal(next.currentEvent, null);
  assert.equal(next.lastTurn?.choiceText, "Выйти к рабочим");
  assert.deepEqual(next.prevResources, START_RES.coalition);
  const interior = next.keyFigures.find(f => f.id === "interior")!;
  const before = s.keyFigures.find(f => f.id === "interior")!;
  assert.equal(interior.relation, before.relation - 20);
});

test("resolveTurn отвергает неизвестный выбор и отсутствие события", () => {
  assert.throws(() => resolveTurn(newGame(), "a", consequence()));
  assert.throws(() => resolveTurn(startEvent(newGame(), event), "z", consequence()));
});

test("случайное событие применяется в том же ходе", () => {
  const s = startEvent(newGame(), { ...event, randomEvent: { title: "Утечка", description: "", resourceEffect: { politicalCapital: -4 } } });
  const next = resolveTurn(s, "a", consequence({ resourceChanges: {} }));
  assert.equal(next.resources.politicalCapital, START_RES.coalition.politicalCapital - 4);
});

test("кризисы: новый не тратит ресурсы в ход появления, потом тратит каждый ход", () => {
  let s = startEvent(newGame(), event);
  s = resolveTurn(s, "a", consequence({
    resourceChanges: {},
    newCrisis: { title: "Блэкаут", description: "", severity: "high", resourceDrain: { economy: -3 } },
  }));
  assert.equal(s.activeCrises.length, 1);
  assert.equal(s.activeCrises[0].id, "c1");
  assert.equal(s.resources.economy, START_RES.coalition.economy);
  assert.equal(s.lastTurn?.addedCrisis, true);

  s = resolveTurn(startEvent(s, event), "a", consequence({ resourceChanges: {} }));
  assert.equal(s.resources.economy, START_RES.coalition.economy - 3);
  assert.equal(s.activeCrises[0].turnsActive, 1);
});

test("кризис разрешается по id и не тратит ресурсы в ход разрешения", () => {
  let s = startEvent(newGame(), event);
  s = resolveTurn(s, "a", consequence({
    resourceChanges: {},
    newCrisis: { title: "Блэкаут", description: "", severity: "high", resourceDrain: { economy: -3 } },
  }));
  s = resolveTurn(startEvent(s, event), "a", consequence({ resourceChanges: {}, crisisResolved: "c1" }));
  assert.equal(s.activeCrises.length, 0);
  assert.equal(s.lastTurn?.resolvedCrisis, "Блэкаут");
  assert.equal(s.resources.economy, START_RES.coalition.economy);
});

test("число активных кризисов ограничено", () => {
  let s = newGame();
  for (let i = 0; i < LIMITS.maxActiveCrises + 2; i++) {
    s = resolveTurn(startEvent(s, event), "a", consequence({
      resourceChanges: {},
      newCrisis: { title: `Кризис ${i}`, description: "", severity: "critical", resourceDrain: {} },
    }));
  }
  assert.equal(s.activeCrises.length, LIMITS.maxActiveCrises);
  assert.equal(s.lastTurn?.addedCrisis, false);
});

test("tickCrises: кризис затухает по истечении срока", () => {
  const crisis = { id: "c1", title: "Слухи", description: "", severity: "low" as const, resourceDrain: { economy: -1 }, turnsActive: 2 };
  const r = tickCrises([crisis], START_RES.debut);
  assert.equal(r.crises.length, 0);
  assert.deepEqual(r.expired, ["Слухи"]);
  assert.equal(r.resources.economy, START_RES.debut.economy - 1);
});

test("detectEnd: поражение важнее конца мандата", () => {
  const s = newGame();
  assert.equal(detectEnd(s.resources, s.factions, 3), null);
  assert.equal(detectEnd(s.resources, s.factions, MAX_TURNS), "mandate");
  assert.equal(detectEnd({ ...s.resources, economy: LIMITS.endResource }, s.factions, MAX_TURNS), "collapse");
  const angry = s.factions.map(f => ({ ...f, approval: 0 }));
  assert.equal(computePublicApproval(angry), 0);
  assert.equal(detectEnd(s.resources, angry, 5), "revolution");
});

test("конец игры сохраняет powerLoss только при поражении", () => {
  const s = startEvent({ ...newGame(), resources: { ...START_RES.coalition, economy: 6 } }, event);
  const next = resolveTurn(s, "b", consequence({ resourceChanges: { economy: -5 }, powerLoss: "Переворот." }));
  assert.equal(next.ended, true);
  assert.equal(next.endType, "collapse");
  assert.equal(next.powerLoss, "Переворот.");
});
