// Кадры: президент сам собирает окружение. Раз в год в резерве три кандидата из разных каналов —
// два «серьёзных» и один абсурдный (родня или человек со стороны). Назначение — замена: кандидат садится в кресло
// одного из советников, прежний уходит. Это кадровое решение квартала: стоит ресурсов и меняет отношения лагерей,
// а уволенный обижает свой лагерь — нелояльный уходит со скандалом.
import { ADVISOR_ROLES } from "./data.ts";
import { freshPersonName } from "./classic.ts";
import { hashSeed, isFemaleName, loyaltyOf, seededRandom } from "./engine.ts";
import { DESK_FROM } from "./desk-timing.ts";
import { campOf, isDisloyal } from "./advisors.ts";
import { ARCS } from "../content/arcs.ts";
import { DOSSIERS, DOSSIER_TEXT } from "../content/advisors.ts";
import { ABSURD, CHANNELS, DISMISSAL, FREAKS, RELATIVES, SERIOUS, STAFFING_TEXT, type Channel } from "../content/staffing.ts";
import type { Advisor, Bloc, GameState, ResourceDelta, ResourceKey } from "./types.ts";

export const POOL_SIZE = 3;
export const POOL_TURNS = 4; // резерв обновляется раз в год (четыре квартала)
const RESOURCE_FLOOR = 4;    // как у поручений: ресурс не опускается до падения власти

export interface Candidate {
  id: string;
  channel: Channel;
  seat: string;              // чьё кресло займёт: id советника
  name: string;
  skill: 1 | 2 | 3;
  loyalty: number;
  camp: Bloc | null;
  title: string;             // кто это: «Госслужба», «астролог»
  bio: string;
  cost: ResourceDelta;
  relation: Partial<Record<Bloc, number>>;
}

const pickFrom = <T,>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)];
function shuffled<T>(random: () => number, list: readonly T[]): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// Резерв этого года: детерминирован зерном партии и годом; уже назначенные из него убраны.
export function candidatePool(state: GameState): Candidate[] {
  const year = Math.floor(state.turn / POOL_TURNS);
  const random = seededRandom(hashSeed(state.seed, "staff-pool", year));
  const serious = shuffled(random, SERIOUS).slice(0, POOL_SIZE - 1);
  const channels: Channel[] = [...serious, pickFrom(random, ABSURD)];
  const seats = shuffled(random, ADVISOR_ROLES.map(role => role.id));
  const names: string[] = [];
  const pool = channels.map((channel, index) => {
    const def = CHANNELS[channel];
    const seat = seats[index % seats.length];
    // Советник по безопасности — мужчина: из советников выбирается «крот», тексты интриги в мужском роде.
    const name = freshPersonName(state, `staff-${year}-${index}`, seat === "security", names);
    names.push(name);
    const freak = channel === "freak" ? pickFrom(random, FREAKS) : null;
    const [low, high] = def.loyalty;
    const relative = pickFrom(random, isFemaleName(name) ? RELATIVES.female : RELATIVES.male);
    const bio = freak ? freak.bio : pickFrom(random, def.bios).replace("{rel}", relative);
    const camp = def.camp?.find(bloc => state.factions.some(faction => faction.bloc === bloc)) ?? null;
    return {
      id: `${year}:${index}`,
      channel, seat, name,
      skill: pickFrom(random, def.skills),
      loyalty: low + Math.floor(random() * (high - low + 1)),
      camp,
      title: freak ? freak.title : def.label,
      bio,
      cost: def.cost,
      relation: def.relation,
    };
  });
  const taken = new Set(state.staffing?.taken ?? []);
  return pool.filter(candidate => !taken.has(candidate.id));
}

// Резерв виден с того же хода, что и стол; в «Деле дня» и после финала его нет.
export const staffingOpen = (state: GameState) => !state.daily && !state.ended && state.turn >= DESK_FROM;

// Что уволенный оставит после себя: обида лагеря и тихий или громкий уход.
// С досье даже нелояльного увольняют тихо: ему есть что терять.
export function dismissalOf(state: GameState, advisor: Advisor) {
  const scandal = isDisloyal(advisor) && !advisor.dossier;
  const camp = campOf(state, advisor);
  const outcome = scandal ? DISMISSAL.scandal : DISMISSAL.quiet;
  return { scandal, camp, cost: outcome.cost, text: outcome.text.replace("{name}", advisor.name) };
}

const sumCosts = (...costs: ResourceDelta[]) => {
  const total: ResourceDelta = {};
  for (const cost of costs) for (const [key, value] of Object.entries(cost)) {
    total[key as ResourceKey] = (total[key as ResourceKey] ?? 0) + (value ?? 0);
  }
  return total;
};

// Почему назначить нельзя — или null, если можно.
export function staffingBlocked(state: GameState, candidate: Candidate | undefined): string | null {
  if (state.daily) return STAFFING_TEXT.daily;
  if (state.ended) return STAFFING_TEXT.ended;
  if (state.turn < DESK_FROM) return STAFFING_TEXT.early;
  if (!candidate) return STAFFING_TEXT.unknown;
  if (state.staffing?.taken.includes(candidate.id)) return STAFFING_TEXT.taken;
  if (state.staffing?.lastTurn === state.turn) return STAFFING_TEXT.quota;
  const current = state.advisors.find(advisor => advisor.id === candidate.seat);
  if (current && state.arc && !state.arc.epilogue && state.arc.target === current.name) {
    const arc = ARCS.find(entry => entry.id === state.arc!.id);
    return STAFFING_TEXT.arc.replace("{name}", current.name).replace("{arc}", arc?.title ?? "интрига");
  }
  const total = sumCosts(candidate.cost, current ? dismissalOf(state, current).cost : {});
  const short = Object.entries(total).some(([key, value]) => state.resources[key as ResourceKey] + (value ?? 0) <= RESOURCE_FLOOR);
  return short ? STAFFING_TEXT.reserve : null;
}

