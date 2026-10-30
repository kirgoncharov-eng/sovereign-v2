import test from "node:test";
import assert from "node:assert/strict";
import { budgetEvent, BUDGET_TURN, classicApi, pressChoice, pressEvent, PRESS_TURNS } from "./classic.ts";
import { signOption } from "../client/chronicle.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { askedSignatures, signatureCase, signatureQuestion, SIGNATURE_QUESTION_ID } from "./press-signature.ts";
import type { DifficultyId, GameState, HistoryEntry, PromiseState } from "./types.ts";

const newGame = async (seed = 7, diff: DifficultyId = "coalition"): Promise<GameState> => {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, diff, "pragmatist", seed);
  return createInitialState(ALTERNATE_COUNTRY, diff, "pragmatist", intro, seededRandom(seed));
};
const entry = (patch: Partial<HistoryEntry> = {}): HistoryEntry => ({
  year: 1, title: "Закупочная цена", choice: "Повысить цену и защитить дешёвый хлеб субсидией", headline: "", historianNote: "",
  tags: ["social"], success: true, hurt: ["gossektor"], ...patch,
});
// Партия на ходе конференции: история задана, лагерь «gossektor» недоволен.
const at = (state: GameState, history: HistoryEntry[], relation = -25, turn = PRESS_TURNS[0]): GameState => ({
  ...state, turn: turn - 1, arc: null, promises: [], history,
  factions: state.factions.map(group => group.id === "gossektor" ? { ...group, relation } : group),
});

test("вопрос о подписи строится из истории партии: дело, решение и недовольный лагерь", async () => {
  const state = at(await newGame(), [entry()]);
  const question = signatureQuestion(state)!;
  const camp = state.factions.find(group => group.id === "gossektor")!;
  assert.equal(question.id, "sign_gossektor");
  assert.ok(question.text.startsWith("Вы распорядились повысить цену и защитить дешёвый хлеб субсидией."), question.text);
  assert.ok(question.text.includes(camp.name), question.text);
  assert.equal(question.answers.length, 3);
  assert.equal(new Set(question.answers.map(a => a.tone)).size, 3);
  assert.ok(question.answers.every(a => a.stake), "цена названа словами");
  const event = pressEvent(state)!;
  assert.equal(event.press!.questions[0].id, "sign_gossektor");
  assert.equal(event.press!.questions.length, 3);
});

test("не подпись и не недовольство: особые дела, сорванные решения, довольные лагеря, архив и «Дело дня»", async () => {
  const base = await newGame();
  assert.equal(signatureCase(at(base, [])), null);
  assert.equal(signatureCase(at(base, [entry({ hurt: undefined })])), null);
  assert.equal(signatureCase(at(base, [entry({ success: false })])), null, "сорванное решение не подпись");
  for (const choice of ["Ответить на вопросы журналистов", "Разговор по защищённой линии", "Утвердить бюджет на год"]) {
    assert.equal(signatureCase(at(base, [entry({ choice })])), null, choice);
  }
  assert.equal(signatureCase(at(base, [entry()], 40)), null, "лагерь уже доволен");
  assert.equal(signatureCase({ ...at(base, [entry()]), country: "Украина" }), null);
  assert.equal(signatureCase({ ...at(base, [entry()]), daily: "2026-10-30" }), null);
});

test("накопленное недовольство меняет цену: чем чаще задет лагерь, тем дороже стоять на своём и тем ценнее встреча", async () => {
  const base = await newGame();
  const once = signatureQuestion(at(base, [entry()]))!;
  const often = signatureQuestion(at(base, [entry(), entry({ title: "Опись" }), entry({ title: "Нефтебаза" })]))!;
  assert.ok(once.text.includes("ударом по своим людям") && often.text.includes("считает это уже третьим ударом по своим людям"), often.text);
  const [concedeOnce, standOnce] = once.answers, [concedeOften, standOften] = often.answers;
  const bloc = base.factions.find(group => group.id === "gossektor")!.bloc;
  assert.ok((standOften.rel[bloc] ?? 0) < (standOnce.rel[bloc] ?? 0));
  assert.ok((concedeOften.rel[bloc] ?? 0) > (concedeOnce.rel[bloc] ?? 0));
  assert.ok((concedeOnce.res.politicalCapital ?? 0) < 0 && (standOnce.res.politicalCapital ?? 0) > 0, "признание стоит капитала, твёрдость даёт");
});

