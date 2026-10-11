import { test } from "node:test";
import assert from "node:assert/strict";
import { advisorProfile, loyaltyWord, newsLine } from "./advisors.ts";
import { classicApi } from "./classic.ts";
import { ADVISOR_BIOS } from "../content/advisors.ts";
import { COUNTRIES, SAVE_VERSION } from "./data.ts";
import {
  LOYALTY_FOLLOWED, LOYALTY_OVERRULED, applyAdvisorNews, baseLoyalty, createInitialState, loyaltyOf, resolveTurn, seededRandom, startEvent,
} from "./engine.ts";
import { advisorNews, debate } from "./forecasts.ts";
import { parseSave } from "../client/save.ts";
import type { GameState } from "./types.ts";

async function fresh(country: string, seed: number) {
  return createInitialState(country, "coalition", "pragmatist", await classicApi.setup(country, "coalition", "pragmatist", seed), seededRandom(seed));
}

test("советники: исходная лояльность от 55 до 75 и одинакова для одного имени; счёт пуст", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const first = await fresh(country, 5), second = await fresh(country, 5);
    assert.deepEqual(first.advisors, second.advisors);
    for (const advisor of first.advisors) {
      assert.ok(advisor.loyalty! >= 55 && advisor.loyalty! <= 75, `${advisor.name}: ${advisor.loyalty}`);
      assert.equal(advisor.loyalty, baseLoyalty(advisor));
      assert.deepEqual(advisor.record, { right: 0, wrong: 0 });
    }
  }
});

// Партия, где игрок всегда слушает первого в споре; на каждом деле со спором сверяем перемены.
test("лояльность растёт, когда вариант советника выбран, и падает, когда выбран вариант оппонента", async () => {
  let state = await fresh("Казахстан", 21);
  let followed = 0, overruled = 0;
  while (!state.ended && state.turn < 24) {
    state = startEvent(state, await classicApi.event(state));
    const takes = debate(state);
    const ev = state.currentEvent!;
    const id = takes?.[0].favors ?? (ev.press || ev.call || ev.budget ? ev.choices[1].id : ev.choices[0].id);
    const before = state.advisors;
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
    if (!takes) continue;
    const [first, second] = takes.map(take => ({
      before: loyaltyOf(before.find(advisor => advisor.id === take.id)!), after: loyaltyOf(state.advisors.find(advisor => advisor.id === take.id)!),
    }));
    assert.equal(first.after - first.before, LOYALTY_FOLLOWED);
    followed++;
    if (takes[1].favors !== takes[0].favors) {
      assert.equal(second.after - second.before, LOYALTY_OVERRULED);
      overruled++;
    } else assert.equal(second.after - second.before, LOYALTY_FOLLOWED);
  }
  assert.ok(followed >= 5 && overruled >= 2, `послушали ${followed}, обидели ${overruled}`);
});

test("за партию счёт прогнозов копится", async () => {
  for (const country of ["Грузия", "Армения"]) {
    let state = await fresh(country, 13);
    while (!state.ended && state.turn < 20) {
      state = startEvent(state, await classicApi.event(state));
      const ev = state.currentEvent!;
      const id = ev.press || ev.call || ev.budget ? ev.choices[1].id : ev.choices[0].id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
    }
    let total = 0;
    for (const advisor of state.advisors) total += advisor.record!.right + advisor.record!.wrong;
    assert.ok(total > 0, `${country}: прогнозы не сверялись`);
  }
});

// На каждом ходу прибавка к счёту советника равна его строкам «верно»/«мимо» в газете.
test("строки газеты и счёт одного хода совпадают по каждому советнику", async () => {
  let state = await fresh("Украина", 77);
  let checked = 0;
  while (!state.ended && state.turn < 16) {
    state = startEvent(state, await classicApi.event(state));
    const ev = state.currentEvent!;
    const id = ev.press || ev.call || ev.budget ? ev.choices[1].id : ev.choices[0].id;
    const before = state.advisors;
    state = resolveTurn(state, id, await classicApi.consequence(state, id));
    const lines = state.lastTurn!.forecasts ?? [];
    for (const advisor of state.advisors) {
      const was = before.find(previous => previous.id === advisor.id)!.record!;
      const mine = lines.filter(line => line.startsWith(`${advisor.name}:`));
      assert.equal(advisor.record!.right - was.right, mine.filter(line => line.endsWith("— верно.")).length);
      assert.equal(advisor.record!.wrong - was.wrong, mine.filter(line => !line.endsWith("— верно.")).length);
      checked += mine.length;
    }
  }
  assert.ok(checked > 0);
});

