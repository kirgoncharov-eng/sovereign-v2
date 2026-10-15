// Ночь выборов в кампании 1978 года (#147): результат, что страна запомнила из решений срока, законы и обещания.
// Прежние шесть стран — архив: у них остаётся общая строка о выборах из classic.ts.
import { ALTERNATE_EVENTS } from "../content/alternate-history.ts";
import { LAWS } from "../content/laws.ts";
import { PARTY_GENITIVE, TERM_FINALE, TERM_MEMORY } from "../content/term-finale.ts";
import { TERM, termIndex, termOrdinal } from "./data.ts";
import { plural } from "./engine.ts";
import type { Election, GameState } from "./types.ts";

const MAX_MEMORIES = 3;

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
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
    const line = memory && (entry.success === false ? memory.failed : memory.choices[entry.choice]);
    if (!card || !line) return [];
    seen.add(card.id);
    return [line];
  });
  // Первое дело срока, середина и последнее: начало, поворот и то, что свежо в памяти.
  if (lines.length <= MAX_MEMORIES) return lines;
  return [lines[0], lines[Math.floor(lines.length / 2)], lines[lines.length - 1]];
}

function lawsLine(state: GameState): string | null {
  const start = termIndex(state.turn) * TERM;
  const titles = (state.laws ?? [])
    .filter(law => law.since > start)
    .flatMap(law => LAWS.find(def => def.id === law.id)?.title ?? [])
    .map(title => `«${title}»`);
  if (!titles.length) return null;
  if (titles.length === 1) return put(TERM_FINALE.laws.one, { laws: titles[0] });
  return put(TERM_FINALE.laws.many, { count: plural(titles.length, "закон", "закона", "законов"), laws: titles.join(", ") });
}

function promisesLine(state: GameState): string | null {
  const promises = state.promises ?? [];
  if (!promises.length) return null;
  const kept = promises.filter(promise => promise.status === "kept").length;
  const broken = promises.filter(promise => promise.status === "broken").length;
  return put(broken ? TERM_FINALE.promises.broken : TERM_FINALE.promises.kept, { total: promises.length, kept, broken });
}

function marginLine(election: Election): string {
  const margin = election.leader - election.top.share;
  return margin <= 3 ? TERM_FINALE.margin.narrow : margin <= 10 ? TERM_FINALE.margin.clear : TERM_FINALE.margin.wide;
}

// Ночь выборов: результат — первым абзацем газеты, итог срока — после дела дня.
// nextTerm — номер срока, который начнётся после победы (0 — первый).
export function termFinale(state: GameState, election: Election, nextTerm: number): { result: string; summary: string[] } {
  const rival = PARTY_GENITIVE[election.top.name] ?? election.top.name;
  const slots = { pct: election.leader, rivalPct: election.top.share, rival };
  if (election.outcome !== "won") return { result: put(TERM_FINALE.lost, slots), summary: [] };
  const memories = termMemories(state);
  const summary = [
    TERM_FINALE.summary,
    ...(memories.length ? memories : [TERM_FINALE.noCases]),
    lawsLine(state),
    promisesLine(state),
  ].filter(Boolean).join(" ");
  return {
    result: `${put(TERM_FINALE.won, slots)} ${marginLine(election)}`,
    summary: [summary, put(TERM_FINALE.next, { ordinal: upper(termOrdinal(nextTerm)) })],
  };
}
