import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "../game/classic.ts";
import { createInitialState, seededRandom, startEvent } from "../game/engine.ts";
import { squareStateOf } from "./square-state.ts";
import { drawSquare, squareCaption, squareLife } from "./square.ts";
import { drawScene } from "./scenes.ts";
import { sceneAfter, sceneOf } from "../content/scene-map.ts";

const fresh = async () => createInitialState("Беларусь", "debut", "liberal", await classicApi.setup("Беларусь", "debut", "liberal", 11), seededRandom(11));

test("площадь реагирует на исполненное решение, а не на вариант в новом деле", async () => {
  const base = await fresh();
  const event = await classicApi.event(base);
  event.choices[0].tags = ["repress"];
  assert.notEqual(squareStateOf(startEvent(base, event)).response, "lockdown");
  const row = { year: 2025, title: "Дело", choice: "Разгон", headline: "Итог", historianNote: "", tags: ["repress" as const], success: true };
  const after = squareStateOf({ ...base, turn: 1, history: [row] });
  assert.equal(after.response, "lockdown");
  assert.ok(squareLife(after).police > squareLife(squareStateOf(base)).police);
  assert.notEqual(squareStateOf({ ...base, history: [{ ...row, success: false }] }).response, "lockdown");
});

test("победа вызывает празднование только в квартал выборов; проигрыш не вызывает праздника", async () => {
  const base = await fresh();
  const e = { turn: 10, kind: "parliament" as const, leader: 60, top: { id: "x", name: "Партия", share: 20 }, outcome: "won" as const };
  assert.equal(squareStateOf({ ...base, turn: 10, elections: [e] }).response, "celebration");
  assert.notEqual(squareStateOf({ ...base, turn: 11, elections: [e] }).response, "celebration");
  assert.notEqual(squareStateOf({ ...base, turn: 10, elections: [{ ...e, outcome: "lost" }] }).response, "celebration");
});

test("экономические трудности, силовой кризис и траур имеют разные видимые состояния", async () => {
  const base = await fresh();
  const weak = squareStateOf({ ...base, resources: { ...base.resources, economy: 15 } });
  assert.ok(squareLife(weak).blackout && squareLife(weak).queues);
  assert.match(squareCaption(weak), /без света/);
  const event = { ...await classicApi.event(base), card: "terror" };
  const mourning = squareStateOf(startEvent(base, event));
  assert.equal(mourning.response, "mourning");
  assert.equal(squareLife(mourning).protest, 0);
  const military = { ...weak, military: 70, security: -70 };
  assert.ok(squareLife(military).tanks > 0);
  assert.match(squareCaption(military), /бронетехника/);
});

test("фото ужина отличается от кабинета; все новые сцены и площадь рисуются на узком и широком растре", async () => {
  const base = await fresh();
  const event = { ...await classicApi.event(base), title: "Непрошеная помощь", beat: { arcId: "money", arcTitle: "Чужие деньги", turn: 1, episode: 1, total: 5 } };
  const choice = { ...event.choices[0], arc: { flag: "o_thank", ok: "Ужин" } };
  assert.equal(sceneOf(event), "office");
  assert.equal(sceneAfter(event, choice, false), "dinner");
  for (const W of [80, 195, 455]) for (const frame of [0, 9, 28]) {
    let calls = 0;
    const ctx = { fillStyle: "", fillRect: (...values: number[]) => { assert.ok(values.every(Number.isFinite)); calls++; } } as unknown as CanvasRenderingContext2D;
    const square = squareStateOf(base, 3);
    for (const key of ["office", "cabinet", "archive", "dinner"] as const) { drawScene(ctx, W, 60, key, square, frame); assert.ok(calls); }
    for (const response of [null, "lockdown", "celebration", "works", "mourning"] as const) drawSquare(ctx, W, 64, { ...square, response }, frame);
    drawSquare(ctx, W, 64, { ...square, blackout: true, economy: 10 }, frame);
  }
});
