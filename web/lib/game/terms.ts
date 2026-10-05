// «Вопрос о сроках»: какие пути остаться у власти открыты, какие выборы пройдут в конце срока
// и чем кончится выбранный путь. Модуль не зависит от движка: planTurn сам применяет результат.
import { CONSTITUTION, ELECTIONS, TERM, localTurn, termIndex } from "./data.ts";
import { PATHS, PATH_VERDICT_END } from "../content/terms.ts";
import type { Bloc, Deal, EndType, Faction, Figure, GameState, Office, PathId, PowerPath, Reign, Resources, TermRule } from "./types.ts";

export const TERMS_TURN = 18;        // дело ложится на стол за полгода (два хода) до конца каждого срока
export const SUCCESSOR_REL = 30;     // преемником можно назначить только преданного человека — и он должен остаться преданным
export const DICTATOR_MILITARY = 45; // армия, на которую можно опереться
export const DICTATOR_FORCE = 20;    // силовики должны быть за вас
export const FORCE_HOSTILE = -30;    // враждебные силовики не введут ЧП и свергнут диктатора
export const POSTPONE_LEGIT = 20;    // ниже — улица не примет отмену выборов
export const DICTATOR_LEGIT = 12;    // ниже — не удержит и армия
export const RULER_STEP = 6;         // каждый следующий срок без выборов улица терпит хуже, а генералы — меньше

// Сколько президентских сроков даёт конституция.
export const TERM_LIMIT: Record<TermRule, number> = { no_limits: Infinity, two_terms: 2, single_term: 1, parliamentary: 1 };
export const firstReign = (): Reign => ({ term: 0, counted: 1, office: "president", ruled: 0, arcs: [], epilogues: [], past: [] });
export const reignOf = (state: Pick<GameState, "reign">): Reign => state.reign ?? firstReign();

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

// Парламент выигран в этом сроке: только тогда большинство назначит вас премьером.
const parliamentWon = (state: Pick<GameState, "elections" | "turn">) =>
  (state.elections ?? []).some(e => e.kind === "parliament" && e.outcome === "won" && termIndex(e.turn) === termIndex(state.turn + 1));

// «na» — путь не про вашу должность: его нет в папке и не о чем объяснять.
export type Lock = "rule" | "limit" | "lost" | "loyal" | "law" | "force" | "military" | "na";
export interface PathOption { id: PathId; lock: Lock | null; successor?: Figure; viaLaw?: boolean; keep?: boolean }

