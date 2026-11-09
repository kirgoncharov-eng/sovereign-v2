// Замер первого срока кампании 1978 года (#403): кто доживает до хода 20, отчего падают, что дают выборы и срыв.
// Два бота на настоящих делах через те же функции, что хроника (`lib/client/chronicle.ts`):
//   random  — подписывает вариант наугад (зерно партии задаёт и его выбор);
//   careful — выбирает вариант с наибольшей самой слабой опорой после хода, если решение исполнят.
// Варианты движка проверяются без правки кода, подменой на время прогона:
//   base     — как в main;
//   delayed  — версии и региональные дела с `stance` сохраняют отложенные последствия по тегам (находка 1);
//   breath   — победа на парламентских выборах даёт ещё и личный ресурс +4 (находка 3).
// Запуск: node scripts/first-term-balance.ts  (N=60 — больше зёрен; VARIANTS=base,delayed — часть вариантов)
import { newTerm, nextCase, signChoice, startFromSeed } from '../lib/client/chronicle.ts';
import { DELAYED, ELECTION_WIN_BONUS, LIMITS, RESOURCE_KEYS, TERM } from '../lib/game/data.ts';
import { planTurn, seededRandom } from '../lib/game/engine.ts';
import type { Choice, DifficultyId, GameState, ResourceKey } from '../lib/game/types.ts';

const N = Number(process.env.N ?? 30);
const VARIANTS = (process.env.VARIANTS ?? 'base,delayed,breath').split(',');
const DIFFS: DifficultyId[] = ['debut', 'coalition', 'crisis'];
const MIDTERM = TERM / 2;
// Конец срока на ходу 20 (выборы, уход, обнуление) — срок дожит; эти концы — падение.
const FATAL = ['collapse', 'revolution', 'coup', 'impeachment', 'died'];

type Bot = (state: GameState, choices: Choice[], random: () => number) => Choice;
const weakest = (state: GameState, choice: Choice) =>
  Math.min(...RESOURCE_KEYS.map(key => planTurn(state, choice.id, { assumeSuccess: true }).resources[key]));
const BOTS: Record<string, Bot> = {
  random: (_state, choices, random) => choices[Math.floor(random() * choices.length)],
  careful: (state, choices) => choices.reduce((best, choice) => (weakest(state, choice) > weakest(state, best) ? choice : best)),
};

// Отложенные последствия по тегам пропадают у варианта с `stance` без `tagDelayed` (engine.ts, delayedFor).
const losesDelayed = (choice: Choice) => !!choice.stance && !choice.tagDelayed && !choice.deal && !choice.arc
  && choice.tags.some(tag => DELAYED[tag]);

function patch(variant: string, state: GameState): GameState {
  if (variant !== 'delayed' || !state.currentEvent?.card) return state;
  const choices = state.currentEvent.choices.map(choice => (losesDelayed(choice) ? { ...choice, tagDelayed: true } : choice));
  return { ...state, currentEvent: { ...state.currentEvent, choices } };
}

interface Run {
  survived: boolean; turn: number; end: string; midterm?: { won: boolean; personalAfter: number }; personalEnd: number;
  failed: number; failedWithGain: number; lostDelayed: number; fellAfterMidterm: boolean;
  economy: Record<string, number>; // откуда за срок пришла и ушла экономика: источник → сумма
}

// Причина падения: тип конца и, для обвала, какая опора дошла до края.
function endOf(state: GameState): string {
  if (state.endType !== 'collapse') return state.endType ?? 'жив';
  const low = RESOURCE_KEYS.filter(key => state.resources[key] <= LIMITS.endResource);
  return `collapse:${low.join('+')}`;
}

