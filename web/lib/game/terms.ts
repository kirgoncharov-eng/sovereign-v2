// «Вопрос о сроках»: какие пути остаться у власти открыты, какие выборы пройдут в конце срока
// и чем кончится выбранный путь. Модуль не зависит от движка: planTurn сам применяет результат.
import { CONSTITUTION, ELECTIONS } from "./data.ts";
import { PATHS, PATH_VERDICT_END } from "../content/terms.ts";
import type { Bloc, Deal, EndType, Faction, Figure, GameState, PathId, PowerPath, Resources, TermRule } from "./types.ts";

export const TERMS_TURN = 18;        // дело ложится на стол за полгода (два хода) до выборов
export const SUCCESSOR_REL = 30;     // преемником можно назначить только преданного человека — и он должен остаться преданным
export const DICTATOR_MILITARY = 45; // армия, на которую можно опереться
export const DICTATOR_FORCE = 20;    // силовики должны быть за вас
export const FORCE_HOSTILE = -30;    // враждебные силовики не введут ЧП и свергнут диктатора
export const POSTPONE_LEGIT = 20;    // ниже — улица не примет отмену выборов
export const DICTATOR_LEGIT = 12;    // ниже — не удержит и армия

export const termRule = (country: string): TermRule => CONSTITUTION[country] ?? "two_terms";

// Силовая опора: силовые структуры, а где их нет как отдельной группы — правящая партия, которой они подчинены.
export function forceRelation(factions: Faction[]): number {
  const sec = factions.filter(f => f.bloc === "security");
  const pool = sec.length ? sec : factions.filter(f => f.bloc === "ruling");
  return pool.length ? pool.reduce((s, f) => s + f.relation, 0) / pool.length : 0;
}
export const forceFaction = (factions: Faction[]) => factions.find(f => f.bloc === "security") ?? factions.find(f => f.bloc === "ruling");

// Кому можно передать власть: людям системы, а не послам, священникам и оппозиции.
const SUCCESSOR_ROLES = new Set(["parliament", "speaker", "interior", "kgb", "sbu", "security", "knb", "general", "prosecutor", "oligarch", "clan", "akim", "mayor", "shadow"]);
export function successorCandidate(state: Pick<GameState, "keyFigures" | "arc">): Figure | null {
  return state.keyFigures
    .filter(f => SUCCESSOR_ROLES.has(f.id) && f.name !== state.arc?.target && f.relation >= SUCCESSOR_REL)
    .sort((a, b) => b.relation - a.relation)[0] ?? null;
}

const parliamentWon = (state: Pick<GameState, "elections">) =>
  (state.elections ?? []).some(e => e.kind === "parliament" && e.outcome === "won");

export type Lock = "rule" | "lost" | "loyal" | "law" | "force" | "military";
export interface PathOption { id: PathId; lock: Lock | null; successor?: Figure; viaLaw?: boolean }

// Пути в порядке папки. Закрытый путь показывается с причиной — игрок видит, чего не хватило.
export function pathOptions(state: Pick<GameState, "country" | "keyFigures" | "arc" | "elections" | "laws" | "factions" | "resources" | "turn">): PathOption[] {
  const rule = termRule(state.country);
  const law = (id: string) => (state.laws ?? []).some(l => l.id === id && l.since <= state.turn + 1);
  const force = forceRelation(state.factions);
  const heir = successorCandidate(state);
  return [
    { id: "run", lock: rule === "no_limits" || rule === "two_terms" ? null : "rule" },
    { id: "zeroing", lock: rule === "single_term" ? null : "rule", viaLaw: !law("constitution") },
    { id: "rokirovka", lock: rule !== "parliamentary" ? "rule" : parliamentWon(state) ? null : "lost" },
    { id: "successor", lock: heir ? null : "loyal", ...(heir ? { successor: heir } : {}) },
    { id: "postpone", lock: !law("emergency_powers") ? "law" : force <= FORCE_HOSTILE ? "force" : null },
    { id: "dictatorship", lock: state.resources.military < DICTATOR_MILITARY ? "military" : force < DICTATOR_FORCE ? "force" : null },
    { id: "exit", lock: null },
  ];
}

