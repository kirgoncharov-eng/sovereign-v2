import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { SAVE_VERSION } from "./data.ts";
import { createInitialState, loyaltyLabel, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { STORY_FIRST_TURN, STORY_GAP, STORY_STEP, replyToLetter, storyLetters, storyOrder } from "./stories.ts";
import { STORY_REPLIES } from "../content/story-replies.ts";
import { parseSave } from "../client/save.ts";
import type { GameState, Letter } from "./types.ts";

// Критерии #156: у письма каждой истории 1978 года две резолюции с видимой ценой; продолжение идёт по ответу;
// без ответа история идёт как раньше; ответ живёт в сохранении; «Дело дня» и архивные страны не меняются.
async function fresh(country: string, seed: number): Promise<GameState> {
  const intro = await classicApi.setup(country, "debut", "pragmatist", seed);
  return createInitialState(country, "debut", "pragmatist", intro, seededRandom(seed));
}

async function playTurn(state: GameState, seed: number): Promise<GameState> {
  const started = startEvent(state, await classicApi.event(state));
  const choices = started.currentEvent!.choices;
  const id = choices[(started.turn + seed) % choices.length].id;
  return resolveTurn(started, id, await classicApi.consequence(started, id));
}

// Играет до письма, на которое можно ответить; null — если партия кончилась раньше.
async function untilReply(state: GameState, seed: number, limit = 40): Promise<GameState | null> {
  let current = state;
  while (!current.ended && current.turn < limit) {
    current = await playTurn(current, seed);
    if (current.lastTurn?.letters?.some(letter => letter.replies?.length && !current.storyReplies?.[letter.story])) return current;
  }
  return null;
}

// Письма одной истории за следующие ходы.
async function followUp(state: GameState, story: string, seed: number, turns = 8): Promise<string[]> {
  let current = state;
  const texts: string[] = [];
  for (let turn = 0; turn < turns && !current.ended; turn++) {
    current = await playTurn(current, seed);
    texts.push(...(current.lastTurn?.letters ?? []).filter(letter => letter.story === story).map(letter => letter.text));
  }
  return texts;
}

const offered = (state: GameState): Letter =>
  state.lastTurn!.letters!.find(letter => letter.replies?.length && !state.storyReplies?.[letter.story])!;

test("ответы на письма: оба ответа каждой встреченной истории ведут к своему продолжению и списывают цену", async () => {
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let state: GameState | null = await fresh(ALTERNATE_COUNTRY, seed);
    while ((state = await untilReply(state, seed))) {
      const letter = offered(state);
      const design = STORY_REPLIES[letter.story];
      assert.deepEqual(letter.replies!.map(reply => reply.id), design.options.map(option => option.id));
      const branches: string[][] = [];
      for (const option of design.options) {
        const answered = replyToLetter(state, letter.story, option.id);
        for (const [key, value] of Object.entries(option.cost)) {
          assert.equal(answered.resources[key as keyof GameState["resources"]],
            Math.max(0, Math.min(100, state.resources[key as keyof GameState["resources"]] + value!)), `${letter.story}: ${key}`);
        }
        if (option.relation && letter.hero) {
          const before: number = state.keyFigures.find(figure => figure.id === letter.hero)!.relation;
          assert.equal(answered.keyFigures.find(figure => figure.id === letter.hero)!.relation,
            Math.max(-100, Math.min(100, before + option.relation)));
        }
        const heroName: string | undefined = state.keyFigures.find(figure => figure.id === letter.hero)?.name;
        assert.deepEqual(answered.storyReplies?.[letter.story],
          { reply: option.id, turn: state.turn, ...(letter.hero ? { hero: letter.hero, heroName } : {}) });
        assert.throws(() => replyToLetter(answered, letter.story, option.id), /уже отправлен/);
        const texts = await followUp(answered, letter.story, seed);
        for (const text of texts) assert.doesNotMatch(text, /\{|undefined|видео|в сети/, `${seed}/${letter.story}/${option.id}: ${text}`);
        branches.push(texts);
      }
      // Развязка помнит ответ: два ответа не дают одинакового продолжения.
      if (branches.every(texts => texts.length)) {
        assert.notDeepEqual(branches[0], branches[1], `${seed}/${letter.story}: продолжения ответов совпали`);
        seen.add(letter.story);
      }
      // Дальше по партии — с первым ответом, чтобы встретить следующие истории.
      state = replyToLetter(state, letter.story, design.options[0].id);
    }
  }
  assert.ok(seen.size >= 5, `за шесть партий встретились и разошлись истории: ${[...seen].join(", ")}`);
});

test("ответы на письма: молчание оставляет историю по отношению героя, ответ закрепляет адресата", async () => {
  const state = await fresh(ALTERNATE_COUNTRY, 1);
  const order = storyOrder(state);
  const k = order.findIndex(story => story.id === "retire");
  assert.ok(k >= 0, "в партии 1 есть история об отставке министра");
  const start = STORY_FIRST_TURN + k * STORY_GAP;
  const at = (target: GameState, step: number) => storyLetters({ ...target, turn: start + step * STORY_STEP - 1 })
    .find(letter => letter.story === "retire")!;
  const first = at(state, 0);
  assert.ok(first.replies?.length && first.hero, "первое письмо министра можно ответить");
  // Без ответа ветка зависит от отношения героя — как в прежних странах.
  const warm = { ...state, keyFigures: state.keyFigures.map(figure => ({ ...figure, relation: 60 })) };
  const cold = { ...state, keyFigures: state.keyFigures.map(figure => ({ ...figure, relation: -60 })) };
  assert.notEqual(at(warm, 2).text, at(cold, 2).text);
  // Ответ решает ветку вместо отношения: «чай» даёт тёплую развязку даже при холодных отношениях.
  const answered = { ...cold, storyReplies: { retire: { reply: "tea", turn: start, hero: first.hero } } };
  assert.equal(at(answered, 2).text, at(warm, 2).text);
  assert.equal(at(answered, 0).replies, undefined, "на отвеченное письмо второй раз не отвечают");
  // Новый антагонист интриги не отнимает историю у героя, которому уже ответили.
  const hero = state.keyFigures.find(figure => figure.id === first.hero)!;
  const rival = { ...answered, arc: { ...(state.arc ?? { id: "x", targetRole: "", flags: [], done: [] }), target: hero.name } } as GameState;
  assert.equal(at(rival, 3).from, hero.name);
});

test("ответы на письма: ответ живёт в сохранении", async () => {
  const state = await untilReply(await fresh(ALTERNATE_COUNTRY, 2), 2);
  assert.ok(state);
  const letter = offered(state);
  const answered = replyToLetter(state, letter.story, STORY_REPLIES[letter.story].options[1].id);
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: answered }));
  assert.ok(restored, "сохранение с ответом читается");
  assert.deepEqual(restored.state.storyReplies, answered.storyReplies);
  assert.deepEqual(restored.state.lastTurn?.letters, answered.lastTurn?.letters);
  const broken = { ...answered, storyReplies: { [letter.story]: { reply: 7, turn: "x" } } };
  assert.equal(parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: broken })), null);
});

