// Люди вместо стрелок: под делом спорят два советника с противоположными интересами.
// Кто спорит, зависит от дела: о деньгах и силе — экономист и силовик, о внешних делах — дипломат и силовик,
// об улице и прессе — политтехнолог и экономист. В своей области лояльный советник говорит правду,
// о прочем — тянет в свою сторону, каждый в своей манере. Нелояльный служит своему лагерю и лжёт даже в своей области.
// Кто был прав, видно после хода: газета сверяет прогнозы с ведомостью.
import { ACTIONS } from "./data.ts";
import { LOYALTY_FOLLOWED, LOYALTY_OVERRULED, choiceEffects, hashSeed, loyaltyOf } from "./engine.ts";
import { campOf, isDisloyal, mannerOf } from "./advisors.ts";
import {
  ABOUT_OTHER, ADMIT, ADVISOR_REASONS, AGREE, ALARM, DOWNPLAY, DRY, LEVEL_PHRASES, NO_STAKE, ORDINAL, ORDINAL_LOC, VERDICTS,
  type Level, type Manner,
} from "../content/forecasts.ts";
import type { ActionTag, AdvisorNews, Choice, GameEvent, GameState, ResourceKey } from "./types.ts";

export type { Level };

// Своя область советника и второй интерес, по которому он выбирает, когда своя не задета.
export const ADVISOR_STAKE: Record<string, { interest: ResourceKey; also: ResourceKey }> = {
  economist: { interest: "economy", also: "externalReputation" },
  security: { interest: "military", also: "politicalCapital" },
  diplomat: { interest: "externalReputation", also: "economy" },
  strategist: { interest: "internalLegitimacy", also: "politicalCapital" },
};

// Кто спорит о деле: по тегам вариантов и задетым лагерям. Внешние дела — дипломат против силовика,
// улица и пресса — политтехнолог против экономиста, остальное — экономист против силовика.
const FOREIGN: ActionTag[] = ["pro_west", "pro_russia", "reform"];
const FOREIGN_BLOCS = ["west", "russia"];
const PUBLIC: ActionTag[] = ["propaganda", "dialogue", "anticorruption", "elite_deal", "social"];
export function pairFor(state: Pick<GameState, "factions">, event: GameEvent): [string, string] {
  const tags = new Set(event.choices.flatMap(choice => choice.tags));
  const foreignCamp = event.affectedFactions.some(id => FOREIGN_BLOCS.includes(state.factions.find(faction => faction.id === id)?.bloc ?? ""));
  if (foreignCamp || FOREIGN.some(tag => tags.has(tag))) return ["diplomat", "security"];
  if (PUBLIC.some(tag => tags.has(tag)) && !tags.has("security") && !tags.has("repress")) return ["strategist", "economist"];
  return ["economist", "security"];
}

// Как часто советник лукавит о том, что вне его области: слабый — почти всегда, блестящий — реже.
// Сухая манера лукавит ещё реже, нелояльный — всегда.
export const SPIN_CHANCE: Record<1 | 2 | 3, number> = { 1: 0.75, 2: 0.55, 3: 0.35 };
const DRY_DISCOUNT = 0.25;

const BIG = 6, SMALL = 2;
const RESOURCES: ResourceKey[] = ["economy", "military", "internalLegitimacy", "externalReputation", "politicalCapital", "personalResource"];

export const levelOf = (delta: number): Level => {
  const size = Math.abs(Math.round(delta));
  const level = size >= BIG ? 2 : size >= SMALL ? 1 : 0;
  return (delta < 0 ? -level : level) as Level;
};
const clamp = (level: number): Level => Math.max(-2, Math.min(2, level)) as Level;

// Одно утверждение советника: о каком варианте, какой опоре, что сказал и как на самом деле.
export interface Claim {
  choiceId: string;
  index: number;
  resource: ResourceKey;
  said: Level;
  truth: Level;
  domain: boolean; // о своей области — честно, пока советник лоялен
}

export interface AdvisorTake {
  id: string;
  name: string;
  role: string;
  favors: string; // id варианта, за который советник
  text: string;
  claims: Claim[];
}

// Где спор уместен: дело с выбором, в том числе эпизод интриги. Звонки, бюджет и пресс-конференции идут своими формами,
// личные дела и проверка документов — без советников.
export function debateApplies(event: GameEvent | null | undefined): event is GameEvent {
  if (!event || event.budget || event.call || event.press || event.special) return false;
  if (event.choices.some(choice => choice.projectReview || choice.mandateResponse || choice.deal?.pure)) return false;
  return event.choices.length >= 2;
}

// Почему вариант двигает опору: причина именно этого решения, слова советника о своей области или общая причина по тегу.
function reasonOf(choice: Choice, resource: ResourceKey, sign: number, salt: number): string | null {
  if (sign < 0 && choice.costReasons?.[resource]) return choice.costReasons[resource]!;
  const tag = choice.tags.find(candidate => Math.sign(ACTIONS[candidate]?.res[resource] ?? 0) === sign);
  if (!tag) return null;
  const own = ADVISOR_REASONS[resource]?.[tag];
  return own ? own[salt % own.length] : ACTIONS[tag].why?.[resource] ?? null;
}

