// Дерево событий кампании 1978 (#213, #214): насколько решения и положение дел в стране меняют то, что происходит.
// Семь стилей правления играют одни и те же зёрна; бот держится своего стиля, но бережёт опоры (как игрок, видящий цену).
// Печатает: какие ходы зависят от игры, сколько маршрутов на зерно, редкие ветки, сходство партий разными стилями,
// долю авторских дел второго срока и сколько партий каждый стиль доводит до 20-го хода.
// Запуск: npm run tree  (SEEDS=60 DIFF=crisis npm run tree — другие зёрна и сложность)
import { classicApi } from "../lib/game/classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../lib/game/engine.ts";
import { ALTERNATE_COUNTRY } from "../lib/game/alternate-world.ts";
import { RESOURCE_KEYS } from "../lib/game/data.ts";
import { mostLoyal, rivalOf } from "../lib/game/country-profile.ts";
import type { Choice, DifficultyId, GameState } from "../lib/game/types.ts";
import { botTurn, LANES, STYLES } from "./bot.ts";

const SEEDS = Number(process.env.SEEDS ?? 30);
const DIFF = (process.env.DIFF ?? "coalition") as DifficultyId;
const TURNS = 40;

type Step = { turn: number; event: string; authored: boolean };
type Run = { seed: number; style: string; steps: Step[]; turn: number; ally: string[]; rival: string[]; end: string | null; country: Record<number, number[]> };

function eventKey(event: GameState["currentEvent"] & { cardId?: string }): string {
  if (!event) return "—";
  if (event.beat) return `эпизод: ${event.title}`;
  if (event.call && !event.call.negotiation) return `звонок: ${event.call.figure}`;
  if (event.special?.kind) return `${event.special.kind}: ${event.title}`;
  return event.title;
}

async function play(seed: number, style: string): Promise<Run> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, DIFF, "pragmatist", seed);
  let state = createInitialState(ALTERNATE_COUNTRY, DIFF, "pragmatist", intro, seededRandom(seed));
  const steps: Step[] = [];
  const ally: string[] = [];
  const rival: string[] = [];
  const country: Record<number, number[]> = {};
  while (!state.ended && state.turn < TURNS) {
    const event = await classicApi.event(state) as GameState["currentEvent"] & { cardId?: string };
    state = startEvent(state, event!);
    let choice: Choice;
    ({ state, choice } = botTurn(state, style));
    // Авторское дело 1978 года — карточка или законопроект кампании (alt_…), а не общая колода архива.
    const authored = /(^|:)alt_/.test(event?.cardId ?? "");
    steps.push({ turn: state.turn + 1, event: eventKey(event), authored });
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    ally.push(mostLoyal(state.factions)?.bloc ?? "—");
    rival.push(rivalOf(state)?.bloc ?? "—");
    // Положение страны после 10-го и 20-го хода: шесть ресурсов и отношения лагерей.
    if (state.turn === 10 || state.turn === 20) country[state.turn] = [...RESOURCE_KEYS.map(key => state.resources[key]), ...state.factions.map(group => group.relation)];
  }
  return { seed, style, steps, turn: state.turn, ally, rival, end: state.turn <= 20 ? state.endType : null, country };
}

const runs: Run[] = [];
for (let seed = 1; seed <= SEEDS; seed++) for (const style of [...Object.keys(STYLES), ...Object.keys(LANES)]) runs.push(await play(seed, style));

const at = (run: Run, turn: number) => run.steps.find(step => step.turn === turn)?.event;
const bySeed = (seed: number) => runs.filter(run => run.seed === seed);

// Ход зависит от игры, если хотя бы в 10% зёрен разные стили получили на нём разные события.
console.log(`Кампания 1978, «${DIFF}», ${SEEDS} зёрен × ${Object.keys(STYLES).length + Object.keys(LANES).length} стилей\n`);
const dependent: number[] = [];
for (let turn = 1; turn <= 20; turn++) {
  const reached = runs.filter(run => at(run, turn));
  const counts = new Map<string, number>();
  for (const run of reached) counts.set(at(run, turn)!, (counts.get(at(run, turn)!) ?? 0) + 1);
  let varied = 0;
  for (let seed = 1; seed <= SEEDS; seed++) if (new Set(bySeed(seed).map(run => at(run, turn)).filter(Boolean)).size > 1) varied++;
  if (varied >= SEEDS * 0.1) dependent.push(turn);
  const branches = [...counts].map(([name, n]) => {
    const share = Math.round((n / reached.length) * 100);
    return `${name} ${share}%${counts.size > 1 && share < 5 ? " ← реже 5%" : ""}`;
  });
  console.log(`${String(turn).padStart(2)} ${varied >= SEEDS * 0.1 ? "*" : " "} ${branches.join(" · ")}`);
}

const routes = Array.from({ length: SEEDS }, (_, i) =>
  new Set(bySeed(i + 1).map(run => run.steps.filter(step => step.turn <= 20).map(step => step.event).join("|"))).size).sort((a, b) => a - b);
