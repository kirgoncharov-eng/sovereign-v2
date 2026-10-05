// Симуляция баланса на настоящих делах игры: N партий на каждую сложность для трёх игроков.
//   random — нажимает наугад;
//   hint   — видит то же, что игрок без совета: стрелки и пометки об обещаниях, бережёт просевшие опоры;
//   smart  — знает точные цифры (как с советом на каждом ходу) и смотрит на ход вперёд.
// Ориентиры: «Коалиция» — hint ≈ 2 из 3 партий, random ≈ 1 из 4.
// Колонки: доля доживших до конца первого срока / начавших второй / начавших третий · медиана лет у власти.
// Запуск: npm run balance  (N=500 npm run balance — точнее)
import { classicApi } from "../lib/game/classic.ts";
import { initPromises, offeredPromises, promiseImpact } from "../lib/game/promises.ts";
import { choiceEffects, createInitialState, leaderRating, planTurn, resolveTurn, startEvent } from "../lib/game/engine.ts";
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
    let win = 0, second = 0, third = 0;
    const lens: number[] = [];
    for (let i = 0; i < N; i++) {
      const country = pick(Object.keys(COUNTRIES)), ideo = pick(IDEOLOGIES).id;
      let s = createInitialState(country, d, ideo, await classicApi.setup(country, d, ideo));
      s = { ...s, promises: initPromises(offeredPromises(s.seed, s.ideo).suggested, s.resources) };
      while (!s.ended && s.turn < 400) {
        s = startEvent(s, await classicApi.event(s));
        // В соревновании «кто дольше» уходить незачем: на вопросе о сроках бот выбирает пути, которые оставляют у власти.
        const all = s.currentEvent!.choices;
        const stay = all.filter(x => x.path && !["exit", "successor"].includes(x.path));
        const c = choose(s, s.currentEvent!.special?.kind === "terms" && stay.length && name !== "random" ? stay : all);
        s = resolveTurn(s, c.id, await classicApi.consequence(s, c.id));
      }
      if (s.turn >= 20) win++;
      if (s.turn > 20) second++;
      if (s.turn > 40) third++;
      lens.push(s.turn);
      if (d === "coalition" && s.path) { const k = `${s.path.id} → ${s.endType}`; (ends[name] ??= {})[k] = (ends[name][k] ?? 0) + 1; }
    }
    lens.sort((a, b) => a - b);
    const med = lens[Math.floor(lens.length / 2)];
    row.push(`${name} ${String(Math.round((win / N) * 100)).padStart(3)}% / 2-й ${String(Math.round((second / N) * 100)).padStart(2)}% / 3-й ${String(Math.round((third / N) * 100)).padStart(2)}% · медиана ${(med / 4).toFixed(1)} г.`);
  }
  console.log(d.padEnd(9), row.join("   "));
}

console.log("\nВопрос о сроках, «Коалиция» (путь → концовка, из дошедших до 18-го хода):");
for (const [name, m] of Object.entries(ends)) {
  console.log(`  ${name.padEnd(6)} ${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
