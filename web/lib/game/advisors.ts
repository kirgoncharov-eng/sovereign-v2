// Карточка советника: всё, что президент может быстро проверить о человеке из своего окружения.
import { hashSeed, loyaltyOf } from "./engine.ts";
import { ADVISOR_AREA, ADVISOR_BIOS, ADVISOR_BLOC, ADVISOR_CAMP_BY_NAME, LOYALTY_WORDS, MANNER_LABEL, NEWS_REASON, SKILL_WORDS } from "../content/advisors.ts";
import { MANNERS, type Manner } from "../content/forecasts.ts";
import type { Advisor, AdvisorNews, Faction, GameState } from "./types.ts";

// Ниже этой лояльности советник служит уже не вам, а своему лагерю: и спорит в его пользу.
export const DISLOYAL_BELOW = 35;
export const isDisloyal = (advisor: Advisor) => loyaltyOf(advisor) < DISLOYAL_BELOW;

// Манера постоянна для человека: решает имя.
export const mannerOf = (advisor: Pick<Advisor, "name">): Manner => MANNERS[hashSeed(advisor.name, "manner") % MANNERS.length];

// Лагерь, к которому советник тянется по службе: первый, что есть в стране; дипломат выбирает между внешними по имени.
export function campOf(gs: Pick<GameState, "factions">, advisor: Advisor): Faction | null {
  const present = (ADVISOR_BLOC[advisor.id] ?? []).flatMap(bloc => gs.factions.find(f => f.bloc === bloc) ?? []);
  if (!present.length) return null;
  return ADVISOR_CAMP_BY_NAME.includes(advisor.id) ? present[hashSeed(advisor.name, "camp") % present.length] : present[0];
}

export interface AdvisorProfile {
  area: string | null;     // в чём советник силён
  skill: string;           // «умение крепкое»
  loyalty: number;
  loyaltyWord: string;
  camp: { name: string; relation: number } | null; // лагерь, к которому советник близок, и его отношение к вам
  record: { right: number; total: number };
  bio: string | null;
  manner: string;          // как лукавит
  disloyal: boolean;       // служит уже своему лагерю, а не вам
}

export const loyaltyWord = (loyalty: number) => LOYALTY_WORDS.find(([from]) => loyalty >= from)![1];

export function advisorProfile(gs: Pick<GameState, "factions">, advisor: Advisor): AdvisorProfile {
  const camp = campOf(gs, advisor);
  const bios = ADVISOR_BIOS[advisor.id];
  const loyalty = loyaltyOf(advisor);
  const record = advisor.record ?? { right: 0, wrong: 0 };
  return {
    area: ADVISOR_AREA[advisor.id] ?? null,
    skill: SKILL_WORDS[advisor.skill],
    loyalty,
    loyaltyWord: loyaltyWord(loyalty),
    camp: camp ? { name: camp.name, relation: camp.relation } : null,
    record: { right: record.right, total: record.right + record.wrong },
    bio: bios ? bios[hashSeed(advisor.name, advisor.id, "bio") % bios.length] : null,
    manner: MANNER_LABEL[mannerOf(advisor)],
    disloyal: loyalty < DISLOYAL_BELOW,
  };
}

// Строка газеты о перемене лояльности: «Наталья Савчук — лояльность +3: вы последовали совету».
export function newsLine(advisors: Advisor[], news: AdvisorNews): string | null {
  const advisor = advisors.find(a => a.id === news.id);
  if (!advisor || !news.reason || !news.loyalty) return null;
  const sign = news.loyalty > 0 ? `+${news.loyalty}` : `−${-news.loyalty}`;
  return `${advisor.name} — лояльность ${sign}: ${NEWS_REASON[news.reason]}.`;
}