test("берётся самая свежая подпись; на второй конференции о том же лагере не спрашивают", async () => {
  const base = await newGame();
  const state = at(base, [entry({ title: "Старое дело" }), entry({ title: "Свежее дело", hurt: ["siloviki"] })], -25);
  const withSiloviki = { ...state, factions: state.factions.map(group => group.id === "siloviki" ? { ...group, relation: -30 } : group) };
  assert.equal(signatureCase(withSiloviki)!.entry.title, "Свежее дело");
  const first = pressEvent(withSiloviki)!;
  const second = pressEvent({ ...at(base, state.history, -25, PRESS_TURNS[1]), factions: withSiloviki.factions, usedEvents: [first.cardId] })!;
  const secondIds = second.press!.questions.map(q => q.id).filter(id => id.startsWith("sign_"));
  assert.ok(!secondIds.includes(first.press!.questions.find(q => q.id.startsWith("sign_"))!.id), "тот же лагерь не повторяется");
  assert.deepEqual([...askedSignatures([first.cardId.split(":")[2].split(",").find(id => id.startsWith("sign_"))!])], ["siloviki"]);
});

test("вопросы об обещании и о подписи живут вместе: два личных и один общий, без повторов", async () => {
  const promises: PromiseState[] = [{ id: "dialogue", progress: 0, status: "open" }];
  const state = { ...at(await newGame(), [entry()]), promises };
  const ids = pressEvent(state)!.press!.questions.map(q => q.id);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(ids.slice(0, 2), ["pledge_dialogue", "sign_gossektor"]);
  assert.ok(!ids.includes(SIGNATURE_QUESTION_ID), "базовый вопрос пула не попадает в событие");
});

test("ответы доходят до итога хода: цена из ответа и реакция в тексте", async () => {
  const state0 = at(await newGame(), [entry()]);
  const state = startEvent(state0, pressEvent(state0)!);
  const index = state.currentEvent!.press!.questions.findIndex(q => q.id === "sign_gossektor");
  const answer = (pick: number) => {
    const picks = [-1, -1, -1];
    picks[index] = pick;
    return pressChoice(state, picks);
  };
  assert.ok(Object.keys(answer(0).deal!.factionRel!).includes("gossektor"), "лагерь получает отношение за ответ");
  assert.ok(answer(2).scene!.includes("виноватыми выставили"));
  assert.ok((answer(0).deal!.res!.politicalCapital ?? 0) < (answer(1).deal!.res!.politicalCapital ?? 0));
});

// Вычитка (text-review): подписи из настоящих партий 1978 года на разных зёрнах и сложностях.
test("текст вопроса о подписи на настоящих партиях: без слотов, рода, вложенных «ёлочек» и пустых цитат", async () => {
  let checked = 0;
  for (const [seed, diff] of [[1, "crisis"], [7, "debut"], [3, "coalition"], [12, "debut"]] as [number, DifficultyId][]) {
    let state = await newGame(seed, diff);
    for (let turn = 0; turn < 8 && !state.ended; turn++) {
      const event = await classicApi.event(state);
      state = startEvent(state, event);
      state = resolveTurn(state, event.choices[0].id, await classicApi.consequence(state, event.choices[0].id));
      const question = signatureQuestion({ ...state, turn: PRESS_TURNS[0] - 1 });
      if (!question) continue;
      checked++;
      const lines = [question.text, ...question.answers.flatMap(a => [a.text, a.stake ?? "", a.after ?? ""])];
      for (const line of lines) {
        assert.ok(!/\{\w+\}|undefined|NaN|„“/.test(line), line);
        assert.ok(!/(^|[^а-яё])(сделал|подписал|решил|обещал|нарушил|признал)(?![а-яё])/i.test(line), `род в первом лице: ${line}`);
      }
      assert.ok(!/«[^»]*«/.test(question.text), question.text);
      assert.ok(!/\.\.|[.!?]“\./.test(question.text), question.text);
      assert.ok(/^Вы распорядились [а-яё]/.test(question.text), question.text);
    }
  }
  assert.ok(checked >= 4, `вопрос должен находиться в живых партиях, найдено ${checked}`);
});

