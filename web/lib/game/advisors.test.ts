import { test } from "node:test";
import assert from "node:assert/strict";
import { advisorProfile, loyaltyWord, newsLine } from "./advisors.ts";
import { classicApi } from "./classic.ts";
import { COUNTRIES, SAVE_VERSION } from "./data.ts";
import { LOYALTY_FOLLOWED, LOYALTY_OVERRULED, applyAdvisorNews, baseLoyalty, createInitialState, loyaltyOf, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { debate } from "./forecasts.ts";
import { parseSave } from "../client/save.ts";
import type { GameState } from "./types.ts";

async function fresh(country: string, seed: number) {
  return createInitialState(country, "coalition", "pragmatist", await classicApi.setup(country, "coalition", "pragmatist", seed), seededRandom(seed));
}

test("советники: исходная лояльность от 55 до 75 и одинакова для одного имени; счёт пуст", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const a = await fresh(country, 5), b = await fresh(country, 5);
    assert.deepEqual(a.advisors, b.advisors);
    for (const advisor of a.advisors) {
      assert.ok(advisor.loyalty! >= 55 && advisor.loyalty! <= 75, `${advisor.name}: ${advisor.loyalty}`);
      assert.equal(advisor.loyalty, baseLoyalty(advisor));
      assert.deepEqual(advisor.record, { right: 0, wrong: 0 });
    }
  }
});

// Партия, где игрок слушает экономиста; на каждом деле со спором сверяем перемены.
test("лояльность растёт, когда вариант советника выбран, и падает, когда выбран вариант оппонента", async () => {
  let s = await fresh("Казахстан", 21);
  let followed = 0, overruled = 0;
  while (!s.ended && s.turn < 24) {
    s = startEvent(s, await classicApi.event(s));
    const takes = debate(s);
    const ev = s.currentEvent!;
    const id = takes?.[0].favors ?? (ev.press || ev.call || ev.budget ? ev.choices[1].id : ev.choices[0].id);
    const before = s.advisors;
    s = resolveTurn(s, id, await classicApi.consequence(s, id));
    if (!takes) continue;
    const [economist, security] = ["economist", "security"].map(role => ({
      before: loyaltyOf(before.find(a => a.id === role)!), after: loyaltyOf(s.advisors.find(a => a.id === role)!),
    }));
    assert.equal(economist.after - economist.before, LOYALTY_FOLLOWED);
    followed++;
    if (takes[1].favors !== takes[0].favors) {
      assert.equal(security.after - security.before, LOYALTY_OVERRULED);
      overruled++;
    } else assert.equal(security.after - security.before, LOYALTY_FOLLOWED);
  }
  assert.ok(followed >= 5 && overruled >= 2, `послушали ${followed}, обидели ${overruled}`);
});

test("за партию счёт прогнозов копится", async () => {
  for (const country of ["Грузия", "Армения"]) {
    let s = await fresh(country, 13);
    while (!s.ended && s.turn < 20) {
      s = startEvent(s, await classicApi.event(s));
      const ev = s.currentEvent!;
      const id = ev.press || ev.call || ev.budget ? ev.choices[1].id : ev.choices[0].id;
      s = resolveTurn(s, id, await classicApi.consequence(s, id));
    }
    let total = 0;
    for (const advisor of s.advisors) total += advisor.record!.right + advisor.record!.wrong;
    assert.ok(total > 0, `${country}: прогнозы не сверялись`);
  }
});

// На каждом ходу прибавка к счёту советника равна его строкам «верно»/«мимо» в газете.
test("строки газеты и счёт одного хода совпадают по каждому советнику", async () => {
  let s = await fresh("Украина", 77);
  let checked = 0;
  while (!s.ended && s.turn < 16) {
    s = startEvent(s, await classicApi.event(s));
    const ev = s.currentEvent!;
    const id = ev.press || ev.call || ev.budget ? ev.choices[1].id : ev.choices[0].id;
    const before = s.advisors;
    s = resolveTurn(s, id, await classicApi.consequence(s, id));
    const lines = s.lastTurn!.forecasts ?? [];
    for (const advisor of s.advisors) {
      const was = before.find(a => a.id === advisor.id)!.record!;
      const mine = lines.filter(line => line.startsWith(`${advisor.name}:`));
      assert.equal(advisor.record!.right - was.right, mine.filter(line => line.endsWith("— верно.")).length);
      assert.equal(advisor.record!.wrong - was.wrong, mine.filter(line => !line.endsWith("— верно.")).length);
      checked += mine.length;
    }
  }
  assert.ok(checked > 0);
});

test("старое сохранение без лояльности и счёта загружается, и ход его дополняет", async () => {
  const s = await fresh("Молдова", 3);
  const legacy = { ...s, advisors: s.advisors.map(({ loyalty, record, ...rest }) => (void loyalty, void record, rest)) } as GameState;
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: legacy }));
  assert.ok(loaded, "старое сохранение загружается");
  const advisor = loaded.state.advisors[0];
  assert.equal(loyaltyOf(advisor), baseLoyalty(advisor));
  const [after] = applyAdvisorNews([advisor], [{ id: advisor.id, loyalty: -3, right: 1, wrong: 0, reason: "overruled" }]);
  assert.equal(after.loyalty, baseLoyalty(advisor) - 3);
  assert.deepEqual(after.record, { right: 1, wrong: 0 });
  const broken = { ...s, advisors: s.advisors.map(a => ({ ...a, loyalty: 140 })) };
  assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: broken })), null);
});

test("карточка: у каждого советника область, биография, лагерь и слово для лояльности", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const s: GameState = await fresh(country, 8);
    for (const advisor of s.advisors) {
      const profile = advisorProfile(s, advisor);
      assert.ok(profile.area && profile.bio, `${country}: ${advisor.id}`);
      assert.ok(!/\{|бывш|пришёл|ушёл/.test(profile.bio!), profile.bio!);
      assert.ok(profile.camp, `${country}: у ${advisor.id} нет лагеря`);
      assert.equal(profile.record.total, 0);
    }
  }
  assert.deepEqual([80, 60, 40, 10].map(loyaltyWord), ["высокая", "ровная", "шаткая", "на исходе"]);
  const advisors = (await fresh("Беларусь", 2)).advisors;
  assert.equal(newsLine(advisors, { id: "economist", loyalty: 3, right: 0, wrong: 0, reason: "followed" }),
    `${advisors.find(a => a.id === "economist")!.name} — лояльность +3: вы последовали совету.`);
  assert.equal(newsLine(advisors, { id: "economist", loyalty: 0, right: 1, wrong: 0, reason: null }), null);
});
