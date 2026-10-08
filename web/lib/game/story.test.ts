import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCS } from "../content/arcs.ts";
import { EARLY_THREADS } from "../content/early-threads.ts";
import { LAWS } from "../content/laws.ts";
import { ACTIONS, TERM } from "./data.ts";
import { classicApi, beatEvent, earlyArcHook } from "./classic.ts";
import { createInitialState, startEvent } from "./engine.ts";
import type { GameState, ResourceKey } from "./types.ts";

const fresh = async (): Promise<GameState> => createInitialState("Украина", "debut", "pragmatist", await classicApi.setup("Украина", "debut", "pragmatist", 11), () => 0.2);
const history = (success: boolean) => ({ year: 2025, title: "Эпизод", choice: "Решение", headline: "Итог", historianNote: "", success });

test("продолжения всех ранних путей учитывают успех, не раскрывают слоты и не повторяются", async () => {
  const base = await fresh();
  for (const arc of ARCS) {
    const content = EARLY_THREADS[arc.id];
    assert.ok(content, arc.id);
    for (const beat of arc.beats.slice(0, 2)) {
      const flags = new Set(beat.variants.flatMap(v => v.choices.map(c => c.flag)));
      const versions = new Set<string>();
      for (const flag of flags) {
        for (const success of [true, false]) {
          let last: string | null = null;
          for (const turn of beat.turn === 1 ? [2] : [4, 6]) {
            const state = { ...base, turn: turn - 1, currentEvent: null, history: Array.from({ length: turn - 1 }, () => history(success)), arc: { id: arc.id, target: "Павел Тестов", targetRole: "Министр", flags: [flag], done: [beat.turn], epilogue: null } };
            const text = earlyArcHook(state);
            assert.ok(text, `${arc.id}/${flag}/${success}/${turn}`);
            assert.ok(!/\{\w+(:\w+)?\}/.test(text));
            assert.notEqual(text, last, `${arc.id}/${flag}: повтор на ходу 6`);
            if (success) versions.add(text);
            last = text;
          }
        }
      }
      assert.equal(versions.size, flags.size * (beat.turn === 1 ? 1 : 2), `${arc.id}: пути должны различаться`);
    }
  }
});

test("продолжение берёт результат текущего срока и молчит после развязки и в самом эпизоде", async () => {
  const base = await fresh();
  const state: GameState = { ...base, turn: TERM + 3, currentEvent: null, history: [...Array.from({ length: TERM }, () => history(false)), ...Array.from({ length: 3 }, () => history(true))], arc: { id: "reporter", target: "Павел Тестов", targetRole: "Министр", flags: ["later", "commission"], done: [1, 3], epilogue: null } };
  assert.match(earlyArcHook(state)!, /Члены вашей комиссии/);
  const live = startEvent(state, await classicApi.event(state));
  assert.ok((await classicApi.consequence(live, "a")).narrative.includes(earlyArcHook(live)!));
  assert.equal(earlyArcHook({ ...state, arc: { ...state.arc!, epilogue: "Раскрыта" } }), null);
  const beforeEpisode = { ...state, turn: TERM + 2, arc: { ...state.arc!, done: [1] } };
  const episode = startEvent(beforeEpisode, beatEvent(beforeEpisode)!);
  assert.equal(earlyArcHook(episode), null);
  assert.equal(earlyArcHook({ ...state, turn: TERM + 4 }), null);
  assert.equal(earlyArcHook({ ...state, history: state.history.map(h => ({ ...h, success: undefined })) }), null);
});

test("цена законов объясняет их собственные потери, налог не выдаётся за бюджетные выплаты", () => {
  for (const law of LAWS) {
    const delta: Partial<Record<ResourceKey, number>> = {};
    for (const tag of law.tags) for (const [key, value] of Object.entries(ACTIONS[tag].res)) {
      const k = key as ResourceKey;
      delta[k] = (delta[k] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(delta)) if (value < 0) assert.ok(law.costs?.[key as ResourceKey], `${law.id}: нет причины ${key}`);
  }
  const tax = LAWS.find(l => l.id === "progressive_tax")!;
  assert.match(tax.costs!.economy!, /капитал/);
  assert.doesNotMatch(tax.costs!.economy!, /выплат/);
});

test("авторская цена расследования доходит до выбора и называет реальное дело", async () => {
  const base = await fresh();
  const state = { ...base, turn: 2, arc: { id: "reporter", target: "Павел Тестов", targetRole: "Министр", flags: ["public"], done: [1], epilogue: null } };
  const event = beatEvent(state)!;
  const commission = event.choices.find(c => c.arc?.flag === "commission")!;
  assert.match(commission.costReasons!.economy!, /комиссии/);
  assert.doesNotMatch(commission.costReasons!.economy!, /бизнес/);
});
