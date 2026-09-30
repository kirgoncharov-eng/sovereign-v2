import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_CARDS } from "../content/events.ts";
import { classicApi, cardAvailable, fill } from "./classic.ts";
import { ACTION_TAGS, COUNTRIES } from "./data.ts";
import { choiceEffects, createInitialState, resolveTurn, startEvent, successChance } from "./engine.ts";
import type { GameState } from "./types.ts";

const newGame = async (country = "Беларусь"): Promise<GameState> =>
  createInitialState(country, "coalition", "liberal", await classicApi.setup(country, "coalition", "liberal"));

test("библиотека: у каждой карточки 2–3 варианта с валидными и разными тегами", () => {
  const ids = new Set<string>();
  for (const c of EVENT_CARDS) {
    assert.ok(!ids.has(c.id), `дубликат ${c.id}`);
    ids.add(c.id);
    assert.ok(c.choices.length >= 2 && c.choices.length <= 3, c.id);
    for (const ch of c.choices) assert.ok(ch.tags.length && ch.tags.every(t => ACTION_TAGS.includes(t)), c.id);
    if (c.choices.some(ch => ch.resolves)) assert.ok(c.when?.crisis, `${c.id}: resolves без условия crisis`);
  }
});

test("классическая партия проходит до конца во всех странах без незаполненных слотов", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    let s = await newGame(country);
    assert.equal(s.advisors[0].name.split(" ").length, 2);
    while (!s.ended) {
      s = startEvent(s, await classicApi.event(s));
      const text = s.currentEvent!.title + s.currentEvent!.description + s.currentEvent!.choices.map(c => c.text).join();
      assert.ok(!/\{\w+(:\w+)?\}/.test(text), `слот не заполнен: ${text}`);
      const n = await classicApi.consequence(s, "a");
      assert.ok(n.headline && n.narrative);
      s = resolveTurn(s, "a", n);
    }
    const v = await classicApi.ending({ ...s, verdict: null });
    assert.ok(v.verdict && v.title && v.rating);
    assert.ok(s.usedEvents.length > 0);
  }
});

test("карточки по условиям: страновые — только своей стране, слоты фигур — только где есть блок", async () => {
  const ge = await newGame("Грузия");
  const byOnly = EVENT_CARDS.find(c => c.id === "by_potash")!;
  assert.equal(cardAvailable(byOnly, ge), false);
  const secCard = EVENT_CARDS.find(c => c.id === "sec_ultimatum")!;
  assert.equal(cardAvailable(secCard, ge), false); // в Грузии нет силового блока
  assert.match(fill("{capital}: {leader}", ge), /^Тбилиси: /);
});

test("совет без ИИ: предложения из области советника", async () => {
  const s = startEvent(await newGame(), await classicApi.event(await newGame()));
  const list = await classicApi.council(s);
  assert.ok(list.length >= 2);
  for (const p of list) assert.ok(p.advisor);
});

test("шанс успеха: сильный советник надёжнее слабого, выжидание не проваливается, провал хуже успеха", async () => {
  const s = await newGame();
  const base = { id: "x1", text: "Т", hint: "", tags: ["social" as const], resolvesCrisis: null };
  const weak = successChance(s, { ...base, advisor: { id: "economist", name: "", role: "", skill: 1 } });
  const strong = successChance(s, { ...base, advisor: { id: "economist", name: "", role: "", skill: 3 } });
  assert.ok(strong > weak);
  assert.equal(successChance(s, { ...base, tags: ["delay"] }), 1);
  const ok = choiceEffects(s, base).resources, fail = choiceEffects(s, base, true).resources;
  assert.ok((fail.internalLegitimacy ?? 0) < (ok.internalLegitimacy ?? 0));
  assert.ok((fail.economy ?? 0) <= (ok.economy ?? 0));
});

test("интрига: эпизоды приходят на своих ходах, флаги меняют развязку", async () => {
  let s = await newGame();
  assert.ok(s.arc);
  const seen: { turn: number; flagsBefore: string[] }[] = [];
  while (!s.ended) {
    s = startEvent(s, await classicApi.event(s));
    if (s.currentEvent!.beat) {
      seen.push({ turn: s.turn + 1, flagsBefore: [...s.arc!.flags] });
      assert.ok(s.currentEvent!.choices.every(c => c.arc?.flag && c.arc.ok && !/\{target\}/.test(c.arc.ok)));
    }
    const n = await classicApi.consequence(s, "a");
    s = resolveTurn(s, "a", n);
  }
  const reached = seen.map(x => x.turn);
  assert.deepEqual(reached, [3, 7, 12, 16].filter(t => t <= s.turn));
  if (reached.length === 4) assert.ok(s.arc!.epilogue);
});

test("финальный эпизод зависит от сделанных ранее выборов", async () => {
  const { dueBeat } = await import("./engine.ts");
  const base = await newGame();
  const mole = { ...base, turn: 15, arc: { id: "mole", target: "Анна Лис", targetRole: "Экономист", flags: ["watch", "trap"], done: [3, 7, 12], epilogue: null } };
  assert.equal(dueBeat(mole)!.variant.title, "Разоблачение");
  const blind = { ...mole, arc: { ...mole.arc, flags: ["ignore", "purge", "deal"] } };
  assert.equal(dueBeat(blind)!.variant.title, "Крот наносит удар");
});

test("у каждой авторской карточки есть сцена на каждый вариант, у каждой интриги — нить предвестий", async () => {
  const { SCENES } = await import("../content/scenes.ts");
  const { ARCS } = await import("../content/arcs.ts");
  for (const c of EVENT_CARDS) assert.equal(SCENES[c.id]?.length, c.choices.length, `сцены для ${c.id}`);
  for (const a of ARCS) assert.ok(a.hooks.length >= 6, a.id);
});

test("в тексте итога нет роботизированных фраз, между эпизодами звучит нить интриги", async () => {
  let s = await newGame();
  s = startEvent(s, await classicApi.event(s));
  const n = await classicApi.consequence(s, "a");
  assert.ok(!n.narrative.startsWith("Решение принято"));
  const { ARCS } = await import("../content/arcs.ts");
  const hooks = ARCS.find(a => a.id === s.arc!.id)!.hooks.map(h => fill(h, s));
  assert.ok(hooks.some(h => n.narrative.includes(h)));
});
