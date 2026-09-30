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
  assert.deepEqual(reached, [1, 3, 7, 12, 16].filter(t => t <= s.turn));
  if (reached.length === 5) assert.ok(s.arc!.epilogue);
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
  s = resolveTurn(s, "a", await classicApi.consequence(s, "a")); // первый ход — завязка интриги
  s = startEvent(s, await classicApi.event(s));
  const n = await classicApi.consequence(s, "a");
  assert.ok(!n.narrative.startsWith("Решение принято"));
  const { ARCS } = await import("../content/arcs.ts");
  const hooks = ARCS.find(a => a.id === s.arc!.id)!.hooks.map(h => fill(h, s));
  assert.ok(hooks.some(h => n.narrative.includes(h)));
});

test("каждая интрига проходит все 5 эпизодов, тексты заполнены, у эпизодов есть второй абзац", async () => {
  const { ARCS } = await import("../content/arcs.ts");
  const { BEAT_EXT } = await import("../content/beats-ext.ts");
  const { INTERCEPTS } = await import("../content/frame.ts");
  for (const def of ARCS) {
    assert.ok(INTERCEPTS[def.id]?.length, `перехваты для ${def.id}`);
    for (const b of def.beats) for (const v of b.variants) assert.ok(BEAT_EXT[v.title], `второй абзац: ${v.title}`);
    let s = await newGame("Армения");
    s = { ...s, arc: { ...s.arc!, id: def.id } };
    const beats: number[] = [];
    while (!s.ended && s.turn < 17) {
      s = startEvent(s, await classicApi.event(s));
      const ev = s.currentEvent!;
      if (ev.beat) beats.push(ev.beat.turn);
      assert.ok(!/\{\w+(:\w+)?\}/.test(ev.description + ev.choices.map(c => c.text + (c.arc?.ok ?? "")).join()), `слот в ${def.id}`);
      s = resolveTurn(s, "b", await classicApi.consequence(s, "b"));
    }
    if (s.turn >= 17) assert.deepEqual(beats, [1, 3, 7, 12, 16], def.id);
  }
});

test("дело дня одинаково у всех: страна, вступление, интрига и первое событие", async () => {
  const { dailyCase } = await import("../client/meta.ts");
  const { seededRandom } = await import("./engine.ts");
  const day = new Date(2026, 8, 30);
  const play = async () => {
    const d = dailyCase(day);
    const intro = await classicApi.setup(d.country, d.diff, d.ideo, d.seed);
    const s = createInitialState(d.country, d.diff, d.ideo, intro, seededRandom(d.seed));
    return { d, s, ev: await classicApi.event(s) };
  };
  const a = await play(), b = await play();
  assert.deepEqual(a.d, b.d);
  assert.equal(a.s.leader.name, b.s.leader.name);
  assert.equal(a.s.seed, b.s.seed);
  assert.equal(a.s.arc!.id, b.s.arc!.id);
  assert.equal(a.ev.description, b.ev.description);
  assert.notEqual(dailyCase(new Date(2026, 9, 1)).seed, a.d.seed);
});

test("совет предлагает только уместное событию и не дублирует друг друга", async () => {
  const { RELATED_TAGS } = await import("../content/narration.ts");
  for (const card of EVENT_CARDS.filter(c => !c.when?.crisis).slice(0, 25)) {
    let s = await newGame();
    s = startEvent(s, { title: card.title, source: "", description: "", isCritical: false, affectedFactions: [], council: null, randomEvent: null,
      choices: card.choices.map((c, i) => ({ id: "abc"[i], text: c.text, hint: c.hint, tags: c.tags, resolvesCrisis: null })) });
    const list = await classicApi.council(s);
    const allowed = new Set(card.choices.flatMap(c => c.tags).flatMap(t => RELATED_TAGS[t]));
    for (const p of list) assert.ok(allowed.has(p.tags[0]), `${card.id}: ${p.tags[0]}`);
    assert.equal(new Set(list.map(p => p.tags[0])).size, list.length, card.id);
  }
});

