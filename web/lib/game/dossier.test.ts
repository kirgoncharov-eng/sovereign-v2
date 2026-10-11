import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { COUNTRIES } from "./data.ts";
import {
  DISLOYAL_BELOW, LEAK_EVERY, SABOTAGE, createInitialState, leakingAdvisors, loyaltyOf, planTurn, resolveTurn, saboteurOf,
  seededRandom, startEvent, successChance,
} from "./engine.ts";
import { DESK_FROM } from "./desk-timing.ts";
import { debate } from "./forecasts.ts";
import { advisorProfile } from "./advisors.ts";
import { DOSSIER_COST, DOSSIER_PRESS_LOYALTY, DOSSIER_SECURITY_LOYALTY, applyDossier, dismissalOf, dossierBlocked } from "./staffing.ts";
import { LEAKS } from "../content/advisors.ts";
import { STAFFING_TEXT } from "../content/staffing.ts";
import type { Choice, GameState } from "./types.ts";

const SLOT = /\{[^}]*\}/;

async function fresh(country: string, seed: number, turn = DESK_FROM): Promise<GameState> {
  const state = createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", seed), seededRandom(seed));
  return { ...state, turn };
}
const withLoyalty = (state: GameState, id: string, loyalty: number, dossier = false): GameState => ({
  ...state,
  advisors: state.advisors.map(advisor => advisor.id !== id ? advisor
    : { ...advisor, loyalty, ...(dossier ? { dossier: { fact: "факт", turn: state.turn } } : {}) }),
});
const playable = (state: GameState) => {
  const event = state.currentEvent!;
  return (event.press || event.call || event.budget ? event.choices[1] : event.choices.find(choice => !choice.path) ?? event.choices[0]).id;
};

test("нелояльный советник без досье сливает дела раз в несколько ходов; с досье — молчит", async () => {
  let state = withLoyalty(await fresh("Грузия", 5), "economist", DISLOYAL_BELOW - 15);
  const economist = state.advisors.find(advisor => advisor.id === "economist")!;
  let leaks = 0, turns = 0;
  while (!state.ended && turns < 12) {
    state = startEvent(state, await classicApi.event(state));
    const id = playable(state);
    const plan = planTurn(state, id);
    const leaking = leakingAdvisors(state).some(advisor => advisor.id === "economist");
    assert.equal(plan.leaks.includes("economist"), leaking);
    if (leaking) {
      const source = plan.sources.economy?.find(([label]) => label === `утечка: ${economist.name}`);
      assert.deepEqual(source?.[1], LEAKS.economist.cost.economy, "утечка видна в разбивке ведомости");
    }
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
    if (leaking) {
      leaks++;
      const line = state.lastTurn!.leaks?.find(text => text.includes(economist.name));
      assert.ok(line && !SLOT.test(line), `газета пишет об утечке: ${line}`);
    }
    turns++;
  }
  assert.ok(leaks >= 2 && leaks <= Math.ceil(turns / LEAK_EVERY) + 3, `утечек ${leaks} за ${turns} ходов`);
  const silenced = withLoyalty(state, "economist", DISLOYAL_BELOW - 15, true);
  for (let turn = 0; turn < 12; turn++) assert.equal(leakingAdvisors({ ...silenced, turn }).length, 0, "с досье утечек нет");
});

test("саботаж: решение из области нелояльного советника исполняется хуже; лояльный и советник с досье не мешают", async () => {
  const state = await fresh("Казахстан", 9);
  const social: Choice = { id: "x", text: "Поднять пенсии", hint: "", tags: ["social"], resolvesCrisis: null };
  const loyal = successChance(state, social);
  const traitor = withLoyalty(state, "economist", DISLOYAL_BELOW - 10);
  assert.equal(saboteurOf(traitor, social)?.id, "economist");
  assert.ok(Math.abs(loyal - SABOTAGE - successChance(traitor, social)) < 0.011, `${loyal} → ${successChance(traitor, social)}`);
  assert.equal(successChance(withLoyalty(state, "economist", DISLOYAL_BELOW - 10, true), social), loyal, "с досье не саботирует");
  const repress: Choice = { ...social, tags: ["repress"] };
  assert.equal(saboteurOf(traitor, repress), null, "силовое решение вне области экономиста");
});

