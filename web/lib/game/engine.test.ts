import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, COSTS, CRISIS_DRAIN, LIMITS, MAX_TURNS, START_RES } from "./data.ts";
import {
  applyDeltas, choiceEffects, computePolls, createInitialState, delayedEffects, detectEnd, planTurn, resolveTurn, conveneCouncil, startEvent, tickCrises,
} from "./engine.ts";
import { FACTION_PASS, personalDelta } from "./people.ts";
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
  // Потери весят больше выгод: бесплатных решений почти не бывает.
  const priced = Object.fromEntries(Object.entries(ACTIONS.repress.res).map(([k, v]) => [k, v < 0 ? Math.round(v * COSTS.weight) : v]));
  assert.deepEqual(fx.resources, priced);
  assert.ok((fx.resources.internalLegitimacy ?? 0) < (ACTIONS.repress.res.internalLegitimacy ?? 0));
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
  assert.deepEqual(next.resources, planTurn(s, "a").resources);
  assert.ok(next.resources.economy <= START_RES.debut.economy + Math.round((ACTIONS.social.res.economy ?? 0) * COSTS.weight));
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

test("фигура: доля движения своего лагеря плюс личная реакция по характеру", () => {
  const s = startEvent(newGame(), event());
  const plan = planTurn(s, "b", { assumeSuccess: true }); // repress: силовики теплеют
  const kgb = s.keyFigures.find(f => f.id === "kgb")!;
  const expected = Math.round((plan.effects.factionRel.siloviki ?? 0) * FACTION_PASS) + personalDelta(s.seed, kgb, "security", ["repress"], false);
  assert.ok((plan.effects.factionRel.siloviki ?? 0) > 0);
  assert.equal(plan.keyFigures.find(f => f.id === "kgb")!.relation - kgb.relation, expected);
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
  assert.equal(detectEnd(s.resources, s.factions, MAX_TURNS), "mandate"); // переизбрание решают выборы в planTurn
  assert.equal(detectEnd({ ...s.resources, economy: LIMITS.endResource }, s.factions, MAX_TURNS), "collapse");
  assert.equal(detectEnd({ ...s.resources, internalLegitimacy: 0 }, s.factions, 5), "revolution");
  const angry = s.factions.map(f => ({ ...f, relation: -100 }));
  assert.equal(detectEnd(s.resources, angry, 5), "revolution");
});

test("powerLoss сохраняется только при поражении", () => {
  const s = startEvent({ ...newGame(), resources: { ...START_RES.debut, economy: 8 } }, event());
  const next = resolveTurn(s, "a", { ...narration, powerLoss: "Переворот." });
  assert.equal(next.endType, "collapse");
  assert.equal(next.powerLoss, "Переворот.");
});

test("опрос: доли в сумме 100, Запад и Кремль не голосуют, отношение двигает рейтинг", () => {
  const s = newGame();
  const p = computePolls(s.country, s.factions, s.resources);
  assert.equal(p.leader + p.undecided + p.parties.reduce((a, x) => a + x.share, 0), 100);
  const noForeign = computePolls(s.country, s.factions.map(f => f.bloc === "west" ? { ...f, relation: -100 } : f), s.resources);
  assert.equal(noForeign.leader, p.leader);
  const loved = computePolls(s.country, s.factions.map(f => ({ ...f, relation: 100 })), s.resources);
  assert.ok(loved.leader > p.leader);
});

test("парламентские выборы на 10-м ходу: победа даёт бонус, провал — импичмент", () => {
  const at9 = (factions: GameState["factions"]) => startEvent({ ...newGame(), turn: 9, factions }, event([choice("a", ["delay"]), choice("b", ["delay"])]));
  const won = resolveTurn(at9(newGame().factions), "a", narration);
  assert.equal(won.lastTurn?.election?.outcome, "won");
  assert.equal(won.elections.length, 1);
  const hated = newGame().factions.map(f => ({ ...f, relation: f.bloc === "security" ? 0 : -85 }));
  const lost = resolveTurn(at9(hated), "a", narration);
  assert.equal(lost.lastTurn?.election?.outcome, "impeached");
  assert.equal(lost.endType, "impeachment");
});

test("президентские выборы на последнем ходу решают переизбрание", () => {
  const s = startEvent({ ...newGame(), turn: MAX_TURNS - 1 }, event([choice("a", ["delay"]), choice("b", ["delay"])]));
  assert.equal(resolveTurn(s, "a", narration).endType, "reelected");
});