const phrase = (resource: ResourceKey, level: Level) => LEVEL_PHRASES[resource][level + 2];
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const fillLine = (template: string, text: string, index: number) => template
  .replace("{x}", text).replace("{X}", upper(text)).replace("{n}", ORDINAL[index]).replace("{loc}", ORDINAL_LOC[index]);

interface Option {
  choice: Choice;
  index: number;
  truth: Record<ResourceKey, Level>;
  delta: Record<ResourceKey, number>;
  relation: Record<string, number>; // как вариант меняет отношение лагерей к президенту
}

function optionsOf(state: GameState, event: GameEvent): Option[] {
  return event.choices.map((choice, index) => {
    const fx = choiceEffects(state, choice);
    const delta = Object.fromEntries(RESOURCES.map(key => [key, Math.round(fx.resources[key] ?? 0)])) as Record<ResourceKey, number>;
    const truth = Object.fromEntries(RESOURCES.map(key => [key, levelOf(delta[key])])) as Record<ResourceKey, Level>;
    return { choice, index, truth, delta, relation: fx.factionRel };
  });
}

// Советник знает свою область: выбирает вариант, лучший для неё, затем — для второго интереса, затем — дешевле в целом.
// Нелояльный сначала смотрит, что выгодно его лагерю.
function favoriteOf(options: Option[], interest: ResourceKey, also: ResourceKey, camp: string | null): Option {
  const score = (option: Option) => (camp ? (option.relation[camp] ?? 0) * 100_000 : 0)
    + option.delta[interest] * 1000 + option.delta[also] * 30 + RESOURCES.reduce((sum, key) => sum + option.delta[key], 0);
  return options.reduce((best, option) => (score(option) > score(best) ? option : best));
}

// Сдвиг утверждения в пользу своего варианта: о своём — лучше правды, о чужом — хуже.
const toward = (target: Option, favored: Option, truth: Level, shift: number) => clamp(target === favored ? truth + shift : truth - shift);

// Утверждение о своей области с причиной: честное у лояльного, со сдвигом у нелояльного.
function domainLine(favored: Option, opposed: Option, interest: ResourceKey, salt: number, lie: boolean) {
  const pro = favored.truth[interest], contra = opposed.truth[interest];
  if (!pro && !contra) return { line: NO_STAKE[interest] ?? "", claim: null };
  const aboutOpposed = Math.abs(contra) > Math.abs(pro) || (Math.abs(contra) === Math.abs(pro) && contra < 0);
  const target = aboutOpposed ? opposed : favored;
  const truth = target.truth[interest];
  const said = toward(target, favored, truth, lie ? 1 : 0);
  const why = said === truth ? reasonOf(target.choice, interest, Math.sign(truth), salt) : null;
  const text = `${phrase(interest, said)}${why ? `: ${why}` : ""}`;
  const claim: Claim = { choiceId: target.choice.id, index: target.index, resource: interest, said, truth, domain: true };
  return { line: aboutOpposed ? fillLine(ABOUT_OTHER[salt % ABOUT_OTHER.length], text, target.index) : `${upper(text)}.`, claim };
}

// Утверждение о чужой области: здесь советник тянет в свою сторону — в своей манере.
// smooth и dry сначала говорят о цене своего варианта, alarm — о цене чужого.
function spinLine(favored: Option, opposed: Option, interest: ResourceKey, manner: Manner, spun: boolean, salt: number, afterOpposed: boolean) {
  const others = RESOURCES.filter(key => key !== interest);
  const worst = (option: Option) => others.reduce((found, key) => (option.delta[key] < option.delta[found] ? key : found));
  const best = (option: Option) => others.reduce((found, key) => (option.delta[key] > option.delta[found] ? key : found));
  const ownCost = favored.truth[worst(favored)] < 0 ? { target: favored, resource: worst(favored) } : null;
  const rivalCost = opposed.truth[worst(opposed)] < 0 ? { target: opposed, resource: worst(opposed) } : null;
  const rivalGain = opposed.truth[best(opposed)] > 0 ? { target: opposed, resource: best(opposed) } : null;
  const pick = (manner === "alarm" ? [rivalCost, ownCost, rivalGain] : [ownCost, rivalCost, rivalGain]).find(Boolean);
  if (!pick) return null;
  const { target, resource } = pick;
  const said = toward(target, favored, target.truth[resource], spun ? 1 : 0);
  const aboutRival = manner === "alarm" ? ALARM : manner === "dry" ? DRY : ABOUT_OTHER;
  const templates = target === favored ? (said < 0 ? ADMIT : DOWNPLAY) : afterOpposed ? ["Там же {x}."] : aboutRival;
  const claim: Claim = { choiceId: target.choice.id, index: target.index, resource, said, truth: target.truth[resource], domain: false };
  return { line: fillLine(templates[salt % templates.length], phrase(resource, said), target.index), claim };
}

