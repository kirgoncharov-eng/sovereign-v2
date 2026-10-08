// Сервер воспроизводит авторские дела и считает итог сам. Из клиента приходят только решения.
import { budgetChoice, budgetLimit, callChoice, classicApi, pressChoice } from "./classic.ts";
import { BIOGRAPHIES } from "./data.ts";
import { dailyCaseForDate } from "./daily.ts";
import { conveneCouncil, createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { initPromises, offeredPromises } from "./promises.ts";
import { isObj } from "./sanitize.ts";
import { BUDGET_ITEMS, BUDGET_MAX } from "../content/budget.ts";
import { APPROACHES, CALL_ENDINGS } from "../content/calls.ts";
import type { DailyMove, GameState } from "./types.ts";

export const MAX_DAILY_MOVES = 400;

export async function createDailyState(date: string): Promise<GameState> {
  const d = dailyCaseForDate(date);
  const bio = BIOGRAPHIES[d.seed % BIOGRAPHIES.length];
  const intro = await classicApi.setup(d.country, d.diff, d.ideo, d.seed);
  const s = createInitialState(d.country, d.diff, d.ideo,
    { ...intro, leader: { ...intro.leader, bio: bio.text } }, seededRandom(d.seed), "classic", bio.id);
  return { ...s, daily: date, dailyMoves: [], promises: initPromises(offeredPromises(s.seed, s.ideo).suggested, s.resources) };
}

export function validDailyMoves(raw: unknown): raw is DailyMove[] {
  return Array.isArray(raw) && raw.length <= MAX_DAILY_MOVES && raw.every(m => {
    if (!isObj(m) || typeof m.id !== "string" || m.id.length > 30) return false;
    if (m.council !== undefined && typeof m.council !== "boolean") return false;
    if (m.marked !== undefined && (!Number.isInteger(m.marked) || Number(m.marked) < 0 || Number(m.marked) > 5)) return false;
    if (m.press !== undefined && (!Array.isArray(m.press) || m.press.length !== 3 || !m.press.every(p => Number.isInteger(p) && p >= -1 && p <= 2))) return false;
    if (m.budget !== undefined) {
      if (!isObj(m.budget) || !isObj(m.budget.alloc) || typeof m.budget.debt !== "boolean") return false;
      const alloc = m.budget.alloc;
      if (Object.keys(alloc).length !== BUDGET_ITEMS.length || !BUDGET_ITEMS.every(i => Number.isInteger(alloc[i.id]) && Number(alloc[i.id]) >= 0 && Number(alloc[i.id]) <= BUDGET_MAX)) return false;
      if (Object.values(alloc).reduce<number>((sum, n) => sum + Number(n), 0) !== budgetLimit(m.budget.debt)) return false;
    }
    if (m.call !== undefined) {
      const call = m.call;
      if (!isObj(call) || !APPROACHES.some(a => a.id === call.approach) || !CALL_ENDINGS.some(e => e.id === call.ending)) return false;
    }
    return [m.press, m.budget, m.call].filter(x => x !== undefined).length <= 1;
  });
}

export async function applyDailyMove(state: GameState, move: DailyMove): Promise<GameState> {
  if (state.ended) throw new Error("Партия уже завершена");
  let s = state.currentEvent ? state : startEvent(state, await classicApi.event(state));
  const event = s.currentEvent!;
  if (move.council) {
    if (s.councilCharges <= 0 || event.beat || event.special) throw new Error("Совет недоступен");
    s = conveneCouncil(s, await classicApi.council(s));
  }
  let id = move.id;
  if (event.doc && event.choices.some(c=>c.id==='d') && move.marked !== undefined) {
    if (!event.doc || !["c", "d"].includes(id)) throw new Error("Нет доклада");
    id = move.marked === event.doc.key ? "c" : "d";
    if (id !== move.id) throw new Error("Неверный исход проверки доклада");
  } else if (event.doc && event.choices.some(c=>c.id==='d') && ["c", "d"].includes(id)) throw new Error("Не выбрана строка доклада");
  const final = move.press ? event.press ? pressChoice(s, move.press) : null
    : move.budget ? event.budget ? budgetChoice(s, move.budget.alloc, move.budget.debt) : null
    : move.call ? event.call ? callChoice(s, move.call.approach, move.call.ending) : null : undefined;
  if (final === null) throw new Error("Решение не соответствует делу");
  if (final) {
    if (id !== final.id) throw new Error("Неверный вариант решения");
    s = { ...s, currentEvent: { ...s.currentEvent!, choices: [final, event.choices[1]] } };
  }
  // У динамических дел первый вариант должен быть собран из реальных ответов игрока.
  if ((event.press || event.budget || event.call) && id !== event.choices[1].id && !final) throw new Error("Нет ответов по делу");
  return resolveTurn(s, id, await classicApi.consequence(s, id));
}

export async function replayDaily(date: string, raw: unknown): Promise<GameState> {
  if (!validDailyMoves(raw) || !raw.length) throw new Error("Нет корректной истории решений");
  let s = await createDailyState(date);
  for (const move of raw) s = await applyDailyMove(s, move);
  if (!s.ended) throw new Error("Партия не завершена");
  return s;
}