test("враждебные и сильные силовики устраивают переворот", () => {
  const base = newGame();
  const s = startEvent({ ...base, turn: 4, factions: base.factions.map(f => f.bloc === "security" ? { ...f, relation: -95 } : f) }, event([choice("a", ["delay"]), choice("b", ["delay"])]));
  assert.equal(resolveTurn(s, "a", narration).endType, "coup");
});

test("совет: тратит сбор, предложения считаются движком с учётом качества советника", () => {
  const s = startEvent(newGame(), event());
  const charges = s.councilCharges;
  const adv = (skill: 1 | 2 | 3) => ({ id: "security", name: "Павел", role: "Советник", skill });
  const proposal = (skill: 1 | 2 | 3): Choice => ({ ...choice("x1", ["repress"]), advisor: adv(skill) });
  const withCouncil = conveneCouncil(s, [proposal(3)]);
  assert.equal(withCouncil.councilCharges, charges - 1);
  const next = resolveTurn(withCouncil, "x1", narration);
  assert.equal(next.history[0].choice, "Вариант x1");
  const strong = choiceEffects(s, proposal(3)).resources;
  const weak = choiceEffects(s, proposal(1)).resources;
  assert.ok((strong.internalLegitimacy ?? 0) > (weak.internalLegitimacy ?? 0)); // потери у сильного меньше
  assert.ok((strong.military ?? 0) >= (weak.military ?? 0));                   // выгода больше
  assert.equal(conveneCouncil({ ...s, councilCharges: 0 }, [proposal(2)]).currentEvent?.council, undefined);
});

test("советники: четыре роли, качество 1–3", () => {
  const s = newGame();
  assert.equal(s.advisors.length, 4);
  assert.ok(s.advisors.every(a => a.skill >= 1 && a.skill <= 3));
});

test("отложенные последствия: встают в очередь и срабатывают через заданное число ходов", () => {
  const delayOnly = event([choice("a", ["delay"]), choice("b", ["delay"])]);
  let s = resolveTurn(startEvent(newGame(), event()), "a", narration); // social → инфляция через 3 хода
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].due, 4);
  assert.equal(s.lastTurn?.scheduled[0].label, "Раздача денег разогнала цены");
  s = resolveTurn(startEvent(s, delayOnly), "a", narration);
  s = resolveTurn(startEvent(s, delayOnly), "a", narration);
  assert.equal(s.pending.filter(p => p.label.startsWith("Раздача денег")).length, 1);
  const before = s.resources.economy;
  s = resolveTurn(startEvent(s, delayOnly), "a", narration);
  assert.equal(s.lastTurn?.matured[0].label, "Раздача денег разогнала цены");
  assert.ok(s.resources.economy < before);
  assert.ok(!s.pending.some(p => p.label.startsWith("Раздача денег")));
});

test("слабый советник оставляет недоработку", () => {
  const weak: Choice = { ...choice("x1", ["security"]), advisor: { id: "security", name: "П", role: "С", skill: 1 } };
  const strong: Choice = { ...weak, advisor: { ...weak.advisor!, skill: 3 } };
  assert.ok(delayedEffects(weak).some(d => d.label === "Советник недоглядел"));
  assert.equal(delayedEffects(strong).length, 0);
});

test("антагонист интриги — мужчина, если есть выбор", async () => {
  const { pickArc, isFemaleName } = await import("./engine.ts");
  assert.equal(isFemaleName("Анна Лис"), true);
  assert.equal(isFemaleName("Нино Беридзе"), true);
  assert.equal(isFemaleName("Никита Жук"), false);
  const s = newGame();
  const advisors = s.advisors.map((a, i) => ({ ...a, name: i === 0 ? "Павел Гром" : "Анна Лис" }));
  for (let i = 0; i < 20; i++) {
    const arc = pickArc({ ...s, advisors }, () => (i % 3) / 3);
    if (arc.id === "mole") assert.equal(arc.target, "Павел Гром");
  }
});

test("причина падения называет рухнувший ресурс", async () => {
  const { endCause } = await import("./engine.ts");
  const res = { politicalCapital: 50, economy: 3, military: 50, internationalReputation: 50, internalLegitimacy: 50, personalResource: 50 };
  const cause = endCause({ endType: "collapse", resources: res as never, factions: [] });
  assert.match(cause!, /экономика — 3 из 100/);
  assert.equal(endCause({ endType: "mandate", resources: res as never, factions: [] }), null);
});
