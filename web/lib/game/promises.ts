// Обещания: какие предложить, как считать исполнение и что бывает за обман.
// Модуль не зависит от движка: возвращает перемены, а применяет их planTurn.
import { ACTIONS, RES_CONFIG } from "./data.ts";
import { PROMISES, PROMISE_BROKEN, PROMISE_KEPT, PROMISE_OFFER, PROMISE_PICK, type PromiseDef } from "../content/promises.ts";
import type { ActionTag, Faction, IdeologyId, PromiseNews, PromiseState, ResourceDelta, Resources } from "./types.ts";

export const promiseDef = (id: string): PromiseDef | undefined => PROMISES.find(p => p.id === id);

// Пять обещаний на выбор: три в духе курса и два чужих. Зависит только от зерна партии —
// у «Дела дня» набор общий для всех.
export function offeredPromises(seed: number, ideo: IdeologyId): { offered: string[]; suggested: string[] } {
  let a = seed >>> 0;
  const rnd = () => { a = (Math.imul(a ^ (a >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return a / 4294967296; };
  const shuffle = <T,>(xs: T[]) => xs.map(x => [rnd(), x] as const).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const own = shuffle(PROMISES.filter(p => p.ideo.includes(ideo)));
  const suggested: PromiseDef[] = [];
  for (const p of own) {
    // Не предлагать вместе противоречащие друг другу обещания: «никогда X» и «сделать X».
    const clash = suggested.some(q => conflicts(p, q));
    if (!clash && suggested.length < PROMISE_PICK) suggested.push(p);
  }
  const rest = shuffle(PROMISES.filter(p => !suggested.includes(p)));
  const offered = [...suggested, ...rest.slice(0, PROMISE_OFFER - suggested.length)];
  return { offered: offered.map(p => p.id), suggested: suggested.map(p => p.id) };
}

export function conflicts(a: PromiseDef, b: PromiseDef): boolean {
  const never = (p: PromiseDef) => (p.goal.kind === "never" ? p.goal.tags : []);
  const want = (p: PromiseDef) => (p.goal.kind === "tags" ? p.goal.tags : []);
  return never(a).some(t => want(b).includes(t)) || never(b).some(t => want(a).includes(t));
}

// Порог для обещаний о ресурсах считается от стартового уровня: на любой сложности нужен рост.
export const initPromises = (ids: string[], start: Resources): PromiseState[] =>
  ids.filter(id => promiseDef(id)).slice(0, PROMISE_PICK).map(id => {
    const g = promiseDef(id)!.goal;
    return { id, progress: 0, status: "open", ...(g.kind === "resource" ? { target: Math.min(95, start[g.key] + g.rise) } : {}) };
  });

// Что решение сделает с обещаниями — для подсказки под вариантом.
export function promiseImpact(promises: PromiseState[] | undefined, tags: ActionTag[]): { advances: string[]; breaks: string[] } {
  const advances: string[] = [], breaks: string[] = [];
  for (const p of promises ?? []) {
    const def = promiseDef(p.id);
    if (!def || p.status !== "open") continue;
    if (def.goal.kind === "tags" && def.goal.tags.some(t => tags.includes(t))) advances.push(def.title);
    if (def.goal.kind === "never" && def.goal.tags.some(t => tags.includes(t))) breaks.push(def.title);
  }
  return { advances, breaks };
}

export interface PromiseStep {
  promises: PromiseState[];
  res: ResourceDelta;
  rel: Record<string, number>;
  news: PromiseNews;
}

// Ход: исполненное решение продвигает обещание, запретное — нарушает его сразу (важен умысел,
// даже если решение сорвали), а в срок проверяются пороги и всё, что так и не исполнено.
export function stepPromises(
  promises: PromiseState[] | undefined, tags: ActionTag[], success: boolean, turn: number,
  resources: Resources, factions: Faction[],
): PromiseStep {
  const res: Record<string, number> = {}, rel: Record<string, number> = {};
  const news: PromiseNews = { kept: [], broken: [], advanced: [] };
  const settle = (p: PromiseState, def: PromiseDef, kept: boolean): PromiseState => {
    const fx = kept ? PROMISE_KEPT : PROMISE_BROKEN;
    for (const [k, v] of Object.entries(fx.res)) res[k] = (res[k] ?? 0) + v;
    for (const f of factions) if (f.bloc === def.bloc) rel[f.id] = (rel[f.id] ?? 0) + fx.rel;
    (kept ? news.kept : news.broken).push(def.title);
    return { ...p, status: kept ? "kept" : "broken", turn };
  };
  const out = (promises ?? []).map(p => {
    const def = promiseDef(p.id);
    if (!def || p.status !== "open") return p;
    const g = def.goal;
    if (g.kind === "never" && g.tags.some(t => tags.includes(t))) return settle(p, def, false);
    let next = p;
    if (g.kind === "tags" && success && g.tags.some(t => tags.includes(t))) {
      next = { ...p, progress: p.progress + 1 };
      if (next.progress >= g.count) return settle(next, def, true);
      news.advanced.push(def.title);
    }
    if (turn >= def.due) {
      if (g.kind === "never") return settle(next, def, true);
      if (g.kind === "resource") return settle(next, def, resources[g.key] >= (p.target ?? 0));
      return settle(next, def, false);
    }
    return next;
  });
  return { promises: out, res: res as ResourceDelta, rel, news };
}

// Условие обещания одной строкой: для анкеты и досье.
export function promiseGoalText(def: PromiseDef, target?: number): string {
  const g = def.goal;
  const by = def.due === 10 ? "к парламентским выборам (10-й ход)" : "до конца срока";
  const labels = (tags: ActionTag[]) => tags.map(t => `«${ACTIONS[t].label}»`).join(" или ");
  if (g.kind === "tags") return `${g.count} исполненных решения ${labels(g.tags)} ${by}`;
  if (g.kind === "never") return `ни одного решения ${labels(g.tags)} ${by}`;
  const r = RES_CONFIG.find(c => c.key === g.key)!;
  return `${r.prompt.toLowerCase()} выше стартовой на ${g.rise}${target ? ` (нужно ${target})` : ""} ${by}`;
}

export const promisesKept = (promises: PromiseState[] | undefined) => (promises ?? []).filter(p => p.status === "kept").length;
export const promisesBroken = (promises: PromiseState[] | undefined) => (promises ?? []).filter(p => p.status === "broken").length;
