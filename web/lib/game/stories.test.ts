import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { COUNTRIES } from "./data.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { STORY_FIRST_TURN, STORY_GAP, STORY_STEP, storyLetters, storyOrder } from "./stories.ts";
import type { GameState } from "./types.ts";

const SLOT = /\{[^}]*\}/;
const healthy = (s: GameState): GameState => ({ ...s,
  resources: { politicalCapital: 60, economy: 60, military: 60, externalReputation: 60, internalLegitimacy: 60, personalResource: 60 },
  factions: s.factions.map(f => ({ ...f, relation: 40 })), activeCrises: [] });

async function fresh(country: string, seed: number) {
  return createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", seed), seededRandom(seed));
}

test("истории: первые два хода без писем, дальше — живые сообщения без пустых слотов и повторов", async () => {
  for (const country of Object.keys(COUNTRIES)) for (const seed of [4, 19]) {
    let s = await fresh(country, seed);
    const seen = new Set<string>();
    let total = 0;
    while (!s.ended && s.turn < 40) {
      s = healthy(s);
      const ev = await classicApi.event(s);
      const before = startEvent(s, ev);
      const choice = ev.choices.find(c => !c.path) ?? ev.choices[0];
      s = resolveTurn(before, choice.id, await classicApi.consequence(before, choice.id));
      const letters = s.lastTurn!.letters ?? [];
      if (s.turn < STORY_FIRST_TURN) assert.equal(letters.length, 0, `${country}: письмо на ходу ${s.turn}`);
      assert.ok(letters.length <= 2, `${country}, ход ${s.turn}: ${letters.length} письма сразу`);
      for (const letter of letters) {
        assert.ok(!SLOT.test(letter.text), `${country}/${seed}, ход ${s.turn}: ${letter.text}`);
        assert.ok(letter.from, "у письма есть отправитель");
        assert.ok(!seen.has(letter.text), `повтор: ${letter.text}`);
        seen.add(letter.text);
        total++;
      }
    }
    assert.ok(total >= 8, `${country}/${seed}: за 40 ходов писем ${total}`);
  }
});

test("истории: развязка зависит от того, как вы обошлись с человеком", async () => {
  const s = await fresh("Украина", 7);
  const order = storyOrder(s);
  const k = order.findIndex(story => story.id === "farewell" || story.id === "book" || story.id === "illness");
  assert.ok(k >= 0, "в партии есть история с развилкой по отношениям");
  const story = order[k];
  const finale = STORY_FIRST_TURN + k * STORY_GAP + (story.steps.length - 1) * STORY_STEP;
  const at = (relation: number) => {
    const state = { ...s, turn: finale - 1, keyFigures: s.keyFigures.map(f => ({ ...f, relation })) };
    return storyLetters(state).find(l => l.story === story.id)?.text;
  };
  const warm = at(60), cold = at(-60);
  assert.ok(warm && cold, "развязка приходит в свой ход");
  assert.notEqual(warm, cold, "тёплые и холодные отношения дают разную развязку");
  assert.equal(at(60), warm, "одно и то же состояние — одно и то же письмо");
});

test("истории: род героя — по имени, сообщения не приходят после конца правления", async () => {
  const s = await fresh("Казахстан", 3);
  const female = { ...s, keyFigures: s.keyFigures.map(f => ({ ...f, name: "Айгерим Байтурсынова" })) };
  const order = storyOrder(female);
  const k = order.findIndex(story => story.id === "retire");
  if (k >= 0) {
    const text = storyLetters({ ...female, turn: STORY_FIRST_TURN + k * STORY_GAP - 1 }).find(l => l.story === "retire")!.text;
    assert.match(text, /она так почти никогда не делает/);
  }
  assert.equal(storyLetters({ ...s, turn: 0 }).length, 0);
});

// #184: герой истории закрепляется первым письмом; во втором сроке его не отнимает смена антагониста интриги.
test("истории 1978: письма одной истории приходят от одного человека весь срок и дальше", async () => {
  const country = "Беларусь · 1978";
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    let state = createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", seed), seededRandom(seed));
    const authors = new Map<string, Set<string>>();
    while (!state.ended && state.turn < 40) {
      const started = startEvent(state, await classicApi.event(state));
      const choices = started.currentEvent!.choices;
      const id = choices[(started.turn + seed) % choices.length].id;
      state = resolveTurn(started, id, await classicApi.consequence(started, id));
      for (const letter of state.lastTurn?.letters ?? []) {
        if (!letter.role) continue; // истории о людях из окружения (секретарь, охрана) без должности — вне проверки
        authors.set(letter.story, (authors.get(letter.story) ?? new Set()).add(letter.from));
      }
    }
    for (const [story, names] of authors) assert.equal(names.size, 1, `${seed}/${story}: ${[...names].join(", ")}`);
  }
});

test("истории 1978: закреплённый герой остаётся героем, даже став антагонистом; без закрепления — как раньше", async () => {
  const country = "Беларусь · 1978";
  const state = await fresh(country, 1);
  const k = storyOrder(state).findIndex(story => story.id === "retire");
  const final = STORY_FIRST_TURN + k * STORY_GAP + 2 * STORY_STEP - 1;
  const first = storyLetters({ ...state, turn: STORY_FIRST_TURN + k * STORY_GAP - 1 }).find(letter => letter.story === "retire")!;
  const hero = state.keyFigures.find(figure => figure.id === first.hero)!;
  const arc = { id: "alt_contracts", target: hero.name, targetRole: "", flags: [], done: [], epilogue: null };
  const pinned = { ...state, turn: final, arc, storyHeroes: { retire: { hero: hero.id, heroName: hero.name } } };
  assert.equal(storyLetters(pinned).find(letter => letter.story === "retire")?.from, hero.name);
  const loose = storyLetters({ ...state, turn: final, arc }).find(letter => letter.story === "retire");
  assert.notEqual(loose?.from, hero.name, "сохранения без закрепления читаются по-старому");
});
