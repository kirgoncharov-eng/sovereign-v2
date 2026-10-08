import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSave } from "./save.ts";
import { SAVE_VERSION } from "../game/data.ts";
import { classicApi } from "../game/classic.ts";
import { createInitialState, resolveTurn, setVerdict, startEvent } from "../game/engine.ts";
import { initPromises, offeredPromises } from "../game/promises.ts";
import type { GameState } from "../game/types.ts";

const wrap = (state: GameState, screen = "game") => JSON.stringify({ version: SAVE_VERSION, screen, state });
async function initial(seed = 9) {
  const s = createInitialState("Беларусь", "debut", "pragmatist", await classicApi.setup("Беларусь", "debut", "pragmatist", seed), () => 0.4);
  return { ...s, promises: initPromises(offeredPromises(s.seed, s.ideo).suggested, s.resources) };
}

test("сохранение: повреждённое состояние не предлагает продолжение", async () => {
  const s = await initial();
  assert.equal(parseSave(wrap({ ...s, resources: {} } as GameState)), null);
  assert.equal(parseSave(wrap({ ...s, advisors: [null] } as unknown as GameState)), null);
  assert.equal(parseSave(wrap({ ...s, diff: "unknown" } as unknown as GameState)), null);
  assert.equal(parseSave(wrap({ ...s, reign: { term: 2 } } as GameState)), null);
  assert.equal(parseSave(wrap(s, "ending")), null);
  assert.equal(parseSave('{"version":' + SAVE_VERSION + ',"screen":"game","state":{"country":"Беларусь","leader":{},"resources":{},"factions":[],"keyFigures":[],"history":[]}}'), null);
});

test("сохранение: настоящие дела, отчёты и второй срок загружаются без потерь", async () => {
  let s: GameState = await initial();
  let reachedSecond = false;
  for (let turn = 0; turn < 80 && !s.ended; turn++) {
    // Проверяем загрузку и переходы сроков; состояние страны здесь не является предметом теста.
    s = { ...s, resources: { politicalCapital:60, economy:60, military:60, externalReputation:60, internalLegitimacy:60, personalResource:60 }, factions:s.factions.map(f => ({ ...f, relation:40 })), activeCrises:[] };
    s = startEvent(s, await classicApi.event(s));
    assert.deepEqual(parseSave(wrap(s))?.state, JSON.parse(wrap(s)).state, `дело ${turn + 1}`);
    const choices = s.currentEvent!.choices;
    const choice = choices.find(c => c.path === "run" || c.path === "zeroing") ?? choices[0];
    s = resolveTurn(s, choice.id, await classicApi.consequence(s, choice.id));
    assert.deepEqual(parseSave(wrap(s))?.state, JSON.parse(wrap(s)).state, `газета ${turn + 1}`);
    reachedSecond ||= s.turn > 20;
  }
  assert.ok(reachedSecond, "проверена загрузка после двадцатого хода");
  s = setVerdict(s, await classicApi.ending(s));
  assert.deepEqual(parseSave(wrap(s, "ending"))?.state, JSON.parse(wrap(s, "ending")).state);
});

test("сохранение: законы, обещания и данные правления сохраняются буквально", async () => {
  const s = { ...await initial(), turn: 41, laws: [{ id: "foreign_agents", since: 3 }], former: ["Иван Петров"],
    reign: { term: 2, counted: 1, office: "ruler" as const, ruled: 1, arcs: ["mole"], epilogues: ["Развязка"], past: [] } };
  assert.deepEqual(parseSave(wrap(s))?.state, JSON.parse(wrap(s)).state);
});


test("метаданные партии сохраняются; повреждённая аналитика не уничтожает игровое сохранение", async () => {
  const { newAnalyticsRun } = await import("./run-context.ts");
  const s = { ...await initial(), analyticsRun: newAnalyticsRun("6.2", "tg", false) };
  assert.deepEqual(parseSave(wrap(s))?.state.analyticsRun, s.analyticsRun);
  const damaged = { ...s, analyticsRun: { id: "bad" } } as unknown as GameState;
  assert.equal(parseSave(wrap(damaged))?.state.analyticsRun, undefined);
  assert.equal(parseSave(wrap(damaged))?.state.seed, s.seed);
});
