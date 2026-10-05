import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSTITUTION, COUNTRIES, END_TYPES, MAX_TURNS, TERM_RULES } from "./data.ts";
import { classicApi, termsEvent } from "./classic.ts";
import { createInitialState, isSurvival, planTurn, resolveTurn, setVerdict, startEvent } from "./engine.ts";
import { TERMS_TURN, electionKind, forceRelation, pathEnd, pathOptions, pathVerdict, termRule } from "./terms.ts";
import { FINALE, PATHS } from "../content/terms.ts";
import { TITLES } from "../content/narration.ts";
import type { EndType, GameState, PathId } from "./types.ts";

// Здоровое государство накануне вопроса о сроках: ничего не рушится само, исход решает путь.
async function eve(country: string, patch: Partial<GameState> = {}, seed = 5): Promise<GameState> {
  const s = createInitialState(country, "coalition", "pragmatist", await classicApi.setup(country, "coalition", "pragmatist", seed), () => 0.5);
  const resources = { politicalCapital: 60, economy: 60, military: 60, externalReputation: 60, internalLegitimacy: 60, personalResource: 60 };
  return { ...s, turn: TERMS_TURN - 1, resources, activeCrises: [], factions: s.factions.map(f => ({ ...f, relation: 45 })), ...patch };
}

// Доиграть до конца срока выбранным путём, на последних ходах — выжидая.
async function playPath(s0: GameState, id: PathId) {
  let s = startEvent(s0, await classicApi.event(s0));
  const c = s.currentEvent!.choices.find(x => x.path === id);
  assert.ok(c, `путь ${id} должен быть в папке`);
  s = resolveTurn(s, c.id, await classicApi.consequence(s, c.id));
  while (!s.ended && s.turn < MAX_TURNS) {
    s = { ...s, resources: { ...s.resources, ...patchLegit } };
    const ev = await classicApi.event(s);
    s = startEvent(s, ev);
    const pick = ev.choices.find(x => x.tags.includes("delay")) ?? ev.choices[0];
    s = resolveTurn(s, pick.id, await classicApi.consequence(s, pick.id));
  }
  return s;
}
let patchLegit: Partial<GameState["resources"]> = {};

test("конституции: у каждой страны модель, у каждой концовки название и титулы", () => {
  for (const c of Object.keys(COUNTRIES)) assert.ok(TERM_RULES[CONSTITUTION[c]], c);
  for (const e of Object.keys(END_TYPES) as EndType[]) assert.ok(TITLES[e]?.length >= 2, e);
  for (const p of Object.values(PATHS)) assert.ok(p.scene.length > 100 && p.verdict.length > 20 && p.text && p.hint);
  for (const f of Object.values(FINALE)) assert.ok(f.text.length > 100 && f.head.length > 10);
});

test("вопрос о сроках: ложится на стол на 18-м ходу, пути зависят от конституции, закрытые объяснены", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const s = await eve(country);
    assert.equal(termsEvent({ ...s, turn: TERMS_TURN - 2 }), null, "не раньше срока");
    assert.equal(termsEvent({ ...s, path: { id: "exit", turn: TERMS_TURN } }), null, "решённый вопрос не возвращается");
    const ev = await classicApi.event(s);
    assert.equal(ev.special?.kind, "terms", `${country}: дело о сроках важнее интриги и прочих дел`);
    const paths = ev.choices.map(c => c.path);
    const rule = termRule(country);
    assert.ok(paths.includes("exit"));
    assert.equal(paths.includes("run"), rule === "no_limits" || rule === "two_terms", country);
    assert.equal(paths.includes("zeroing"), rule === "single_term", country);
    assert.equal(paths.includes("rokirovka"), false, "рокировка — только после выигранного парламента");
    assert.ok(paths.includes("dictatorship"), "армия сильна, силовики лояльны");
    assert.ok(!paths.includes("postpone"), "без закона о ЧП отложить выборы не на что сослаться");
    assert.ok(ev.description.includes("Чего в папке нет"));
    assert.equal(new Set(ev.choices.map(c => c.id)).size, ev.choices.length);
    const text = [ev.title, ev.description, ...ev.choices.flatMap(c => [c.text, c.hint, c.scene, c.sceneFail, c.headline])].join(" ");
    assert.ok(!/\{\w+(:\w+)?\}/.test(text), text);
  }
});