// Назначение: кандидат занимает кресло, прежний советник уходит. Бросает ошибку, если назначить нельзя.
export function hireAdvisor(state: GameState, candidateId: string): GameState {
  const candidate = candidatePool(state).find(entry => entry.id === candidateId);
  const blocked = staffingBlocked(state, candidate);
  if (blocked || !candidate) throw new Error(blocked ?? STAFFING_TEXT.unknown);
  const current = state.advisors.find(advisor => advisor.id === candidate.seat);
  const role = ADVISOR_ROLES.find(entry => entry.id === candidate.seat)!;
  const dismissal = current ? dismissalOf(state, current) : null;
  const cost = sumCosts(candidate.cost, dismissal?.cost ?? {});
  const resources = { ...state.resources };
  for (const [key, value] of Object.entries(cost)) {
    resources[key as ResourceKey] = Math.max(0, Math.min(100, resources[key as ResourceKey] + (value ?? 0)));
  }
  const factions = state.factions.map(faction => {
    const welcome = candidate.relation[faction.bloc] ?? 0;
    const grudge = dismissal?.camp?.id === faction.id ? DISMISSAL.campRelation : 0;
    if (!welcome && !grudge) return faction;
    return { ...faction, relation: Math.max(-100, Math.min(100, faction.relation + welcome + grudge)) };
  });
  const hired: Advisor = {
    id: role.id, role: role.role, emoji: role.emoji,
    name: candidate.name,
    skill: candidate.skill,
    loyalty: candidate.loyalty,
    record: { right: 0, wrong: 0 },
    origin: candidate.channel,
    title: candidate.title,
    camp: candidate.camp,
    bio: candidate.bio,
    since: state.turn,
  };
  const receipt = [
    CHANNELS[candidate.channel].receipt.replace("{name}", candidate.name).replace("{title}", candidate.title),
    dismissal?.text,
  ].filter(Boolean).join(" ");
  return {
    ...state,
    resources,
    factions,
    advisors: state.advisors.map(advisor => (advisor.id === candidate.seat ? hired : advisor)),
    former: current ? [...(state.former ?? []), current.name] : state.former,
    staffing: { lastTurn: state.turn, taken: [...(state.staffing?.taken ?? []), candidate.id], receipt },
  };
}

// ── Досье ───────────────────────────────────────────────────────────────────
// Силовики собирают досье на советника: это кадровое решение квартала, стоит денег и лояльности советника
// по безопасности. С досье советник сидит тихо: не сливает и не саботирует, уволить его можно без скандала.
// Один раз досье можно пустить в ход — напомнить о нём: лояльность растёт.
export const DOSSIER_COST: ResourceDelta = { economy: -2 };
export const DOSSIER_SECURITY_LOYALTY = -5;
export const DOSSIER_PRESS_LOYALTY = 20;

export type DossierAction = "collect" | "press";

export function dossierBlocked(state: GameState, advisorId: string, action: DossierAction): string | null {
  if (state.daily) return STAFFING_TEXT.daily;
  if (state.ended) return STAFFING_TEXT.ended;
  if (state.turn < DESK_FROM) return STAFFING_TEXT.early;
  const advisor = state.advisors.find(member => member.id === advisorId);
  if (!advisor) return STAFFING_TEXT.unknown;
  if (state.staffing?.lastTurn === state.turn) return STAFFING_TEXT.quota;
  if (action === "collect") {
    if (advisor.id === "security") return STAFFING_TEXT.dossierSelf;
    if (advisor.dossier) return STAFFING_TEXT.dossierExists;
    const short = Object.entries(DOSSIER_COST).some(([key, value]) => state.resources[key as ResourceKey] + (value ?? 0) <= RESOURCE_FLOOR);
    return short ? STAFFING_TEXT.reserve : null;
  }
  if (!advisor.dossier) return STAFFING_TEXT.dossierMissing;
  return advisor.dossier.used ? STAFFING_TEXT.dossierUsed : null;
}

export function applyDossier(state: GameState, advisorId: string, action: DossierAction): GameState {
  const blocked = dossierBlocked(state, advisorId, action);
  if (blocked) throw new Error(blocked);
  const target = state.advisors.find(member => member.id === advisorId)!;
  const staffing = (receipt: string) => ({ lastTurn: state.turn, taken: state.staffing?.taken ?? [], receipt });
  if (action === "press") {
    return {
      ...state,
      advisors: state.advisors.map(member => member.id !== advisorId ? member : {
        ...member, loyalty: Math.min(100, loyaltyOf(member) + DOSSIER_PRESS_LOYALTY), dossier: { ...member.dossier!, used: true },
      }),
      staffing: staffing(DOSSIER_TEXT.press.replace("{name}", target.name)),
    };
  }
  const fact = DOSSIERS[hashSeed(state.seed, "dossier", target.name) % DOSSIERS.length];
  const resources = { ...state.resources };
  for (const [key, value] of Object.entries(DOSSIER_COST)) resources[key as ResourceKey] += value ?? 0;
  return {
    ...state,
    resources,
    advisors: state.advisors.map(member => member.id === advisorId ? { ...member, dossier: { fact, turn: state.turn } }
      : member.id === "security" ? { ...member, loyalty: Math.max(0, loyaltyOf(member) + DOSSIER_SECURITY_LOYALTY) } : member),
    staffing: staffing(DOSSIER_TEXT.collect.replace("{name}", target.name).replace("{fact}", fact)),
  };
}
