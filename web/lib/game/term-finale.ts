// Ночь выборов в кампании 1978 года (#147): результат, что страна запомнила из решений срока, законы и обещания.
// Прежние шесть стран — архив: у них остаётся общая строка о выборах из classic.ts.
import { ALTERNATE_EVENTS } from "../content/alternate-history.ts";
import { LAWS } from "../content/laws.ts";
import { PARTY_GENITIVE, TERM_FINALE, TERM_MEMORY } from "../content/term-finale.ts";
import { TERM, termIndex, termOrdinal } from "./data.ts";
import { plural } from "./engine.ts";
import type { Election, GameState, LawInForce, PromiseState } from "./types.ts";

// Законы и обещания после решения хода выборов: газета выходит наутро, когда это решение уже подписано.
export interface TermOutcome { laws: LawInForce[]; promises: PromiseState[] }

const MAX_MEMORIES = 3;

const put = (template: string, slots: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in slots ? String(slots[key]) : whole));

// Что страна запомнила из авторских дел срока — по одному на дело, в порядке, в котором их решали.
// Решение текущего хода не входит: о нём газета уже написала выше.
export function termMemories(state: GameState): string[] {
  const start = termIndex(state.turn) * TERM;
  const seen = new Set<string>();
  const lines = state.history.slice(start).flatMap(entry => {
    const card = ALTERNATE_EVENTS.find(event => event.title === entry.title);
    const memory = card && !seen.has(card.id) ? TERM_MEMORY[card.id] : undefined;
    const choice = memory?.[entry.choice];
    const line = choice && (entry.success === false ? choice.failed : choice.ok);
    if (!card || !line) return [];
    seen.add(card.id);
    return [line];
  });
  // Первое дело срока, середина и последнее: начало, поворот и то, что свежо в памяти.
  if (lines.length <= MAX_MEMORIES) return lines;
  return [lines[0], lines[Math.floor(lines.length / 2)], lines[lines.length - 1]];
}

function lawsLine(state: GameState, laws: LawInForce[]): string | null {
  const start = termIndex(state.turn) * TERM;
  const titles = laws
    .filter(law => law.since > start)
    .flatMap(law => LAWS.find(def => def.id === law.id)?.title ?? [])
    .map(title => `«${title}»`);
  if (!titles.length) return null;
  if (titles.length === 1) return put(TERM_FINALE.laws.one, { laws: titles[0] });
  return put(TERM_FINALE.laws.many, { count: plural(titles.length, "закон", "закона", "законов"), laws: titles.join(", ") });
}

function promisesLine(promises: PromiseState[]): string | null {
  if (!promises.length) return null;
  const lines = TERM_FINALE.promises;
  if (promises.length === 1) return lines.single[promises[0].status];
  const kept = promises.filter(promise => promise.status === "kept").length;
  const broken = promises.filter(promise => promise.status === "broken").length;
  const template = kept ? (broken ? lines.broken : lines.kept) : (broken ? lines.noneBroken : lines.none);
  return put(template, { total: promises.length, kept, broken });
}

function marginLine(election: Election): string {
  const margin = election.leader - election.top.share;
  return margin <= 3 ? TERM_FINALE.margin.narrow : margin <= 10 ? TERM_FINALE.margin.clear : TERM_FINALE.margin.wide;
}

// Ночь выборов: результат и итог срока — одним первым абзацем, чтобы игрок видел развязку без «Читать полностью»;
// начало следующего срока — после дела дня.
// nextTerm — номер срока, который начнётся после победы (0 — первый); outcome — законы и обещания после решения.
export function termFinale(state: GameState, election: Election, nextTerm: number, outcome: TermOutcome)
  : { lead: string; after: string[] } {
  const rival = PARTY_GENITIVE[election.top.name] ?? election.top.name;
  const slots = { pct: election.leader, rivalPct: election.top.share, rival };
  if (election.outcome !== "won") return { lead: put(TERM_FINALE.lost, slots), after: [] };
  const memories = termMemories(state);
  const summary = [
    TERM_FINALE.summary,
    ...(memories.length ? memories : [TERM_FINALE.noCases]),
    lawsLine(state, outcome.laws),
    promisesLine(outcome.promises),
  ].filter(Boolean).join(" ");
  return {
    lead: `${put(TERM_FINALE.won, slots)} ${marginLine(election)} ${summary}`,
    after: [put(TERM_FINALE.next, { ordinal: termOrdinal(nextTerm) })],
  };
}