test("пути открываются делами: парламент — рокировка, закон о ЧП — отсрочка, преданный человек — преемник", async () => {
  const won = { turn: 10, kind: "parliament" as const, leader: 40, top: { id: "x", name: "X", share: 30 }, outcome: "won" as const };
  const s = await eve("Армения", { elections: [won], laws: [{ id: "emergency_powers", since: 12 }] });
  const heir = s.keyFigures.find(f => f.id === "general")!;
  const withHeir = { ...s, keyFigures: s.keyFigures.map(f => ({ ...f, relation: f.id === "general" ? 50 : 0 })) };
  const opts = pathOptions(withHeir);
  const open = (id: PathId) => !opts.find(o => o.id === id)!.lock;
  assert.ok(open("rokirovka") && open("postpone") && open("successor"));
  assert.equal(opts.find(o => o.id === "successor")!.successor?.name, heir.name);
  const lost = pathOptions({ ...s, elections: [{ ...won, outcome: "lost" }], laws: [], resources: { ...s.resources, military: 30 }, keyFigures: s.keyFigures.map(f => ({ ...f, relation: 10 })) });
  assert.deepEqual(["rokirovka", "postpone", "dictatorship", "successor"].map(id => lost.find(o => o.id === id)!.lock), ["lost", "law", "military", "loyal"]);
  // послов и священников в преемники не берут
  const amb = pathOptions({ ...s, keyFigures: s.keyFigures.map(f => ({ ...f, relation: f.id.startsWith("amb_") || f.id === "catholicos" ? 90 : 0 })) });
  assert.equal(amb.find(o => o.id === "successor")!.lock, "loyal");
});

test("выборы в конце срока зависят от пути", () => {
  assert.equal(electionKind(MAX_TURNS, null), "president", "старые партии — как раньше");
  assert.equal(electionKind(10, { id: "exit", turn: 18 }), "parliament");
  for (const id of ["exit", "postpone", "dictatorship"] as PathId[]) assert.equal(electionKind(MAX_TURNS, { id, turn: 18 }), null, id);
  assert.equal(electionKind(MAX_TURNS, { id: "rokirovka", turn: 18 }), "parliament");
  assert.equal(electionKind(MAX_TURNS, { id: "successor", turn: 18 }), "president");
});

test("развязка пути: выборы, верность преемника, терпение улицы и армии", async () => {
  const s = await eve("Казахстан");
  const st = { factions: s.factions, resources: s.resources, keyFigures: s.keyFigures };
  const heir = s.keyFigures[0];
  assert.equal(pathEnd({ id: "run", turn: 18 }, true, st), "reelected");
  assert.equal(pathEnd({ id: "zeroing", turn: 18 }, true, st), "zeroed");
  assert.equal(pathEnd({ id: "zeroing", turn: 18 }, false, st), "mandate");
  assert.equal(pathEnd({ id: "rokirovka", turn: 18 }, true, st), "premier");
  const loyal = { ...st, keyFigures: [{ ...heir, relation: 40 }] }, cold = { ...st, keyFigures: [{ ...heir, relation: 10 }] };
  assert.equal(pathEnd({ id: "successor", turn: 18, successor: heir.name }, true, loyal), "leader_of_nation");
  assert.equal(pathEnd({ id: "successor", turn: 18, successor: heir.name }, true, cold), "betrayed");
  assert.equal(pathEnd({ id: "successor", turn: 18, successor: heir.name }, false, loyal), "mandate");
  assert.equal(pathEnd({ id: "exit", turn: 18 }, false, st), "retired");
  assert.equal(pathEnd({ id: "postpone", turn: 18 }, false, st), "emergency_rule");
  assert.equal(pathEnd({ id: "postpone", turn: 18 }, false, { ...st, resources: { ...st.resources, internalLegitimacy: 15 } }), "revolution");
  assert.equal(pathEnd({ id: "dictatorship", turn: 18 }, false, st), "dictator");
  const hostile = st.factions.map(f => ({ ...f, relation: f.bloc === "security" ? -50 : f.relation }));
  assert.ok(forceRelation(hostile) <= -30);
  assert.equal(pathEnd({ id: "dictatorship", turn: 18 }, false, { ...st, factions: hostile }), "coup");
  assert.equal(pathEnd({ id: "dictatorship", turn: 18 }, false, { ...st, resources: { ...st.resources, internalLegitimacy: 8 } }), "revolution");
  for (const e of ["retired", "zeroed", "premier", "leader_of_nation", "emergency_rule", "dictator"] as EndType[]) assert.ok(isSurvival(e), e);
  assert.ok(!isSurvival("betrayed"));
});

