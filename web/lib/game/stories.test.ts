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
