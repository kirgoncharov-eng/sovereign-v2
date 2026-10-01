// Люди и союзы: личное отношение ключевых игроков живёт отдельно от их фракций,
// а с фракциями можно заключать временные пакты. Чистые функции без текста.
import { ACTIONS } from "./data.ts";
import type { ActionTag, Bloc, Faction, Figure, GameState, Pact, ResourceKey } from "./types.ts";

// ── Характер ─────────────────────────────────────────────────────────────────
// Человек оценивает решения по своему характеру, а не только по линии своей группы.
export type TraitId = "careerist" | "idealist" | "hawk" | "pragmatist" | "populist" | "apparatchik";
export const TRAITS: Record<TraitId, { label: string; like: ActionTag[]; dislike: ActionTag[] }> = {
  careerist:   { label: "карьерист",  like: ["elite_deal", "investment"],          dislike: ["anticorruption", "austerity"] },
  idealist:    { label: "идеалист",   like: ["anticorruption", "dialogue", "reform"], dislike: ["repress", "propaganda", "elite_deal"] },
  hawk:        { label: "ястреб",     like: ["security", "patriotism", "repress"], dislike: ["dialogue", "delay"] },
  pragmatist:  { label: "прагматик",  like: ["investment", "reform", "austerity"],  dislike: ["delay", "propaganda"] },
  populist:    { label: "популист",   like: ["social", "patriotism"],              dislike: ["austerity", "investment"] },
  apparatchik: { label: "аппаратчик", like: ["delay", "propaganda", "elite_deal"], dislike: ["reform", "anticorruption"] },
};
const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

// Тот же хэш, что в движке (FNV-1a); свой экземпляр, чтобы не было циклического импорта.
const hash = (...parts: (string | number)[]) => {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// Характер выводится из зерна партии и имени: преемник на том же посту — другой человек.
// Каждый второй — «белая ворона»: любит то, что его лагерь не выносит, и наоборот. Отсюда расхождения.
export function traitOf(seed: number, fig: Pick<Figure, "name">, bloc?: Bloc): TraitId {
  const h = hash(seed, "trait", fig.name);
  const rel = (tag: ActionTag) => (bloc ? ACTIONS[tag].rel[bloc] ?? 0 : 0);
  const against = (t: TraitId) => TRAITS[t].like.some(tag => rel(tag) < 0), across = (t: TraitId) => TRAITS[t].dislike.some(tag => rel(tag) > 0);
  const strict = bloc ? TRAIT_IDS.filter(t => against(t) && across(t)) : [];
  const odd = strict.length ? strict : bloc ? TRAIT_IDS.filter(t => against(t) || across(t)) : [];
  return h % 2 === 0 && odd.length ? odd[(h >>> 1) % odd.length] : TRAIT_IDS[(h >>> 1) % TRAIT_IDS.length];
}

// Доля изменения отношения фракции, которая передаётся её человеку.
export const FACTION_PASS = 0.25;
const PERSONAL_STEP = 7, PERSONAL_CAP = 10;

// Личная реакция на решение: нравится ли оно человеку как человеку.
export function personalDelta(seed: number, fig: Figure, bloc: Bloc | undefined, tags: ActionTag[], failed: boolean): number {
  const t = TRAITS[traitOf(seed, fig, bloc)];
  let d = 0;
  for (const tag of tags) {
    if (t.like.includes(tag)) d += failed ? PERSONAL_STEP / 2 : PERSONAL_STEP;
    if (t.dislike.includes(tag)) d -= PERSONAL_STEP;
  }
  return Math.max(-PERSONAL_CAP, Math.min(PERSONAL_CAP, Math.round(d)));
}

// ── Расхождение человека и группы ───────────────────────────────────────────
// insider — «свой человек» во враждебной группе, mole — «червоточина» в дружественной.
export type Bond = "insider" | "mole" | "ally" | "enemy" | null;
export const BOND = { personal: 30, faction: 15 };
export function bondOf(fig: Figure, fac: Faction | undefined): Bond {
  if (!fac) return null;
  if (fig.relation >= BOND.personal && fac.relation <= -BOND.faction) return "insider";
  if (fig.relation <= -BOND.personal && fac.relation >= BOND.faction) return "mole";
  if (fig.relation >= 30 && fac.relation >= 30) return "ally";
  if (fig.relation <= -30 && fac.relation <= -30) return "enemy";
  return null;
}
export const BOND_LABEL: Record<NonNullable<Bond>, string> = {
  insider: "свой человек", mole: "червоточина", ally: "опора", enemy: "открытый враг",
};

export const bondsIn = (state: Pick<GameState, "keyFigures" | "factions">, factionId: string, bond: Bond) =>
  state.keyFigures.filter(f => f.faction === factionId && bondOf(f, state.factions.find(x => x.id === factionId)) === bond);

// ── Пакты ────────────────────────────────────────────────────────────────────
export const MAX_PACTS = 2;
export const PACT_VOTE_BONUS = 25;        // союзная группа на выборах голосует теплее
export const PACT_SIGN = { faction: 10, figure: 8, against: -12 };
export const PACT_KEPT = { faction: 8, figure: 10 };
export const PACT_BROKEN = { faction: -25, figure: -30, others: -4 };

// Что группа даёт каждый ход, пока действует пакт.
export const PACT_INCOME: Record<Bloc, ResourceKey> = {
  security: "military", business: "economy", church: "internalLegitimacy", liberal: "internalLegitimacy",
  west: "externalReputation", russia: "economy", nationalist: "military", regional: "politicalCapital", ruling: "politicalCapital",
};
export const pactIncome = (p: Pick<Pact, "against">) => (p.against ? 3 : 2);

// Против кого группа охотно дружит.
export const RIVAL_BLOCS: Record<Bloc, Bloc[]> = {
  security: ["liberal"], liberal: ["security", "ruling"], west: ["russia"], russia: ["west"],
  business: ["regional", "liberal"], regional: ["ruling", "business"], church: ["liberal"],
  nationalist: ["russia", "regional"], ruling: ["liberal"],
};

// Обязательство: группа требует не делать того, что ей больнее всего.
// Церковь в каталоге действий ничего не теряет — её условия заданы явно.
const BAN_FALLBACK: Partial<Record<Bloc, ActionTag[]>> = { church: ["reform", "pro_west", "repress"] };
export function pactBans(bloc: Bloc, count: number): ActionTag[] {
  const hurt = (Object.keys(ACTIONS) as ActionTag[])
    .filter(t => t !== "delay" && (ACTIONS[t].rel[bloc] ?? 0) < 0)
    .sort((a, b) => (ACTIONS[a].rel[bloc] ?? 0) - (ACTIONS[b].rel[bloc] ?? 0));
  return [...new Set([...hurt, ...(BAN_FALLBACK[bloc] ?? [])])].slice(0, count);
}

// Каким действием скрепляют союз с группой — его цена в общем каталоге.
export const PACT_TAG: Record<Bloc, ActionTag> = {
  security: "security", business: "elite_deal", church: "patriotism", liberal: "dialogue", west: "pro_west",
  russia: "pro_russia", nationalist: "patriotism", regional: "elite_deal", ruling: "elite_deal",
};

// Пакты, которые решение нарушит.
export const breaches = (pacts: Pact[] | undefined, tags: ActionTag[]) =>
  (pacts ?? []).filter(p => p.ban.some(t => tags.includes(t)));