test("путь в партии: решение запоминается, в конце срока — своя развязка, газета и вердикт", async () => {
  const cases: [string, PathId, Partial<GameState>, EndType[]][] = [
    ["Беларусь", "exit", {}, ["retired"]],
    ["Беларусь", "dictatorship", {}, ["dictator", "coup", "revolution"]],
    ["Украина", "run", {}, ["reelected", "mandate"]],
    ["Казахстан", "zeroing", { laws: [{ id: "constitution", since: 9 }] }, ["zeroed", "mandate"]],
    ["Грузия", "rokirovka", { elections: [{ turn: 10, kind: "parliament", leader: 40, top: { id: "x", name: "X", share: 30 }, outcome: "won" }] }, ["premier", "mandate"]],
    ["Молдова", "postpone", { laws: [{ id: "emergency_powers", since: 12 }] }, ["emergency_rule", "revolution"]],
  ];
  for (const [country, id, patch, ends] of cases) {
    patchLegit = {};
    const s = await playPath(await eve(country, patch), id);
    const outcome = s.endType ?? s.lastTurn?.term?.outcome;
    assert.equal(s.path?.id ?? s.reign?.past.at(-1)?.path, id, `${country}: путь запомнен`);
    assert.equal(s.turn, MAX_TURNS, `${country}/${id}: дожил до конца срока`);
    assert.ok(ends.includes(outcome!), `${country}/${id}: ${outcome}`);
    if (["dictator", "emergency_rule", "premier", "zeroed"].includes(outcome!)) {
      assert.equal(s.ended, false, `${country}/${id}: остался у власти — правление продолжается`);
      assert.ok(!s.lastTurn?.narrative.includes("Второй срок."), "развязка пути вместо обычной ночи выборов");
    }
    if (s.ended) {
      const v = await classicApi.ending(s);
      assert.ok(v.verdict.includes(pathVerdict(s.path, s.endType)), "вердикт помнит, как решён вопрос о сроках");
      setVerdict(s, v);
    }
  }
  // диктатор, которого бросила улица, — «свергнут при попытке»
  patchLegit = { internalLegitimacy: 6 };
  const fell = await playPath(await eve("Беларусь"), "dictatorship");
  patchLegit = {};
  assert.equal(fell.endType, "revolution");
  assert.match((await classicApi.ending(fell)).title, /при попытке|трон|штыков/);
});

test("сорванное обнуление: парламент не дал голосов — придётся уходить", async () => {
  const s0 = await eve("Казахстан", { factions: (await eve("Казахстан")).factions.map(f => ({ ...f, relation: -60 })) });
  const s = startEvent(s0, await classicApi.event(s0));
  const z = s.currentEvent!.choices.find(c => c.path === "zeroing")!;
  assert.equal(z.law?.id, "constitution", "поправок ещё нет — их проводят сейчас");
  // перебираем зёрна, пока голосование не сорвётся
  for (let seed = 1; seed < 60; seed++) {
    const plan = planTurn({ ...s, seed }, z.id);
    if (plan.success) continue;
    assert.deepEqual(plan.path, { id: "exit", turn: TERMS_TURN, from: "zeroing" });
    assert.equal(plan.laws.some(l => l.id === "constitution"), false);
    return;
  }
  assert.fail("голосование ни разу не сорвалось");
});