test("журналист говорит по-человечески: число лагеря, счёт решений и запасная цитата", async () => {
  const base = await newGame();
  const plural = { ...at(base, [entry(), entry({ title: "Второе" })]), factions: base.factions.map(group =>
    group.id === "gossektor" ? { ...group, name: "Областные советы", relation: -25 } : group) };
  assert.ok(signatureQuestion(plural)!.text.includes("Областные советы считают это уже вторым ударом"), signatureQuestion(plural)!.text);
  const five = at(base, Array.from({ length: 5 }, (_, i) => entry({ title: `Дело ${i}` })));
  assert.ok(signatureQuestion(five)!.text.includes("считает это уже пятым ударом"), signatureQuestion(five)!.text);
  const quoted = signatureQuestion(at(base, [entry({ choice: "Срочная проверка складов" })]))!;
  assert.ok(quoted.text.startsWith("Вы подписали: „Срочная проверка складов“."), quoted.text);
  const many = at(base, Array.from({ length: 12 }, (_, i) => entry({ title: `Дело ${i}` })));
  assert.ok(signatureQuestion(many)!.text.includes("уже очередным ударом"), signatureQuestion(many)!.text);
});

// Ревью GPT/Codex: бюджет «Хроники» пишет в историю «Бюджет года: …» и задевает лагеря — это не подпись.
test("особые дела не считаются подписью: бюджет «Хроники», отметка движка и старые сохранения", async () => {
  const base = await newGame();
  const ready = { ...base, turn: BUDGET_TURN - 1, arc: null };
  const event = budgetEvent(ready)!;
  assert.ok(event, "бюджет на своём ходу");
  const after = await signOption(startEvent(ready, event), "budget:build");
  const budget = after.history.at(-1)!;
  assert.equal(budget.special, "budget", "движок отмечает особое дело");
  assert.ok(budget.choice.startsWith("Бюджет года:"), budget.choice);
  assert.ok(budget.hurt?.length, "бюджет «по минимуму» задевает лагеря — иначе проверка пустая");
  const displeased = { ...after, factions: after.factions.map(group => budget.hurt!.includes(group.id) ? { ...group, relation: -30 } : group) };
  assert.notEqual(signatureCase(displeased)?.entry, budget);
  assert.equal(signatureCase(at(base, [entry({ choice: "Бюджет года: дороги и заказы заводам, остальным — по минимуму" })])), null, "старое сохранение без отметки");
  assert.equal(signatureCase(at(base, [entry({ special: "press" })])), null);
  assert.ok(signatureCase(at(base, [entry({ special: "inspect" })])), "доклад на подпись — настоящая подпись");
});

test("отметка особого дела пишется только в партии 1978 года", async () => {
  const intro = await classicApi.setup("Украина", "coalition", "pragmatist", 7);
  let state = createInitialState("Украина", "coalition", "pragmatist", intro, seededRandom(7));
  for (let turn = 0; turn < 10 && !state.ended; turn++) {
    const event = await classicApi.event(state);
    state = startEvent(state, event);
    state = resolveTurn(state, event.choices[0].id, await classicApi.consequence(state, event.choices[0].id));
  }
  assert.ok(state.history.length > 0 && state.history.every(item => !("special" in item)), "архивная история не меняется");
});
