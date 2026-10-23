// Замер к #251 «Меры при падении ресурса»: как бот доходит до конца первого срока 1978 года и почему проигрывает.
// Тот же бот, что в scripts/tree.ts. Сейчас — база «до»: мер ещё нет. Когда модель инициатив появится, здесь же добавятся
// стратегии «заранее / в последний момент / всегда» и сравнение с базой на тех же зёрнах.
// Печатает по сложностям и стилям: долю партий, доведённых до 20-го хода, исходы поражений, опору, которая упала,
// было ли предупреждение (опора ≤ 22) хотя бы за ход до поражения и сколько ходов партии проводят в красной зоне.
// Кроме стилей из bot.ts играет «наивный» игрок, который выбирает варианты, не глядя на цену.
// Запуск: node scripts/initiatives-balance.ts  (SEEDS=60 DIFFS=crisis node scripts/initiatives-balance.ts)
import { classicApi } from "../lib/game/classic.ts";
import { createInitialState, isSurvival, resolveTurn, seededRandom, startEvent } from "../lib/game/engine.ts";
import { ALTERNATE_COUNTRY } from "../lib/game/alternate-world.ts";
import { RESOURCE_KEYS } from "../lib/game/data.ts";
import type { Choice, DifficultyId, ResourceKey } from "../lib/game/types.ts";
import { botTurn, LANES, STYLES } from "./bot.ts";

const SEEDS = Number(process.env.SEEDS ?? 30);
const DIFFS = (process.env.DIFFS ?? "debut,coalition,crisis").split(",") as DifficultyId[];
const TERM_END = 20;
const WARNING = 22;
const NAIVE = "naive";

type Run = {
  diff: DifficultyId;
  style: string;
  seed: number;
  reached: boolean;
  turn: number;
  end: string | null;
  fallen: ResourceKey | null;
  firstWarning: number | null;
  lowTurns: number;
};

async function play(diff: DifficultyId, style: string, seed: number): Promise<Run> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, diff, "pragmatist", seed);
  let state = createInitialState(ALTERNATE_COUNTRY, diff, "pragmatist", intro, seededRandom(seed));
  let firstWarning: number | null = null;
  let lowTurns = 0;
  while (!state.ended && state.turn < TERM_END) {
    state = startEvent(state, await classicApi.event(state));
    // Предупреждение видно игроку до решения: ход, на котором какая-то опора уже ≤ 22.
    if (RESOURCE_KEYS.some(key => state.resources[key] <= WARNING)) {
      firstWarning ??= state.turn + 1;
      lowTurns++;
    }
    let choice: Choice;
    if (style === NAIVE) {
      // Игрок, который не читает цену: любой вариант с равной вероятностью (особые дела — как у остальных ботов).
      ({ state, choice } = botTurn(state, "random"));
      const options = state.currentEvent!.choices;
      if (!state.currentEvent!.budget && !state.currentEvent!.press && !state.currentEvent!.call && !state.currentEvent!.special) {
        choice = options[Math.floor(seededRandom(state.seed * 31 + state.turn)() * options.length)];
      }
    } else ({ state, choice } = botTurn(state, style));
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  // На 20-м ходу партия может закончиться выборами: переизбрание и уход по закону — не поражение.
  const reached = state.turn >= TERM_END && (!state.ended || isSurvival(state.endType));
  const lowest = RESOURCE_KEYS.reduce((min, key) => (state.resources[key] < state.resources[min] ? key : min), RESOURCE_KEYS[0]);
  return {
    diff, style, seed, reached, turn: state.turn, end: state.ended ? state.endType : null,
    fallen: reached ? null : lowest, firstWarning, lowTurns,
  };
}

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const tally = (values: (string | null)[]) => {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(", ") || "—";
};

const styles = [...Object.keys(STYLES), ...Object.keys(LANES), NAIVE];
const runs: Run[] = [];
for (const diff of DIFFS) for (const style of styles) for (let seed = 1; seed <= SEEDS; seed++) runs.push(await play(diff, style, seed));

console.log(`Кампания 1978, первый срок (до ${TERM_END}-го хода): ${SEEDS} зёрен × ${styles.length} стилей × ${DIFFS.join("/")}`);
console.log("Мер при падении ресурса нет — это база «до» для #251.\n");
for (const diff of DIFFS) {
  const own = runs.filter(run => run.diff === diff);
  const lost = own.filter(run => !run.reached);
  console.log(`«${diff}»: до ${TERM_END}-го хода ${percent(own.length - lost.length, own.length)} (${own.length - lost.length} из ${own.length})`);
  console.log(`  по стилям: ${styles.map(style => {
    const mine = own.filter(run => run.style === style);
    return `${style} ${percent(mine.filter(run => run.reached).length, mine.length)}`;
  }).join(" · ")}`);
  if (!lost.length) continue;
  const turns = lost.map(run => run.turn).sort((a, b) => a - b);
  console.log(`  поражений ${lost.length}: ход от ${turns[0]} до ${turns.at(-1)}, медиана ${turns[Math.floor(turns.length / 2)]}`);
  console.log(`  исход: ${tally(lost.map(run => run.end))}`);
  console.log(`  ниже всех к концу: ${tally(lost.map(run => run.fallen))}`);
  // Было ли когда отвечать: предупреждение хотя бы за ход до поражения, и сколько ходов игрок провёл с опорой ≤ 22.
  const warned = lost.filter(run => run.firstWarning !== null && run.firstWarning < run.turn);
  const lead = warned.map(run => run.turn - run.firstWarning!).sort((a, b) => a - b);
  const medianLead = lead[Math.floor(lead.length / 2)] ?? "—";
  console.log(`  с предупреждением заранее: ${percent(warned.length, lost.length)}; ходов от первого предупреждения до поражения — медиана ${medianLead}`);
}
// Бессилие, а не только поражения: сколько ходов партия провела с опорой ≤ 22, не имея своего способа ответить.
console.log("\nХоды с опорой ≤ 22 (сколько партий туда попали; медиана и максимум ходов в красной зоне среди них):");
for (const diff of DIFFS) {
  const own = runs.filter(run => run.diff === diff);
  const low = own.filter(run => run.lowTurns > 0).map(run => run.lowTurns).sort((a, b) => a - b);
  const naive = own.filter(run => run.style === NAIVE);
  console.log(`  «${diff}»: ${percent(low.length, own.length)}, медиана ${low[Math.floor(low.length / 2)] ?? 0}, максимум ${low.at(-1) ?? 0}` +
    ` · игрок без чтения цены: до ${TERM_END}-го хода ${percent(naive.filter(run => run.reached).length, naive.length)}`);
}