// Спор под делом: два советника, каждый за свой вариант. null — дело без спора.
export function debate(state: GameState): AdvisorTake[] | null {
  const event = state.currentEvent;
  if (!debateApplies(event)) return null;
  const options = optionsOf(state, event);
  const speakers = pairFor(state, event).flatMap(id => {
    const advisor = state.advisors?.find(member => member.id === id);
    if (!advisor) return [];
    const disloyal = isDisloyal(advisor);
    return [{ id, ...ADVISOR_STAKE[id], advisor, disloyal, manner: mannerOf(advisor), camp: disloyal ? campOf(state, advisor)?.id ?? null : null }];
  });
  if (speakers.length < 2) return null;
  // Против кого интрига, тот о ней не советует.
  if (event.beat && speakers.some(speaker => speaker.advisor.name === state.arc?.target)) return null;
  const favorites = speakers.map(speaker => favoriteOf(options, speaker.interest, speaker.also, speaker.camp));
  return speakers.map((speaker, position) => {
    const favored = favorites[position];
    const rival = favorites[1 - position];
    // Спорит с вариантом соперника; если оба за одно — с тем, что хуже для своей области.
    const opposed = rival !== favored ? rival
      : options.filter(option => option !== favored)
        .reduce((found, option) => (option.delta[speaker.interest] < found.delta[speaker.interest] ? option : found));
    const chance = SPIN_CHANCE[speaker.advisor.skill] - (speaker.manner === "dry" ? DRY_DISCOUNT : 0);
    const spun = speaker.disloyal || hashSeed(state.seed, "spin", state.turn, speaker.id) % 100 < chance * 100;
    const agree = position === 1 && rival === favored;
    const salt = hashSeed(state.seed, "debate", state.turn, speaker.id);
    const verdicts = agree ? AGREE : VERDICTS;
    const verdict = verdicts[salt % verdicts.length].replace("{n}", ORDINAL[favored.index]);
    const domain = domainLine(favored, opposed, speaker.interest, salt >>> 3, speaker.disloyal);
    const spin = spinLine(favored, opposed, speaker.interest, speaker.manner, spun, salt >>> 6, domain.claim?.choiceId === opposed.choice.id);
    return {
      id: speaker.id,
      name: speaker.advisor.name,
      role: speaker.advisor.role,
      favors: favored.choice.id,
      text: [verdict, domain.line, spin?.line].filter(Boolean).join(" "),
      claims: [domain.claim, spin?.claim].filter((claim): claim is Claim => !!claim),
    };
  });
}

const RES_NAME: Record<ResourceKey, string> = {
  economy: "экономика", military: "силовики", internalLegitimacy: "легитимность",
  externalReputation: "репутация", politicalCapital: "политкапитал", personalResource: "личный ресурс",
};
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

// После хода: что советники говорили о выбранном варианте и что вышло на деле (без чужих кризисов и эха).
export interface ForecastCheck { take: AdvisorTake; claim: Claim; delta: number; right: boolean }

export function forecastChecks(state: GameState, choiceId: string, failed: boolean): ForecastCheck[] {
  const takes = debate(state);
  const chosen = state.currentEvent?.choices.find(choice => choice.id === choiceId);
  if (!takes || !chosen) return [];
  const actual = choiceEffects(state, chosen, failed).resources;
  return takes.flatMap(take => take.claims.filter(claim => claim.choiceId === choiceId).map(claim => {
    const delta = Math.round(actual[claim.resource] ?? 0);
    return { take, claim, delta, right: levelOf(delta) === claim.said };
  }));
}

export function forecastReview(state: GameState, choiceId: string, failed: boolean): string[] {
  return forecastChecks(state, choiceId, failed).map(({ take, claim, delta, right }) => {
    const verdict = right ? "верно" : failed ? "мимо: решение провалилось" : "мимо";
    return `${take.name}: «${phrase(claim.resource, claim.said)}». Решение: ${RES_NAME[claim.resource]} ${signed(delta)} — ${verdict}.`;
  });
}

// Что ход сделал с советниками в споре: выбрали вариант советника — лояльность растёт,
// вариант его оппонента — падает; сбывшиеся прогнозы идут в счёт.
// В отчёт идёт фактическая перемена после ограничения 0–100: у советника с лояльностью 100 рост нулевой.
export function advisorNews(state: GameState, choiceId: string, failed: boolean): AdvisorNews[] {
  const takes = debate(state);
  if (!takes) return [];
  const checks = forecastChecks(state, choiceId, failed);
  return takes.map(take => {
    const overruled = take.favors !== choiceId && takes.some(other => other !== take && other.favors === choiceId);
    const reason = take.favors === choiceId ? "followed" as const : overruled ? "overruled" as const : null;
    const own = checks.filter(check => check.take.id === take.id);
    const nominal = reason === "followed" ? LOYALTY_FOLLOWED : reason === "overruled" ? LOYALTY_OVERRULED : 0;
    const before = loyaltyOf(state.advisors.find(advisor => advisor.id === take.id)!);
    return {
      id: take.id,
      loyalty: Math.max(0, Math.min(100, before + nominal)) - before,
      right: own.filter(check => check.right).length,
      wrong: own.filter(check => !check.right).length,
      reason,
    };
  });
}