test("старое сохранение без лояльности и счёта загружается, и ход его дополняет", async () => {
  const state = await fresh("Молдова", 3);
  const legacy = { ...state, advisors: state.advisors.map(({ loyalty, record, ...rest }) => (void loyalty, void record, rest)) } as GameState;
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: legacy }));
  assert.ok(loaded, "старое сохранение загружается");
  const advisor = loaded.state.advisors[0];
  assert.equal(loyaltyOf(advisor), baseLoyalty(advisor));
  const [after] = applyAdvisorNews([advisor], [{ id: advisor.id, loyalty: -3, right: 1, wrong: 0, reason: "overruled" }]);
  assert.equal(after.loyalty, baseLoyalty(advisor) - 3);
  assert.deepEqual(after.record, { right: 1, wrong: 0 });
  const broken = { ...state, advisors: state.advisors.map(advisor => ({ ...advisor, loyalty: 140 })) };
  assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: broken })), null);
});

test("карточка: у каждого советника область, биография, лагерь и слово для лояльности", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const state: GameState = await fresh(country, 8);
    for (const advisor of state.advisors) {
      const profile = advisorProfile(state, advisor);
      assert.ok(profile.area && profile.bio, `${country}: ${advisor.id}`);
      assert.ok(!/\{|бывш/.test(profile.bio!), profile.bio!);
      assert.ok(profile.camp, `${country}: у ${advisor.id} нет лагеря`);
      assert.equal(profile.record.total, 0);
    }
  }
  assert.deepEqual([80, 60, 40, 10].map(loyaltyWord), ["высокая", "ровная", "шаткая", "на исходе"]);
  const advisors = (await fresh("Беларусь", 2)).advisors;
  assert.equal(newsLine(advisors, { id: "economist", loyalty: 3, right: 0, wrong: 0, reason: "followed" }),
    `${advisors.find(advisor => advisor.id === "economist")!.name} — лояльность +3: вы последовали совету.`);
  assert.equal(newsLine(advisors, { id: "economist", loyalty: 0, right: 1, wrong: 0, reason: null }), null);
});

// Глаголы прошедшего времени мужского рода выдают пол: «делал», «пришёл». Биографии достаются и советницам.
test("биографии без рода: ни одного глагола прошедшего времени на -л", () => {
  const masculinePast = /(?<![а-яё])[а-яё]{2,}(ал|ял|ил|ел|ыл|ул|ёл)(?![а-яё])/i;
  for (const [role, bios] of Object.entries(ADVISOR_BIOS)) for (const bio of bios) {
    assert.ok(!masculinePast.test(bio), `${role}: ${bio}`);
  }
});

test("газета пишет фактическую перемену лояльности: у границ 0 и 100 — после ограничения", async () => {
  let state = await fresh("Казахстан", 21);
  let takes = null;
  while (!takes) {
    state = startEvent(state, await classicApi.event(state));
    takes = debate(state);
    if (!takes) {
      const ev = state.currentEvent!;
      const id = (ev.press || ev.call || ev.budget ? ev.choices[1] : ev.choices[0]).id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
    }
  }
  const [follower, rival] = takes;
  assert.notEqual(follower.favors, rival.favors, "для проверки нужен спор");
  const withLoyalty = (followerLoyalty: number, rivalLoyalty: number): GameState => ({
    ...state,
    advisors: state.advisors.map(advisor => advisor.id === follower.id ? { ...advisor, loyalty: followerLoyalty }
      : advisor.id === rival.id ? { ...advisor, loyalty: rivalLoyalty } : advisor),
  });
  const deltas = (game: GameState) => Object.fromEntries(advisorNews(game, follower.favors, false).map(news => [news.id, news.loyalty]));
  assert.deepEqual(deltas(withLoyalty(99, 1)), { [follower.id]: 1, [rival.id]: -1 });
  assert.deepEqual(deltas(withLoyalty(100, 0)), { [follower.id]: 0, [rival.id]: 0 });
  assert.deepEqual(deltas(withLoyalty(60, 60)), { [follower.id]: LOYALTY_FOLLOWED, [rival.id]: LOYALTY_OVERRULED });
  const capped = advisorNews(withLoyalty(100, 0), follower.favors, false);
  assert.ok(capped.every(news => newsLine(state.advisors, news) === null), "при нулевой перемене строки в газете нет");
  const after = resolveTurn(withLoyalty(99, 1), follower.favors, await classicApi.consequence(withLoyalty(99, 1), follower.favors));
  assert.equal(loyaltyOf(after.advisors.find(advisor => advisor.id === follower.id)!), 100);
  assert.equal(loyaltyOf(after.advisors.find(advisor => advisor.id === rival.id)!), 0);
});