// Цена самого решения: кто обрадуется, кто отвернётся. Отношения заданы по блокам.
type PathDeal = { res: Deal["res"]; rel: Partial<Record<Bloc, number>> };
export const PATH_DEALS: Record<PathId, PathDeal> = {
  run:          { res: { internalLegitimacy: 3 }, rel: { liberal: 3 } },
  exit:         { res: { internalLegitimacy: 6, externalReputation: 5, politicalCapital: -12 }, rel: { liberal: 10, west: 6, security: -10, business: -8, ruling: -10 } },
  zeroing:      { res: { internalLegitimacy: -6, externalReputation: -8 }, rel: { liberal: -15, west: -12, business: 6 } },
  rokirovka:    { res: { politicalCapital: 4, internalLegitimacy: -4 }, rel: { liberal: -8, business: 4 } },
  successor:    { res: { internalLegitimacy: -2, politicalCapital: 3 }, rel: {} },
  postpone:     { res: { internalLegitimacy: -10, externalReputation: -10, military: 3 }, rel: { security: 10, liberal: -15, west: -15 } },
  dictatorship: { res: { internalLegitimacy: -14, externalReputation: -16, military: 6, politicalCapital: 8 }, rel: { security: 15, ruling: 10, liberal: -30, west: -25, business: -8 } },
};

export function pathDeal(id: PathId, factions: Faction[], heir?: Figure): Deal {
  const d = PATH_DEALS[id];
  const factionRel: Record<string, number> = {};
  for (const f of factions) if (d.rel[f.bloc]) factionRel[f.id] = d.rel[f.bloc]!;
  if (heir) factionRel[heir.faction] = (factionRel[heir.faction] ?? 0) + 8;
  return { pure: true, res: d.res, factionRel, ...(heir ? { figure: heir.id, figureRel: 15 } : {}) };
}

// Какие выборы пройдут в конце срока: у тех, кто ушёл, отложил или взял власть силой, — никаких;
// у рокировки — парламентские.
export function electionKind(turn: number, path: PowerPath | null | undefined): "parliament" | "president" | null {
  const base = ELECTIONS[turn] ?? null;
  if (base !== "president" || !path) return base;
  if (path.id === "exit" || path.id === "postpone" || path.id === "dictatorship") return null;
  return path.id === "rokirovka" ? "parliament" : "president";
}

// Чем кончился путь, если лидер дожил до конца срока.
export function pathEnd(
  path: PowerPath, won: boolean,
  state: { factions: Faction[]; resources: Resources; keyFigures: Figure[] },
): EndType {
  switch (path.id) {
    case "run": return won ? "reelected" : "mandate";
    case "zeroing": return won ? "zeroed" : "mandate";
    case "rokirovka": return won ? "premier" : "mandate";
    case "successor": {
      if (!won) return "mandate";
      const heir = state.keyFigures.find(f => f.name === path.successor);
      return (heir?.relation ?? 0) >= SUCCESSOR_REL ? "leader_of_nation" : "betrayed";
    }
    case "exit": return "retired";
    case "postpone": return state.resources.internalLegitimacy < POSTPONE_LEGIT ? "revolution" : "emergency_rule";
    case "dictatorship":
      return forceRelation(state.factions) <= FORCE_HOSTILE ? "coup" : state.resources.internalLegitimacy < DICTATOR_LEGIT ? "revolution" : "dictator";
  }
}

// Падение после попытки удержать власть указом или силой.
export const fellTrying = (path: PowerPath | null | undefined, end: EndType | null) =>
  !!path && (path.id === "postpone" || path.id === "dictatorship") && (end === "coup" || end === "revolution");

// Как вердикт подытожит «вопрос о сроках».
export function pathVerdict(path: PowerPath | null | undefined, end: EndType | null): string {
  if (!path) return "";
  if (path.from) return "Обнулить сроки он попытался, но парламент не дал голосов — и пришлось уходить.";
  return PATH_VERDICT_END[`${path.id}:${end}`] ?? PATHS[path.id].verdict;
}

// Вес концовки: для вердикта и для очков «Дела дня».
export const END_BONUS: Partial<Record<EndType, number>> = {
  reelected: 300, zeroed: 250, premier: 250, leader_of_nation: 250, retired: 200, emergency_rule: 150, dictator: 150,
};
// Остался у власти, выиграв выборы: второй срок, обнуление, рокировка.
export const wonToStay = (e: EndType | null) => e === "reelected" || e === "zeroed" || e === "premier";
