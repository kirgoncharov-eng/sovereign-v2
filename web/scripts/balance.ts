// Симуляция баланса на настоящих делах игры: N партий на каждую сложность для трёх игроков.
//   random — нажимает наугад;
//   hint   — видит то же, что игрок без совета: стрелки и пометки об обещаниях, бережёт просевшие опоры;
//   smart  — знает точные цифры (как с советом на каждом ходу) и смотрит на ход вперёд.
// Ориентиры: «Коалиция» — hint ≈ 2 из 3 партий, random ≈ 1 из 4.
// Запуск: npm run balance  (N=500 npm run balance — точнее)
import { classicApi } from "../lib/game/classic.ts";
import { initPromises, offeredPromises, promiseImpact, promisesKept } from "../lib/game/promises.ts";
import { choiceEffects, createInitialState, isSurvival, leaderRating, planTurn, resolveTurn, startEvent } from "../lib/game/engine.ts";
import { COUNTRIES, DIFFICULTIES, IDEOLOGIES, RESOURCE_KEYS } from "../lib/game/data.ts";
import type { Choice, DifficultyId, GameState } from "../lib/game/types.ts";

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const N = Number(process.env.N ?? 200);
const BIG = 6;

const best = (chs: Choice[], score: (c: Choice) => number) => chs.reduce((b, c) => (score(c) > score(b) ? c : b));
const strategies: Record<string, (s: GameState, chs: Choice[]) => Choice> = {
  random: (_s, chs) => pick(chs),
  hint: (s, chs) => best(chs, c => Object.entries(choiceEffects(s, c).resources as Record<string, number>)
    .reduce((t, [k, v]) => t + Math.sign(v) * (Math.abs(v) >= BIG ? 2 : 1) * (s.resources[k as keyof GameState["resources"]] < 35 ? 3 : 1), 0)
    + promiseImpact(s.promises, c.tags).advances.length * 2 - promiseImpact(s.promises, c.tags).breaks.length * 4 + Math.random() * 0.5),
  smart: (s, chs) => best(chs, c => { const p = planTurn(s, c.id, { assumeSuccess: true }); return Math.min(...RESOURCE_KEYS.map(k => p.resources[k])) + leaderRating(p.factions, p.resources) * 0.5; }),
};

// Как игроки решают «вопрос о сроках» на «Коалиции» и чем это кончается.
const ends: Record<string, Record<string, number>> = {};

for (const d of Object.keys(DIFFICULTIES) as DifficultyId[]) {
  const row: string[] = [];
  for (const [name, choose] of Object.entries(strategies)) {
    let win = 0, turns = 0, kept = 0;
    for (let i = 0; i < N; i++) {
      const country = pick(Object.keys(COUNTRIES)), ideo = pick(IDEOLOGIES).id;
      let s = createInitialState(country, d, ideo, await classicApi.setup(country, d, ideo));
      s = { ...s, promises: initPromises(offeredPromises(s.seed, s.ideo).suggested, s.resources) };
      while (!s.ended) {
        s = startEvent(s, await classicApi.event(s));
        const c = choose(s, s.currentEvent!.choices);
        s = resolveTurn(s, c.id, await classicApi.consequence(s, c.id));
      }
      if (isSurvival(s.endType)) win++;
      if (d === "coalition" && s.path) { const k = `${s.path.id} → ${s.endType}`; (ends[name] ??= {})[k] = (ends[name][k] ?? 0) + 1; }
      turns += s.turn; kept += promisesKept(s.promises);
    }
    row.push(`${name} ${String(Math.round((win / N) * 100)).padStart(3)}% (${(turns / N).toFixed(1)} хода, обещаний ${(kept / N).toFixed(1)})`);
  }
  console.log(d.padEnd(9), row.join("   "));
}

console.log("\nВопрос о сроках, «Коалиция» (путь → концовка, из дошедших до 18-го хода):");
for (const [name, m] of Object.entries(ends)) {
  console.log(`  ${name.padEnd(6)} ${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
