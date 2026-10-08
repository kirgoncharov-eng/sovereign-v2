import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi, inspectEvent, inspectTurns, pressChoice, pressEvent, PRESS_TURNS } from "./classic.ts";
import { BIOGRAPHIES, BIO_RES, START_RES } from "./data.ts";
import { createInitialState, planTurn, resolveTurn, startEvent, successChance } from "./engine.ts";
import type { Choice, GameState } from "./types.ts";

const newGame = async (seed = 3, bio?: string): Promise<GameState> =>
  createInitialState("Украина", "coalition", "liberal", await classicApi.setup("Украина", "coalition", "liberal", seed), () => 0.4, "classic", bio);
const at = (s: GameState, turn: number): GameState => ({ ...s, turn: turn - 1, arc: null });

test("доклады: три управленческих решения без угадывания строки; цена и отложенные последствия", async () => {
 const s0=await newGame();const turns=inspectTurns(s0.seed);assert.equal(turns.length,2);
 for(const turn of turns){const ev=inspectEvent(at(s0,turn))!;assert.ok(ev.doc);assert.equal(ev.doc.key,null);assert.deepEqual(ev.choices.map(c=>c.id),['a','b','c']);const s=startEvent(at(s0,turn),ev);
 for(const id of ['a','b','c']){const p=planTurn(s,id);assert.equal(p.success,true);assert.ok(p.scheduled.some(p=>p.due===s.turn+3&&p.story));}
 assert.ok(ev.choices.some(c=>(c.deal!.res!.economy??0)<0));assert.ok((planTurn(s,'c').effects.resources.politicalCapital??0)<0);assert.ok(!ev.choices.some(c=>c.text.includes('лжи')));}
});
test("старый документ переводится в совещание без ловушки неверной строки",async()=>{
 const {parseSave}=await import('../client/save.ts');const {SAVE_VERSION}=await import('./data.ts');const s0=await newGame();const ev=inspectEvent(at(s0,inspectTurns(s0.seed)[0]))!;
 const legacy={...ev,doc:{...ev.doc!,key:2},choices:[...ev.choices,{...ev.choices[2],id:'d',text:'Уличить во лжи'}]};const s=startEvent(at(s0,inspectTurns(s0.seed)[0]),legacy);
 const loaded=parseSave(JSON.stringify({version:SAVE_VERSION,screen:'game',state:s}))!.state;assert.deepEqual(loaded.currentEvent!.choices.map(c=>c.id),['a','b','c']);assert.equal(loaded.currentEvent!.doc!.key,null);assert.ok(planTurn(loaded,'c').success);
});

test("пресс-конференция: накануне выборов, три вопроса без повторов, молчание наказуемо", async () => {
  let s = await newGame();
  const first = pressEvent(at(s, PRESS_TURNS[0]))!;
  assert.equal(first.press!.questions.length, 3);
  s = startEvent(at(s, PRESS_TURNS[0]), first);
  const talk = pressChoice(s, [0, 0, 0]), silent = pressChoice(s, [-1, -1, -1]);
  assert.ok((silent.deal!.res!.internalLegitimacy ?? 0) <= -6);
  assert.ok(talk.headline!.startsWith("Президент: «"));
  assert.ok(talk.scene!.includes("На вопрос"));
  const withFinal: GameState = { ...s, currentEvent: { ...s.currentEvent!, choices: [talk, s.currentEvent!.choices[1]] } };
  const next = resolveTurn(withFinal, "p", await classicApi.consequence(withFinal, "p"));
  assert.equal(next.lastTurn!.success, true);
  const second = pressEvent(at(next, PRESS_TURNS[1]))!;
  const ids = (e: typeof first) => e.press!.questions.map(q => q.id);
  assert.ok(ids(second).every(id => !ids(first).includes(id)), "вопросы не повторяются");
});

test("биография: свои решения надёжнее, одна опора на старте крепче", async () => {
  const plain = await newGame(3), officer = await newGame(3, "officer");
  const bio = BIOGRAPHIES.find(b => b.id === "officer")!;
  assert.equal(officer.resources[bio.res], Math.min(100, START_RES.coalition[bio.res] + BIO_RES));
  const c: Choice = { id: "a", text: "", hint: "", tags: ["security"], resolvesCrisis: null };
  assert.ok(successChance(officer, c) > successChance(plain, c));
});