// Пути в порядке папки. Закрытый путь показывается с причиной — игрок видит, чего не хватило.
// Что открыто, зависит от конституции, от должности (президент, премьер, правитель без выборов) и от прошлых сроков.
export function pathOptions(state: Pick<GameState, "country" | "keyFigures" | "arc" | "elections" | "laws" | "factions" | "resources" | "turn" | "reign">): PathOption[] {
  const rule = termRule(state.country);
  const reign = reignOf(state);
  const law = (id: string) => (state.laws ?? []).some(l => l.id === id && l.since <= state.turn + 1);
  const force = forceRelation(state.factions);
  const heir = successorCandidate(state);
  const successor: PathOption = { id: "successor", lock: heir ? null : "loyal", ...(heir ? { successor: heir } : {}) };
  const exit: PathOption = { id: "exit", lock: null };
  // Правитель без выборов: продлить своё правление, вернуть выборы, передать власть или уйти.
  if (reign.office === "ruler") {
    const how = reign.how ?? "dictatorship";
    return [
      { id: "run", lock: null },
      { id: how, lock: null, keep: true },
      successor, exit,
    ];
  }
  const dictatorship: PathOption = { id: "dictatorship", lock: state.resources.military < DICTATOR_MILITARY ? "military" : force < DICTATOR_FORCE ? "force" : null };
  const postpone: PathOption = { id: "postpone", lock: !law("emergency_powers") ? "law" : force <= FORCE_HOSTILE ? "force" : null };
  // Премьер: удержать большинство на парламентских выборах — или те же силовые пути.
  if (reign.office === "premier") return [{ id: "run", lock: null }, successor, postpone, dictatorship, exit];
  const limit = TERM_LIMIT[rule], spent = reign.counted >= limit;
  return [
    { id: "run", lock: spent ? (reign.term === 0 ? "rule" : "limit") : null },
    { id: "zeroing", lock: rule === "no_limits" ? (reign.term === 0 ? "rule" : "na") : rule === "parliamentary" ? "rule" : spent ? null : "rule", viaLaw: !law("constitution") },
    { id: "rokirovka", lock: rule !== "parliamentary" ? (reign.term === 0 ? "rule" : "na") : parliamentWon(state) ? null : "lost" },
    successor, postpone, dictatorship, exit,
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

// Правитель без выборов: продлить правление дешевле, чем ввести его, а вернуть выборы — дорого для силовиков.
const RULER_DEALS: Partial<Record<PathId, PathDeal>> = {
  run:          { res: { internalLegitimacy: 8, externalReputation: 8, military: -3 }, rel: { liberal: 15, west: 12, security: -12, ruling: -8 } },
  dictatorship: { res: { internalLegitimacy: -6, externalReputation: -6, military: 3 }, rel: { security: 5, liberal: -10, west: -8 } },
  postpone:     { res: { internalLegitimacy: -5, externalReputation: -5 }, rel: { security: 4, liberal: -8, west: -8 } },
};
export function pathDeal(id: PathId, factions: Faction[], heir?: Figure, office: Office = "president"): Deal {
  const d = (office === "ruler" && RULER_DEALS[id]) || PATH_DEALS[id];
  const factionRel: Record<string, number> = {};
  for (const f of factions) if (d.rel[f.bloc]) factionRel[f.id] = d.rel[f.bloc]!;
  if (heir) factionRel[heir.faction] = (factionRel[heir.faction] ?? 0) + 8;
  return { pure: true, res: d.res, factionRel, ...(heir ? { figure: heir.id, figureRel: 15 } : {}) };
}

// Какие выборы пройдут на этом ходу. Внутри срока — парламентские посередине и главные в конце.
// У тех, кто ушёл, отложил или взял власть силой, выборов нет; у рокировки и у премьера — парламентские.
export function electionKind(turn: number, path: PowerPath | null | undefined, office: Office = "president"): "parliament" | "president" | null {
  const base = ELECTIONS[localTurn(turn)] ?? null;
  if (!base || office === "ruler" && !(base === "president" && path?.id === "run")) return null;
  // У премьера парламентские выборы одни — в конце срока: от них зависит его кресло.
  if (base === "parliament") return office === "premier" ? null : base;
  if (!path) return office === "premier" ? "parliament" : "president";
  if (path.id === "exit" || path.id === "postpone" || path.id === "dictatorship") return null;
  return path.id === "rokirovka" || path.id === "run" && office === "premier" ? "parliament" : "president";
}
export const isTermEnd = (turn: number) => localTurn(turn) === TERM;

// Чем кончился путь, если лидер дожил до конца срока.
export function pathEnd(
  path: PowerPath, won: boolean,
  state: { factions: Faction[]; resources: Resources; keyFigures: Figure[] },
  reign: Reign = firstReign(),
): EndType {
  // Каждый срок без выборов делает следующий опаснее: улица терпит хуже, генералы — меньше.
  const step = reign.ruled * RULER_STEP;
  switch (path.id) {
    case "run": return won ? (reign.office === "premier" ? "premier" : "reelected") : "mandate";
    case "zeroing": return won ? "zeroed" : "mandate";
    case "rokirovka": return won ? "premier" : "mandate";
    case "successor": {
      if (!won) return "mandate";
      const heir = state.keyFigures.find(f => f.name === path.successor);
      return (heir?.relation ?? 0) >= SUCCESSOR_REL ? "leader_of_nation" : "betrayed";
    }
    case "exit": return "retired";
    case "postpone": return state.resources.internalLegitimacy < POSTPONE_LEGIT + step ? "revolution" : "emergency_rule";
    case "dictatorship":
      return forceRelation(state.factions) <= FORCE_HOSTILE + step ? "coup" : state.resources.internalLegitimacy < DICTATOR_LEGIT + step ? "revolution" : "dictator";
  }
}

// Новый срок: как теперь держится власть и что засчитано конституцией.
export function nextReign(reign: Reign, outcome: EndType, path: PowerPath | null): Reign {
  const past = [...reign.past, ...(path ? [{ term: reign.term, path: path.id, outcome }] : [])];
  const base = { ...reign, term: reign.term + 1, past };
  if (outcome === "reelected") return { ...base, office: "president", counted: reign.office === "ruler" ? 1 : reign.counted + 1, how: undefined };
  if (outcome === "zeroed") return { ...base, office: "president", counted: 1, how: undefined };
  if (outcome === "premier") return { ...base, office: "premier", how: undefined };
  return { ...base, office: "ruler", ruled: reign.ruled + 1, how: outcome === "dictator" ? "dictatorship" : "postpone" };
}

// Падение после попытки удержать власть указом или силой — или правителя без выборов.
export const fellTrying = (path: PowerPath | null | undefined, end: EndType | null, reign?: Reign) =>
  (!!path && (path.id === "postpone" || path.id === "dictatorship") || reign?.office === "ruler") && (end === "coup" || end === "revolution");

// Как вердикт подытожит «вопрос о сроках».
export function pathVerdict(path: PowerPath | null | undefined, end: EndType | null): string {
  if (!path) return "";
  if (path.from) return "Обнулить сроки он попытался, но парламент не дал голосов — и пришлось уходить.";
  return PATH_VERDICT_END[`${path.id}:${end}`] ?? PATHS[path.id].verdict;
}

// Вес концовки: для вердикта и для очков «Дела дня».
export const END_BONUS: Partial<Record<EndType, number>> = {
  reelected: 300, zeroed: 250, premier: 250, leader_of_nation: 250, retired: 200, emergency_rule: 150, dictator: 150, died: 200,
};
// Остался у власти, выиграв выборы: второй срок, обнуление, рокировка.
export const wonToStay = (e: EndType | null) => e === "reelected" || e === "zeroed" || e === "premier";