test("ответы на письма: в «Деле дня» и в архивных странах ответить нельзя", async () => {
  const daily = { ...await fresh(ALTERNATE_COUNTRY, 3), daily: "2026-10-19" };
  for (let turn = STORY_FIRST_TURN; turn < 30; turn++) {
    assert.ok(storyLetters({ ...daily, turn }).every(letter => !letter.replies && !letter.hero), `«Дело дня», ход ${turn}`);
  }
  for (const country of ["Грузия", "Украина"]) {
    const state = await fresh(country, 3);
    for (let turn = STORY_FIRST_TURN; turn < 30; turn++) {
      assert.ok(storyLetters({ ...state, turn }).every(letter => !letter.replies && !letter.hero), `${country}, ход ${turn}`);
    }
    const played = await untilReply(state, 3, 24);
    assert.equal(played, null, `${country}: письма без резолюций`);
  }
});

// #182: ответ — личное дело героя. Преемник на той же должности его историю не продолжает.
test("ответы на письма: история с ответом не переходит к преемнику на той же должности", async () => {
  const state = await fresh(ALTERNATE_COUNTRY, 1);
  const k = storyOrder(state).findIndex(story => story.id === "retire");
  const start = STORY_FIRST_TURN + k * STORY_GAP;
  const at = (target: GameState, step: number) => storyLetters({ ...target, turn: start + step * STORY_STEP - 1 })
    .find(letter => letter.story === "retire");
  const first = at(state, 0)!;
  const offered = { ...state, turn: start, lastTurn: { letters: [first] } } as unknown as GameState;
  const answered = replyToLetter(offered, "retire", "tea");
  const hero = state.keyFigures.find(figure => figure.id === first.hero)!;
  assert.equal(answered.storyReplies?.retire.heroName, hero.name);
  assert.equal(at(answered, 2)?.from, hero.name, "пока герой на месте, история его");
  // Преемник по письму или сделке: та же должность, другое имя — так их меняет resolveTurn.
  const successor = { ...answered, keyFigures: answered.keyFigures.map(figure => figure.id === hero.id
    ? { ...figure, name: "Олег Новицкий", relation: 0 } : figure) };
  for (const step of [1, 2, 3]) assert.equal(at(successor, step), undefined, `шаг ${step}: преемник не получает чужую историю`);
  // Сохранение до этой правки (без имени героя) читается и ведёт себя как раньше.
  const legacy = { ...answered, storyReplies: { retire: { reply: "tea", turn: start, hero: hero.id } } };
  assert.equal(at(legacy, 2)?.from, hero.name);
  const saved = { ...state, storyReplies: answered.storyReplies };
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: "game", state: saved }));
  assert.deepEqual(restored?.state.storyReplies, answered.storyReplies, "имя героя читается из сохранения");
});

test("ответы на письма: подпись отношения меняется вместе с числом", async () => {
  const state = await fresh(ALTERNATE_COUNTRY, 2);
  const oligarch = state.keyFigures.find(figure => figure.id === "oligarch")!;
  const replies = STORY_REPLIES.son.options.map(({ id, text, cost, relation }) => ({ id, text, cost, relation }));
  const offer = (relation: number) => ({
    ...state, turn: 9,
    keyFigures: state.keyFigures.map(figure => figure.id === oligarch.id ? { ...figure, relation, loyalty: loyaltyLabel(relation) } : figure),
    lastTurn: { letters: [{ kind: "call", from: oligarch.name, text: "…", story: "son", hero: oligarch.id, replies }] },
  }) as unknown as GameState;
  const after = (relation: number, reply: string) => replyToLetter(offer(relation), "son", reply).keyFigures.find(f => f.id === oligarch.id)!;
  assert.deepEqual([after(25, "hush").relation, after(25, "hush").loyalty], [40, "союзник"], "нейтрал +15 → союзник");
  assert.deepEqual([after(35, "court").relation, after(35, "court").loyalty], [20, "нейтрал"], "союзник −15 → нейтрал");
  assert.deepEqual([after(-20, "court").relation, after(-20, "court").loyalty], [-35, "враг"], "нейтрал −15 → враг");
  assert.deepEqual([after(95, "hush").relation, after(95, "hush").loyalty], [100, "союзник"], "предел +100");
  assert.deepEqual([after(-95, "court").relation, after(-95, "court").loyalty], [-100, "враг"], "предел −100");
});
