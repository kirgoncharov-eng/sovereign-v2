import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { ARCHIVE_CARD, archiveDescription } from "./archive-memory.ts";
import { ARCHIVE_FOUND, ARCHIVE_MEMORY } from "../content/archive-memory.ts";
import { ALTERNATE_EVENTS } from "../content/alternate-history.ts";
import type { GameState } from "./types.ts";

// Критерии #178: дело 20-го хода помнит исход расследования «Четвёртый экземпляр».
const withFlags = (flags: string[], id = "alt_contracts") =>
  ({ arc: { id, target: "Директор", targetRole: "", flags, done: [], epilogue: null } }) as unknown as GameState;
const ORIGINAL = ALTERNATE_EVENTS.find(card => card.id === ARCHIVE_CARD)!.description;

test("память архива: исход и его успех выбирают текст; без находки остаётся текст карточки", () => {
  for (const [ending, memory] of Object.entries(ARCHIVE_MEMORY)) {
    assert.equal(archiveDescription(withFlags(["ok:audit", "audit", `ok:${ending}`, ending])), memory.ok, `${ending}: успех`);
    assert.equal(archiveDescription(withFlags(["audit", ending])), memory.failed, `${ending}: провал`);
  }
  assert.equal(archiveDescription(withFlags(["ok:audit", "audit", "witness"])), ARCHIVE_FOUND, "приложение нашли, развязки не было");
  assert.equal(archiveDescription(withFlags(["case", "ok:case"])), ARCHIVE_FOUND, "заверенная копия от кредитора");
  assert.equal(archiveDescription(withFlags(["talk", "bargain"])), null, "приложения игрок не видел");
  assert.equal(archiveDescription(withFlags(["ok:closed", "closed"], "journalist")), null, "другая интрига");
  assert.equal(archiveDescription({ arc: null } as unknown as GameState), null);
});

test("кампания 1978: на 20-м ходу дело о приложении 1956 года говорит об исходе расследования", async () => {
  let checked = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const intro = await classicApi.setup(ALTERNATE_COUNTRY, "debut", "pragmatist", seed);
    let state = createInitialState(ALTERNATE_COUNTRY, "debut", "pragmatist", intro, seededRandom(seed));
    while (!state.ended && state.turn < 20) {
      state = startEvent(state, await classicApi.event(state));
      const event = state.currentEvent!;
      if (event.card === ARCHIVE_CARD) {
        const expected = archiveDescription(state);
        assert.ok(event.description.includes(expected ?? ORIGINAL), `seed ${seed}: описание дела`);
        if (expected) assert.doesNotMatch(event.description, /Депутат нашёл закрытое приложение/, `seed ${seed}`);
        checked++;
      }
      const choices = event.choices;
      const id = choices[(state.turn + seed) % choices.length].id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
    }
  }
  assert.ok(checked >= 6, `дело 20-го хода встретилось в ${checked} партиях`);
});
