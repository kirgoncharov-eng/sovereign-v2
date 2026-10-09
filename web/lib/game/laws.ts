// Свод законов: что действует, что меняет каждый ход и что стало с законопроектом.
// Модуль не зависит от движка: возвращает перемены, а применяет их planTurn.
import { LAWS, type LawDef } from "../content/laws.ts";
import type { Faction, LawInForce, ResourceDelta, TurnReport } from "./types.ts";

export const lawDef = (id: string): LawDef | undefined => LAWS.find(l => l.id === id);

export function effectiveLaw(def: LawDef, law?: LawInForce) {
  if (def.id === 'pension_reform' && law?.transition) return {
    perTurn: { economy: 1 } as ResourceDelta,
    drift: { west: 1, regional: 1 } as Partial<Record<Faction['bloc'], number>>,
  };
  return { perTurn: def.perTurn, drift: def.drift };
}

export interface LawStep { laws: LawInForce[]; res: ResourceDelta; rel: Record<string, number>; news: TurnReport["law"] | null }

// Действующие законы работают каждый ход. Принятый сейчас начнёт работать со следующего хода,
// отменённый — перестаёт сразу. Законопроект проходит, только если решение исполнили (голоса нашлись).
export function stepLaws(
  laws: LawInForce[] | undefined, bill: { id: string; act: "enact" | "repeal" } | undefined, success: boolean,
  nextTurn: number, factions: Faction[], transition?: { figure: string; name: string },
): LawStep {
  let current = [...(laws ?? [])];
  let news: LawStep["news"] = null;
  if (bill && lawDef(bill.id)) {
    news = { id: bill.id, act: bill.act, passed: success };
    if (success && bill.act === "enact" && !current.some(l => l.id === bill.id)) current.push({ id: bill.id, since: nextTurn });
    if (success && bill.act === "repeal") current = current.filter(l => l.id !== bill.id);
  }
  if (transition && success) {
    const law = current.find(l => l.id === 'pension_reform');
    if (law && !law.transition) {
      current = current.map(l => l === law ? { ...l, transition: { ...transition, since: nextTurn } } : l);
      news = { id: law.id, act: 'amend', passed: true };
    }
  }
  const res: Record<string, number> = {}, rel: Record<string, number> = {};
  for (const l of current) {
    if (l.since >= nextTurn) continue; // только что принят
    const def = lawDef(l.id);
    if (!def) continue;
    const impact = effectiveLaw(def, l);
    for (const [k, v] of Object.entries(impact.perTurn)) res[k] = (res[k] ?? 0) + (v ?? 0);
    for (const f of factions) { const d = impact.drift?.[f.bloc]; if (d) rel[f.id] = (rel[f.id] ?? 0) + d; }
  }
  return { laws: current, res: res as ResourceDelta, rel, news };
}
