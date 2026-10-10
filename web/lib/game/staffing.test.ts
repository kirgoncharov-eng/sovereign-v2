import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { COUNTRIES, SAVE_VERSION } from "./data.ts";
import { createInitialState, isFemaleName, loyaltyOf, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { DESK_FROM } from "./desk-timing.ts";
import { advisorProfile, campOf } from "./advisors.ts";
import { debate } from "./forecasts.ts";
import { POOL_SIZE, POOL_TURNS, candidatePool, dismissalOf, hireAdvisor, staffingBlocked, staffingOpen } from "./staffing.ts";
import { ABSURD, CHANNELS, DISMISSAL, STAFFING_TEXT } from "../content/staffing.ts";
import { parseSave } from "../client/save.ts";
import type { GameState } from "./types.ts";

const SLOT = /\{[^}]*\}|\(а\)/;

async function fresh(country: string, seed: number, turn = DESK_FROM): Promise<GameState> {
  const state = createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", seed), seededRandom(seed));
  return { ...state, turn };
}

test("резерв: три кандидата в год, один абсурдный, разные кресла, новые имена, советник по безопасности — мужчина", async () => {
  for (const country of Object.keys(COUNTRIES)) for (const seed of [3, 17]) {
    const state = await fresh(country, seed);
    const pool = candidatePool(state);
    assert.deepEqual(pool, candidatePool(state), "резерв детерминирован");
    assert.equal(pool.length, POOL_SIZE);
    assert.equal(pool.filter(candidate => ABSURD.includes(candidate.channel)).length, 1);
    assert.equal(new Set(pool.map(candidate => candidate.seat)).size, POOL_SIZE);
    const known = new Set([state.leader.name, ...state.keyFigures.map(figure => figure.name), ...state.advisors.map(advisor => advisor.name)]);
    for (const candidate of pool) {
      assert.ok(!known.has(candidate.name), `${country}: ${candidate.name} уже есть в партии`);
      assert.ok(!SLOT.test(candidate.bio), candidate.bio);
      if (candidate.seat === "security") assert.ok(!isFemaleName(candidate.name), `${country}: ${candidate.name} на месте силовика`);
      if (candidate.channel === "relative") assert.match(candidate.bio, isFemaleName(candidate.name) ? /^Ваша / : /^Ваш /);
      const def = CHANNELS[candidate.channel];
      assert.ok(def.skills.includes(candidate.skill));
      assert.ok(candidate.loyalty >= def.loyalty[0] && candidate.loyalty <= def.loyalty[1]);
    }
    const nextYear = candidatePool({ ...state, turn: state.turn + POOL_TURNS });
    assert.notDeepEqual(nextYear.map(candidate => candidate.name), pool.map(candidate => candidate.name), "через год резерв другой");
  }
});

test("назначение: кандидат в кресле, цена списана, лагеря реагируют, уволенный уходит и обижает свой лагерь", async () => {
  let checked = 0;
  for (const country of Object.keys(COUNTRIES)) {
    const state = await fresh(country, 9);
    for (const candidate of candidatePool(state)) {
      if (staffingBlocked(state, candidate)) continue;
      const current = state.advisors.find(advisor => advisor.id === candidate.seat)!;
      const leaving = dismissalOf(state, current);
      const after = hireAdvisor(state, candidate.id);
      const hired = after.advisors.find(advisor => advisor.id === candidate.seat)!;
      assert.equal(hired.name, candidate.name);
      assert.equal(loyaltyOf(hired), candidate.loyalty);
      assert.equal(hired.origin, candidate.channel);
      assert.ok(after.former?.includes(current.name));
      for (const [key, value] of Object.entries({ ...candidate.cost })) {
        const extra = (leaving.cost as Record<string, number>)[key] ?? 0;
        assert.equal(after.resources[key as keyof GameState["resources"]], state.resources[key as keyof GameState["resources"]] + value + extra);
      }
      if (leaving.camp) {
        const before = state.factions.find(faction => faction.id === leaving.camp!.id)!.relation;
        const welcome = candidate.relation[leaving.camp.bloc] ?? 0;
        assert.equal(after.factions.find(faction => faction.id === leaving.camp!.id)!.relation, Math.max(-100, before + welcome + DISMISSAL.campRelation));
      }
      assert.equal(campOf(after, hired)?.bloc ?? null, candidate.camp);
      assert.ok(advisorProfile(after, hired).origin, "карточка знает, откуда человек");
      assert.ok(after.staffing?.receipt?.includes(candidate.name));
      assert.ok(!candidatePool(after).some(entry => entry.id === candidate.id), "назначенный ушёл из резерва");
      checked++;
    }
  }
  assert.ok(checked >= 12, `проверено назначений: ${checked}`);
});