test("звонок: дважды за партию, разные собеседники, подход по характеру делает разговор дешевле", async () => {
  const { callEvent, callChoice, approachWorks, CALL_TURNS } = await import("./classic.ts");
  const s0 = await newGame();
  const first = callEvent(at(s0, CALL_TURNS[0]))!;
  assert.ok(first.call && first.special?.kind === "call");
  const s = startEvent(at(s0, CALL_TURNS[0]), first);
  const all = ["offer", "principle", "pressure", "numbers"] as const;
  const good = all.find(a => approachWorks(first.call!.trait, a))!, bad = all.find(a => !approachWorks(first.call!.trait, a))!;
  const g = callChoice(s, good, "deal"), b = callChoice(s, bad, "deal");
  const cost = (c: Choice) => Object.values(c.deal!.res ?? {}).reduce((x, y) => x + (y ?? 0), 0);
  assert.ok(cost(g) > cost(b), "верный подход — уступка дешевле");
  assert.ok((g.deal!.figureRel ?? 0) > (b.deal!.figureRel ?? 0));
  assert.ok(!/\{\w+\}/.test(g.scene!), g.scene);
  const second = callEvent({ ...at(s, CALL_TURNS[1]), usedEvents: s.usedEvents })!;
  assert.notEqual(second.call!.figure, first.call!.figure, "второй звонок — от другого человека");
});

test("контент вставок полон: доклады, вопросы прессы, требования в звонках", async () => {
  const { MANAGEMENT_DOSSIERS } = await import("../content/management.ts");
  const { PRESS_QUESTIONS } = await import("../content/press.ts");
  const { CALL_DEMANDS, CALL_REPLIES } = await import("../content/calls.ts");
  for(const d of MANAGEMENT_DOSSIERS){assert.ok(d.facts.length>=3&&d.lines.length>=2,d.id);assert.equal(d.options.length,3);for(const o of d.options){assert.ok(o.scene.length>100&&o.later.story.length>50,d.id);assert.ok(o.hint&&Object.keys(o.res).length);}}
  assert.equal(new Set(MANAGEMENT_DOSSIERS.map(d=>d.id)).size,MANAGEMENT_DOSSIERS.length);
  for (const q of PRESS_QUESTIONS) {
    assert.equal(new Set(q.answers.map(a => a.tone)).size, 3, `${q.id}: три разных тона`);
  }
  assert.equal(new Set(PRESS_QUESTIONS.map(q => q.id)).size, PRESS_QUESTIONS.length);
  for (const list of Object.values(CALL_DEMANDS)) assert.ok(list.length >= 3);
  for (const r of Object.values(CALL_REPLIES)) assert.ok(r.ok.length >= 2 && r.no.length >= 2);
});

test("бюджет: на восьмом ходу, поровну — без перекосов, перекос бьёт по обделённым, долг аукнется", async () => {
  const { budgetEvent, budgetChoice, BUDGET_TURN } = await import("./classic.ts");
  const s0 = await newGame();
  const ev = budgetEvent(at(s0, BUDGET_TURN))!;
  assert.equal(ev.special?.kind, "budget");
  const s = startEvent(at(s0, BUDGET_TURN), ev);
  const even = budgetChoice(s, { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, false);
  assert.deepEqual(even.deal!.res, {});
  const army = budgetChoice(s, { army: 6, social: 1, economy: 1, apparatus: 1, culture: 1 }, false);
  assert.ok((army.deal!.res!.military ?? 0) > 0 && (army.deal!.res!.internalLegitimacy ?? 0) < 0);
  assert.ok(Object.values(army.deal!.factionRel!).some(v => v < 0), "обделённые лагеря недовольны");
  assert.ok(army.headline!.includes("армию"));
  const debt = budgetChoice(s, { army: 3, social: 3, economy: 3, apparatus: 2, culture: 2 }, true);
  const total = (c: Choice) => Object.values(c.deal!.res ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  assert.ok(total(debt) > total(even), "в долг — щедрее");
  const withFinal: GameState = { ...s, currentEvent: { ...s.currentEvent!, choices: [debt, s.currentEvent!.choices[1]] } };
  const plan = planTurn(withFinal, "p");
  assert.ok(plan.scheduled.some(p => p.due === s.turn + 4 && (p.res.economy ?? 0) < 0), "долги через три хода");
});