test("досье: силовики собирают за деньги и свою лояльность; это кадровое решение квартала", async () => {
  const state = await fresh("Армения", 14);
  const security = loyaltyOf(state.advisors.find(advisor => advisor.id === "security")!);
  const after = applyDossier(state, "economist", "collect");
  const economist = after.advisors.find(advisor => advisor.id === "economist")!;
  assert.ok(economist.dossier?.fact, "досье собрано");
  assert.equal(after.resources.economy, state.resources.economy + DOSSIER_COST.economy!);
  assert.equal(loyaltyOf(after.advisors.find(advisor => advisor.id === "security")!), security + DOSSIER_SECURITY_LOYALTY);
  assert.ok(after.staffing?.receipt?.includes(economist.name) && after.staffing.receipt.includes(economist.dossier!.fact));
  assert.ok(advisorProfile(after, economist).dossier, "карточка показывает досье");
  assert.equal(dossierBlocked(after, "strategist", "collect"), STAFFING_TEXT.quota);
  const nextQuarter = { ...after, turn: after.turn + 1 };
  assert.equal(dossierBlocked(nextQuarter, "economist", "collect"), STAFFING_TEXT.dossierExists);
  assert.equal(dossierBlocked(nextQuarter, "security", "collect"), STAFFING_TEXT.dossierSelf);
  assert.equal(dossierBlocked(nextQuarter, "strategist", "press"), STAFFING_TEXT.dossierMissing);
  assert.equal(dossierBlocked({ ...state, daily: "2026-10-10" }, "economist", "collect"), STAFFING_TEXT.daily);
  assert.equal(dossierBlocked({ ...state, turn: DESK_FROM - 1 }, "economist", "collect"), STAFFING_TEXT.early);
});

test("досье в ходу: лояльность растёт один раз, а уволить нелояльного можно без скандала", async () => {
  let state = applyDossier(withLoyalty(await fresh("Молдова", 2), "strategist", 20), "strategist", "collect");
  const strategist = () => state.advisors.find(advisor => advisor.id === "strategist")!;
  assert.equal(dismissalOf(state, strategist()).scandal, false, "с досье уходит тихо");
  assert.equal(dismissalOf(withLoyalty(state, "strategist", 20), { ...strategist(), dossier: undefined }).scandal, true);
  state = { ...state, turn: state.turn + 1 };
  state = applyDossier(state, "strategist", "press");
  assert.equal(loyaltyOf(strategist()), 20 + DOSSIER_PRESS_LOYALTY);
  assert.equal(strategist().dossier?.used, true);
  assert.equal(dossierBlocked({ ...state, turn: state.turn + 1 }, "strategist", "press"), STAFFING_TEXT.dossierUsed);
});

// Критерий #82: игрок раз за разом выбирает против советника — лояльность падает, и последствие наступает.
test("если игнорировать советника, он становится нелояльным и сливает дела в газету", async () => {
  let leakedGames = 0;
  for (const country of Object.keys(COUNTRIES).slice(0, 3)) {
    let state = await fresh(country, 31, 0);
    const target = "economist";
    let leaked = false, disloyalAt: number | null = null;
    for (let turn = 0; turn < 90 && !state.ended && !leaked; turn++) {
      // Страна держится: проверяем окружение, а не то, как быстро рушится власть от решений наперекор.
      state = { ...state, resources: { politicalCapital: 60, economy: 60, military: 60, externalReputation: 60, internalLegitimacy: 60, personalResource: 60 } };
      state = startEvent(state, await classicApi.event(state));
      const takes = debate(state);
      const mine = takes?.find(take => take.id === target);
      const rival = takes?.find(take => take.id !== target && take.favors !== mine?.favors);
      const id = mine && rival ? rival.favors : playable(state);
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
      const advisor = state.advisors.find(member => member.id === target)!;
      if (disloyalAt === null && loyaltyOf(advisor) < DISLOYAL_BELOW) disloyalAt = state.turn;
      leaked = !!state.lastTurn?.leaks?.some(line => line.includes(advisor.name));
    }
    assert.ok(disloyalAt !== null, `${country}: экономист так и не стал нелояльным`);
    // Утечка обязана случиться, если после потери лояльности партия длится хотя бы два «окна» утечек.
    const lasted = state.turn - disloyalAt;
    assert.ok(leaked || state.ended && lasted < 2 * LEAK_EVERY, `${country}: нелояльный экономист ${lasted} ходов ни разу не слил`);
    if (leaked) leakedGames++;
  }
  assert.ok(leakedGames >= 2, `утечки в ${leakedGames} партиях из 3`);
});