test("одно кадровое решение за квартал; на первых ходах, в деле дня и после финала кадров нет", async () => {
  const state = await fresh("Грузия", 4);
  const [first, second] = candidatePool(state);
  const after = hireAdvisor(state, first.id);
  assert.equal(staffingBlocked(after, second), STAFFING_TEXT.quota);
  assert.throws(() => hireAdvisor(after, second.id), new RegExp(STAFFING_TEXT.quota));
  assert.equal(staffingBlocked({ ...after, turn: after.turn + 1 }, candidatePool({ ...after, turn: after.turn + 1 })[0]), null);
  const early = { ...state, turn: DESK_FROM - 1 };
  assert.equal(staffingOpen(early), false);
  assert.equal(staffingBlocked(early, candidatePool(early)[0]), STAFFING_TEXT.early);
  assert.equal(staffingBlocked({ ...state, daily: "2026-10-10" }, first), STAFFING_TEXT.daily);
  assert.equal(staffingBlocked({ ...state, ended: true }, first), STAFFING_TEXT.ended);
});

test("антагониста интриги не уволить, пока она идёт", async () => {
  const state = await fresh("Армения", 12);
  const candidate = candidatePool(state)[0];
  const current = state.advisors.find(advisor => advisor.id === candidate.seat)!;
  const plotting = { ...state, arc: { id: state.arc?.id ?? "kompromat", target: current.name, targetRole: current.role, flags: [], done: [], epilogue: null } };
  assert.match(staffingBlocked(plotting, candidate) ?? "", new RegExp(current.name));
  assert.equal(staffingBlocked({ ...plotting, arc: { ...plotting.arc, epilogue: "конец" } }, candidate), null);
});

test("нелояльного увольняют со скандалом, лояльного — тихо", async () => {
  const state = await fresh("Молдова", 6);
  const advisor = state.advisors[0];
  assert.equal(dismissalOf(state, { ...advisor, loyalty: 20 }).scandal, true);
  assert.deepEqual(dismissalOf(state, { ...advisor, loyalty: 20 }).cost, DISMISSAL.scandal.cost);
  assert.equal(dismissalOf(state, { ...advisor, loyalty: 70 }).scandal, false);
});

test("после назначения сохранение загружается, а новый советник спорит под делом", async () => {
  let state = await fresh("Казахстан", 21, 0);
  for (let turn = 0; turn < DESK_FROM; turn++) {
    state = startEvent(state, await classicApi.event(state));
    const ev = state.currentEvent!;
    const id = (ev.press || ev.call || ev.budget ? ev.choices[1] : ev.choices[0]).id;
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
  }
  const candidate = candidatePool(state).find(entry => entry.seat === "economist" || entry.seat === "security") ?? candidatePool(state)[0];
  state = hireAdvisor(state, candidate.id);
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state }));
  assert.ok(loaded, "сохранение с назначенным советником загружается");
  assert.deepEqual(loaded.state.advisors, state.advisors);
  assert.deepEqual(loaded.state.staffing, state.staffing);
  let spoke = false;
  for (let turn = 0; turn < 12 && !state.ended && !spoke; turn++) {
    state = startEvent(state, await classicApi.event(state));
    spoke = !!debate(state)?.some(take => take.name === candidate.name);
    const ev = state.currentEvent!;
    const id = (ev.press || ev.call || ev.budget ? ev.choices[1] : ev.choices[0]).id;
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
  }
  assert.ok(spoke, `${candidate.name} так и не заговорил в споре`);
});
