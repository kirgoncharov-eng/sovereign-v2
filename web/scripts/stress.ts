// Нагрузочный прогон движка: много партий по всем странам и сложностям случайными решениями.
// Ищет то, что тесты на отдельных делах не ловят: падения, незаполненные слоты в тексте,
// женский антагонист в мужском тексте, повторы фраз внутри одной партии.
//
//   node scripts/stress.ts            (120 партий)
//   N=400 node scripts/stress.ts
//
// Код выхода 1 — были падения или пустые слоты. Остальное — отчёт для чтения.
import { budgetChoice, callChoice, classicApi, pressChoice } from "../lib/game/classic.ts";
import { createInitialState, isFemaleName, resolveTurn, seededRandom, startEvent } from "../lib/game/engine.ts";
import { COUNTRIES } from "../lib/game/data.ts";
import { CALL_ENDINGS, type Approach } from "../lib/content/calls.ts";
import type { DifficultyId, GameState } from "../lib/game/types.ts";

const N = Number(process.env.N ?? 120);
const COUNTRY_LIST = Object.keys(COUNTRIES);
const DIFFS: DifficultyId[] = ["debut", "coalition", "crisis"];
const APPROACHES: Approach[] = ["offer", "principle", "pressure", "numbers"];
const SLOT = /\{[a-zA-Z_:]+(\|[^}]*)?\}/g;

const findings: Record<string, string[]> = { crash: [], slot: [], antagonist: [] };
const repeated = new Map<string, number>();
let turns = 0, longest = 0;
const lengths: number[] = [];

const note = (kind: string, text: string) => { if (findings[kind].length < 20) findings[kind].push(text); };
const pickOf = <T,>(rand: () => number, list: readonly T[]) => list[Math.floor(rand() * list.length)];

// Особые дела проходят через свои формы — собираем итоговый выбор так же, как интерфейс.
function decide(state: GameState, rand: () => number): { state: GameState; id: string } {
  const ev = state.currentEvent!;
  const replace = (choice: ReturnType<typeof pressChoice>) => ({
    state: { ...state, currentEvent: { ...ev, choices: [choice, ev.choices[1]] } }, id: "p",
  });
  if (ev.press) return replace(pressChoice(state, [0, 1, 2].map(() => Math.floor(rand() * 3))));
  if (ev.call && !ev.call.negotiation) return replace(callChoice(state, pickOf(rand, APPROACHES), pickOf(rand, CALL_ENDINGS).id));
  if (ev.budget) return replace(budgetChoice(state, { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, rand() < 0.5));
  return { state, id: pickOf(rand, ev.choices).id };
}

for (let game = 0; game < N; game++) {
  const seed = 1000 + game, country = COUNTRY_LIST[game % COUNTRY_LIST.length], diff = DIFFS[game % DIFFS.length];
  const rand = seededRandom(seed * 7);
  const where = (s: GameState) => `${country}#${seed} ход ${s.turn}`;
  const sentences = new Map<string, number>();
  let s = createInitialState(country, diff, "pragmatist", await classicApi.setup(country, diff, "pragmatist", seed), rand);
  try {
    while (!s.ended) {
      const ev = await classicApi.event(s);
      s = startEvent(s, ev);
      const decision = decide(s, rand);
      const consequence = await classicApi.consequence(decision.state, decision.id);
      s = resolveTurn(decision.state, decision.id, consequence);
      turns++;
      const report = s.lastTurn!;
      const text = [ev.title, ev.description, ...ev.choices.map(c => `${c.text} ${c.hint}`), report.headline, report.narrative, ...report.reactions].join("\n");
      for (const m of text.matchAll(SLOT)) note("slot", `${where(s)}: ${m[0]}`);
      for (const sentence of report.narrative.split(/(?<=[.!?»])\s+/)) if (sentence.length > 50) sentences.set(sentence, (sentences.get(sentence) ?? 0) + 1);
    }
  } catch (e) {
    note("crash", `${where(s)}: ${(e as Error).message}`);
  }
  if (s.arc && isFemaleName(s.arc.target)) note("antagonist", `${country}#${seed}: ${s.arc.target}`);
  lengths.push(s.turn);
  longest = Math.max(longest, s.turn);
  for (const [sentence, count] of sentences) if (count > 1) repeated.set(sentence.slice(0, 100), (repeated.get(sentence.slice(0, 100)) ?? 0) + 1);
}

const median = [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length / 2)];
console.log(`Партий: ${N}, ходов: ${turns}, медиана ${median} ходов, самая долгая ${longest}`);
for (const [kind, list] of Object.entries(findings)) {
  console.log(`\n${kind}: ${list.length}${list.length >= 20 ? "+" : ""}`);
  for (const line of list) console.log(`  ${line}`);
}
console.log("\nФразы, которые повторяются внутри одной партии (в скольких партиях):");
for (const [sentence, games] of [...repeated].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${games}  ${sentence}`);
process.exit(findings.crash.length || findings.slot.length ? 1 : 0);