async function play(variant: string, bot: Bot, diff: DifficultyId, seed: number): Promise<Run> {
  const random = seededRandom(seed * 7 + 1);
  let state = patch(variant, await nextCase(await newTerm(startFromSeed(seed, diff))));
  const run: Run = { survived: false, turn: 0, end: '', personalEnd: 0, failed: 0, failedWithGain: 0, lostDelayed: 0, fellAfterMidterm: false,
    economy: {} };
  while (!state.ended && state.turn < TERM) {
    const choice = bot(state, state.currentEvent!.choices, random);
    if (state.currentEvent?.card && losesDelayed(choice)) run.lostDelayed++;
    state = await signChoice(state, choice.id);
    const report = state.lastTurn;
    if (report && !report.success) {
      run.failed++;
      const decision = Object.values(report.sources ?? {}).flatMap(parts => parts!.filter(([label]) => label === 'решение'));
      if (decision.some(([, value]) => value > 0)) run.failedWithGain++;
    }
    for (const [label, value] of report?.sources?.economy ?? []) {
      const source = label.startsWith('кризис') ? 'кризисы' : label;
      run.economy[source] = (run.economy[source] ?? 0) + value;
    }
    if (report?.election?.kind === 'parliament') {
      run.midterm = { won: report.election.outcome === 'won', personalAfter: state.resources.personalResource };
    }
    if (!state.ended) state = patch(variant, await nextCase(state));
  }
  run.turn = state.turn;
  run.personalEnd = state.resources.personalResource;
  run.survived = state.turn >= TERM && !FATAL.includes(state.endType ?? '');
  run.end = run.survived ? 'жив' : endOf(state);
  run.fellAfterMidterm = !run.survived && state.turn > MIDTERM;
  return run;
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const tally = (items: string[]) => Object.entries(items.reduce<Record<string, number>>((all, item) => ({ ...all, [item]: (all[item] ?? 0) + 1 }), {}))
  .sort((a, b) => b[1] - a[1]).map(([item, count]) => `${item} ${count}`).join(', ');

// Источники экономики: сумма за партию, в среднем на зерно; мелочь меньше единицы — в «прочее».
function economyLine(runs: Run[]): string {
  const total: Record<string, number> = {};
  for (const run of runs) for (const [source, value] of Object.entries(run.economy)) total[source] = (total[source] ?? 0) + value / runs.length;
  const big = Object.entries(total).filter(([, value]) => Math.abs(value) >= 1).sort((a, b) => a[1] - b[1]);
  const rest = Object.entries(total).filter(([, value]) => Math.abs(value) < 1).reduce((sum, [, value]) => sum + value, 0);
  const round = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 10) / 10}`;
  return [...big.map(([source, value]) => `${source} ${round(value)}`), `прочее ${round(rest)}`].join(' · ');
}
const economyRows: string[] = [];
const start: Partial<Record<DifficultyId, number>> = {};
for (const diff of DIFFS) start[diff] = (await newTerm(startFromSeed(1, diff))).resources.economy;

const winBonus = { ...ELECTION_WIN_BONUS };
for (const variant of VARIANTS) {
  for (const key of Object.keys(ELECTION_WIN_BONUS) as ResourceKey[]) delete ELECTION_WIN_BONUS[key];
  Object.assign(ELECTION_WIN_BONUS, winBonus, variant === 'breath' ? { personalResource: 4 } : {});
  console.log(`\n## ${variant} · ${N} зёрен · ход ${TERM} = конец первого срока`);
  console.log('| бот | сложность | дожили до 20 | пали до 10 | пали после выборов 10 | чем кончилось | выборы 10: победа · личный после выборов → в конце | срывы с выгодой | потеряно отложенных |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [name, bot] of Object.entries(BOTS)) for (const diff of DIFFS) {
    const runs: Run[] = [];
    for (let seed = 1; seed <= N; seed++) runs.push(await play(variant, bot, diff, seed));
    const survived = runs.filter(run => run.survived).length;
    const early = runs.filter(run => !run.survived && run.turn < MIDTERM).length;
    const late = runs.filter(run => run.fellAfterMidterm).length;
    const midterms = runs.flatMap(run => run.midterm ?? []);
    const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);
    const failed = runs.reduce((sum, run) => sum + run.failed, 0), gained = runs.reduce((sum, run) => sum + run.failedWithGain, 0);
    console.log(`| ${name} | ${diff} | ${survived}/${N} | ${early} | ${late} | ${tally(runs.filter(run => !run.survived).map(run => run.end)) || '—'} | `
      + `${midterms.filter(m => m.won).length}/${midterms.length} · ${mean(midterms.map(m => m.personalAfter))}→${mean(runs.filter(run => run.midterm).map(run => run.personalEnd))} | `
      + `${gained}/${failed} (${pct(gained, failed)}) | ${runs.reduce((sum, run) => sum + run.lostDelayed, 0)} |`);
    if (variant === 'base') economyRows.push(`${name} · ${diff} · старт ${start[diff]}: ${economyLine(runs)}`);
  }
  if (economyRows.length) console.log(`\nЭкономика за партию, в среднем на зерно (крупные источники):\n${economyRows.map(row => `- ${row}`).join('\n')}`);
  economyRows.length = 0;
}
Object.assign(ELECTION_WIN_BONUS, winBonus);