const overlaps: number[] = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const group = bySeed(seed);
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    const shared = Array.from({ length: 20 }, (_, k) => k + 1).filter(turn => at(group[i], turn) && at(group[i], turn) === at(group[j], turn)).length;
    overlaps.push(shared / 20);
  }
}
overlaps.sort((a, b) => a - b);
const second = runs.flatMap(run => run.steps.filter(step => step.turn > 20));
const survived = [...Object.keys(STYLES), ...Object.keys(LANES)].map(style => {
  const own = runs.filter(run => run.style === style);
  return `${style} ${Math.round((own.filter(run => run.turn >= 20).length / own.length) * 100)}%`;
});

console.log(`\nХодов первого срока, зависящих от игры: ${dependent.length} из 20 (${dependent.join(", ")})`);
console.log(`Маршрутов первого срока на зерно: от ${routes[0]} до ${routes.at(-1)}, медиана ${routes[Math.floor(routes.length / 2)]}`);
console.log(`Сходство двух партий разными стилями на одном зерне: медиана ${Math.round(overlaps[Math.floor(overlaps.length / 2)] * 100)}% ходов`);
console.log(`Авторских дел во втором сроке: ${second.length ? Math.round((second.filter(step => step.authored).length / second.length) * 100) : 0}% из ${second.length}`);
console.log(`Дошли до 20-го хода: ${survived.join(" · ")}`);
console.log(`Переворотов в первом сроке: ${runs.filter(run => run.end === "coup").length} из ${runs.length} партий`);

// Разошлись ли дороги: самый лояльный и самый враждебный лагерь после 9-го и 12-го хода (перед делами 10 и 13)
// и сходство партий двух дорог на одном зерне.
const top = (own: Run[], pick: (run: Run) => string | undefined) => {
  const counts = new Map<string, number>();
  for (const run of own) { const bloc = pick(run); if (bloc) counts.set(bloc, (counts.get(bloc) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([bloc, n]) => `${bloc} ${Math.round((n / own.length) * 100)}%`).join(", ");
};
for (const lane of Object.keys(LANES)) {
  const own = runs.filter(run => run.style === lane);
  const line = [9, 12].map(turn => `${turn}: за ${top(own, run => run.ally[turn - 1])}; против ${top(own, run => run.rival[turn - 1])}`);
  console.log(`Дорога ${lane} — после хода ${line.join(" · ")}`);
  console.log(`  дела 10/13/15: ${[10, 13, 15].map(turn => top(own, run => at(run, turn))).join(" | ")}`);
}
const laneNames = Object.keys(LANES);
const distinct = (turn: number) => Array.from({ length: SEEDS }, (_, i) => i + 1).filter(seed => {
  const allies = bySeed(seed).filter(run => laneNames.includes(run.style)).map(run => run.ally[turn - 1]);
  return allies.every(Boolean) && new Set(allies).size === laneNames.length;
}).length;
console.log(`Три дороги с разными самыми верными лагерями: после 9-го хода в ${distinct(9)} из ${SEEDS} зёрен, после 12-го — в ${distinct(12)}`);
const laneOverlap: number[] = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const group = bySeed(seed).filter(run => laneNames.includes(run.style));
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    laneOverlap.push(Array.from({ length: 20 }, (_, k) => k + 1).filter(turn => at(group[i], turn) && at(group[i], turn) === at(group[j], turn)).length / 20);
  }
}
laneOverlap.sort((a, b) => a - b);

// Второй замер (#213): совпадение названий дел не меряет разницу выборов. Насколько расходится сама страна —
// средняя разница по ресурсам и по отношениям лагерей между двумя стилями на одном зерне, в пунктах шкалы.
const apart = (turn: number, styles: string[]) => {
  const resources: number[] = [];
  const camps: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const group = bySeed(seed).filter(run => styles.includes(run.style) && run.country[turn]);
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const diff = group[i].country[turn].map((value, k) => Math.abs(value - group[j].country[turn][k]));
      resources.push(diff.slice(0, RESOURCE_KEYS.length).reduce((sum, d) => sum + d, 0) / RESOURCE_KEYS.length);
      camps.push(diff.slice(RESOURCE_KEYS.length).reduce((sum, d) => sum + d, 0) / (diff.length - RESOURCE_KEYS.length));
    }
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  return `ресурсы ${median(resources).toFixed(1)}, лагеря ${median(camps).toFixed(1)}`;
};
const allStyles = [...Object.keys(STYLES), ...laneNames];
console.log(`Расхождение страны между стилями (медиана, пункты): после 10-го хода ${apart(10, allStyles)}; после 20-го ${apart(20, allStyles)}`);
console.log(`  между дорогами: после 10-го ${apart(10, laneNames)}; после 20-го ${apart(20, laneNames)}`);
console.log(`Сходство партий разных дорог на одном зерне: медиана ${Math.round(laneOverlap[Math.floor(laneOverlap.length / 2)] * 100)}% ходов`);