test("у каждого события свой совет: не меньше трёх советников, теги из их области, сцены на успех и провал", async () => {
  const { COUNCIL_A } = await import("../content/council-a.ts");
  const { COUNCIL_B } = await import("../content/council-b.ts");
  const { ADVISOR_ROLES } = await import("./data.ts");
  const all = { ...COUNCIL_A, ...COUNCIL_B };
  for (const card of EVENT_CARDS.filter(c => !c.when?.crisis)) {
    const council = all[card.id];
    assert.ok(council, `совет для ${card.id}`);
    const entries = Object.entries(council);
    assert.ok(entries.length >= 3, card.id);
    for (const [role, [tag, text, hint, ok, fail]] of entries) {
      assert.ok(ADVISOR_ROLES.find(r => r.id === role)?.domain.includes(tag), `${card.id}/${role}: ${tag}`);
      assert.ok(text && hint && ok.length > 60 && fail.length > 40, `${card.id}/${role}`);
    }
  }
  // совет собирается из авторских предложений и несёт сцены
  let s = await newGame();
  const card = EVENT_CARDS.find(c => c.id === "strike")!;
  s = startEvent(s, { cardId: "strike", title: card.title, source: "", description: "", isCritical: false, affectedFactions: [], council: null, randomEvent: null,
    choices: card.choices.map((c, i) => ({ id: "abc"[i], text: c.text, hint: c.hint, tags: c.tags, resolvesCrisis: null })) });
  const list = await classicApi.council(s);
  assert.equal(list.length, 4);
  assert.ok(list.every(p => p.scene && p.sceneFail && !/\{\w+/.test(p.text + p.scene)));
});

test("у каждого решения есть свой заголовок газеты — на успех и на провал", async () => {
  const { CARD_HEADLINES, CRISIS_HEADLINES } = await import("../content/headlines-cards.ts");
  const { COUNCIL_HEADLINES } = await import("../content/headlines-council.ts");
  const { BEAT_HEADLINES } = await import("../content/headlines-beats.ts");
  const { COUNCIL_A } = await import("../content/council-a.ts");
  const { COUNCIL_B } = await import("../content/council-b.ts");
  const { CRISIS_ESCALATE } = await import("../content/events.ts");
  const { ARCS } = await import("../content/arcs.ts");
  const ok = (p: [string, string] | undefined, where: string) => {
    assert.ok(p && p[0] && p[1] && p[0].length <= 80 && p[1].length <= 80, where);
  };
  for (const card of EVENT_CARDS.filter(c => c.id !== "crisis_escalates")) card.choices.forEach((_, i) => ok(CARD_HEADLINES[card.id]?.[i], `${card.id}#${i}`));
  for (const [key, v] of Object.entries(CRISIS_ESCALATE)) v.choices.forEach((_, i) => ok(CRISIS_HEADLINES[key]?.[i], `crisis ${key}#${i}`));
  for (const [card, roles] of Object.entries({ ...COUNCIL_A, ...COUNCIL_B })) for (const role of Object.keys(roles)) ok(COUNCIL_HEADLINES[card]?.[role as "strategist"], `${card}/${role}`);
  for (const a of ARCS) for (const b of a.beats) for (const v of b.variants) for (const c of v.choices) ok(BEAT_HEADLINES[c.text], `${a.id}: ${c.text}`);
});

test("у каждого варианта события своя сцена провала, у обострения кризиса — обе сцены", async () => {
  const { FAIL_A } = await import("../content/fail-a.ts");
  const { FAIL_B, CRISIS_SCENES } = await import("../content/fail-b.ts");
  const { CRISIS_ESCALATE } = await import("../content/events.ts");
  const fails: Record<string, string[]> = { ...FAIL_A, ...FAIL_B };
  for (const card of EVENT_CARDS.filter(c => c.id !== "crisis_escalates")) {
    assert.equal(fails[card.id]?.length, card.choices.length, `провалы ${card.id}`);
    for (const f of fails[card.id]) assert.ok(f.length > 80, card.id);
  }
  for (const [key, v] of Object.entries(CRISIS_ESCALATE)) {
    assert.equal(CRISIS_SCENES[key]?.length, v.choices.length, key);
    for (const [ok, fail] of CRISIS_SCENES[key]) assert.ok(ok.length > 60 && fail.length > 60, key);
  }
  // провал показывает авторскую сцену, а не общие фразы
  let s = await newGame();
  for (let i = 0; i < 12 && !s.ended; i++) {
    s = startEvent(s, await classicApi.event(s));
    const c = s.currentEvent!.choices[0];
    assert.ok(c.arc || c.sceneFail, `нет сцены провала: ${s.currentEvent!.title}`);
    assert.ok(!/\{\w+/.test((c.sceneFail ?? "") + (c.scene ?? "")));
    s = resolveTurn(s, c.id, await classicApi.consequence(s, c.id));
  }
});

test("у каждого решения в эпизодах интриг есть своя сцена провала", async () => {
  const { ARCS } = await import("../content/arcs.ts");
  const { BEAT_FAILS } = await import("../content/fail-beats.ts");
  for (const a of ARCS) for (const b of a.beats) for (const v of b.variants) for (const c of v.choices)
    assert.ok(c.fail || BEAT_FAILS[c.text], `${a.id}: ${c.text}`);
});
