// Люди вместо стрелок: под делом спорят два советника с противоположными интересами.
// Экономист отвечает за казну, советник по безопасности — за силовиков. В своей области каждый говорит правду,
// о прочем — тянет в свою сторону: цену любимого варианта преуменьшает, чужого — раздувает.
// Кто был прав, видно после хода: газета сверяет прогнозы с ведомостью.
import { ACTIONS } from "./data.ts";
import { LOYALTY_FOLLOWED, LOYALTY_OVERRULED, choiceEffects, hashSeed } from "./engine.ts";
import {
  ABOUT_OTHER, ADMIT, ADVISOR_REASONS, AGREE, DOWNPLAY, LEVEL_PHRASES, NO_STAKE, ORDINAL, ORDINAL_LOC, VERDICTS, type Level,
} from "../content/forecasts.ts";
import type { AdvisorNews, Choice, GameEvent, GameState, ResourceKey } from "./types.ts";

export type { Level };

// Двое спорящих: своя область и второй интерес, по которому советник выбирает, когда своя не задета.
// Экономисту важны ещё инвесторы и репутация, советнику по безопасности — контроль над элитами.
export const DEBATERS: { id: string; interest: ResourceKey; also: ResourceKey }[] = [
  { id: "economist", interest: "economy", also: "externalReputation" },
  { id: "security", interest: "military", also: "politicalCapital" },
];

// Как часто советник лукавит о том, что вне его области: слабый — почти всегда, блестящий — реже.
export const SPIN_CHANCE: Record<1 | 2 | 3, number> = { 1: 0.75, 2: 0.55, 3: 0.35 };

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
  domain: boolean; // о своей области — всегда честно
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
  if (event.choices.some(c => c.projectReview || c.mandateResponse || c.deal?.pure)) return false;
  return event.choices.length >= 2;
}

// Почему вариант двигает опору: причина именно этого решения, слова советника о своей области или общая причина по тегу.
function reasonOf(choice: Choice, resource: ResourceKey, sign: number, salt: number): string | null {
  if (sign < 0 && choice.costReasons?.[resource]) return choice.costReasons[resource]!;
  const tag = choice.tags.find(t => Math.sign(ACTIONS[t]?.res[resource] ?? 0) === sign);
  if (!tag) return null;
  const own = ADVISOR_REASONS[resource]?.[tag];
  return own ? own[salt % own.length] : ACTIONS[tag].why?.[resource] ?? null;
}

const phrase = (resource: ResourceKey, level: Level) => LEVEL_PHRASES[resource][level + 2];
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const fillLine = (template: string, text: string, index: number) => template
  .replace("{x}", text).replace("{X}", upper(text)).replace("{n}", ORDINAL[index]).replace("{loc}", ORDINAL_LOC[index]);

interface Option { choice: Choice; index: number; truth: Record<ResourceKey, Level>; delta: Record<ResourceKey, number> }

function optionsOf(state: GameState, event: GameEvent): Option[] {
  return event.choices.map((choice, index) => {
    const fx = choiceEffects(state, choice).resources;
    const delta = Object.fromEntries(RESOURCES.map(k => [k, Math.round(fx[k] ?? 0)])) as Record<ResourceKey, number>;
    const truth = Object.fromEntries(RESOURCES.map(k => [k, levelOf(delta[k])])) as Record<ResourceKey, Level>;
    return { choice, index, truth, delta };
  });
}

// Советник знает свою область: выбирает вариант, лучший для неё, затем — для второго интереса, затем — дешевле в целом.
function favoriteOf(options: Option[], interest: ResourceKey, also: ResourceKey): Option {
  const score = (o: Option) => o.delta[interest] * 1000 + o.delta[also] * 30 + RESOURCES.reduce((sum, k) => sum + o.delta[k], 0);
  return options.reduce((best, o) => (score(o) > score(best) ? o : best));
}

// Утверждение о своей области: честное, с причиной.
function domainLine(favored: Option, opposed: Option, interest: ResourceKey, salt: number): { line: string; claim: Claim | null } {
  const pro = favored.truth[interest], contra = opposed.truth[interest];
  if (!pro && !contra) return { line: NO_STAKE[interest] ?? "", claim: null };
  const aboutOpposed = Math.abs(contra) > Math.abs(pro) || (Math.abs(contra) === Math.abs(pro) && contra < 0);
  const target = aboutOpposed ? opposed : favored;
  const level = target.truth[interest];
  const why = reasonOf(target.choice, interest, Math.sign(level), salt);
  const text = `${phrase(interest, level)}${why ? `: ${why}` : ""}`;
  return {
    line: aboutOpposed ? fillLine(ABOUT_OTHER[salt % ABOUT_OTHER.length], text, target.index) : `${upper(text)}.`,
    claim: { choiceId: target.choice.id, index: target.index, resource: interest, said: level, truth: level, domain: true },
  };
}

// Утверждение о чужой области: здесь советник тянет в свою сторону.
function spinLine(favored: Option, opposed: Option, interest: ResourceKey, spun: boolean, salt: number, afterOpposed: boolean) {
  const others = RESOURCES.filter(k => k !== interest);
  const worst = (o: Option) => others.reduce((a, b) => (o.delta[b] < o.delta[a] ? b : a));
  const best = (o: Option) => others.reduce((a, b) => (o.delta[b] > o.delta[a] ? b : a));
  const shift = spun ? 1 : 0;
  let target: Option, resource: ResourceKey, said: Level;
  if (favored.truth[worst(favored)] < 0) {
    target = favored; resource = worst(favored); said = clamp(favored.truth[resource] + shift); // цену своего варианта преуменьшает
  } else if (opposed.truth[worst(opposed)] < 0) {
    target = opposed; resource = worst(opposed); said = clamp(opposed.truth[resource] - shift); // цену чужого раздувает
  } else if (opposed.truth[best(opposed)] > 0) {
    target = opposed; resource = best(opposed); said = clamp(opposed.truth[resource] - shift); // выгоду чужого не замечает
  } else return null;
  const text = phrase(resource, said);
  const templates = target === favored ? (said < 0 ? ADMIT : DOWNPLAY) : afterOpposed ? ["Там же {x}."] : ABOUT_OTHER;
  const claim: Claim = { choiceId: target.choice.id, index: target.index, resource, said, truth: target.truth[resource], domain: false };
  return { line: fillLine(templates[salt % templates.length], text, target.index), claim };
}

// Спор под делом: два советника, каждый за свой вариант. null — дело без спора.
export function debate(state: GameState): AdvisorTake[] | null {
  const event = state.currentEvent;
  if (!debateApplies(event)) return null;
  const options = optionsOf(state, event);
  const speakers = DEBATERS.map(d => ({ ...d, advisor: state.advisors?.find(a => a.id === d.id) })).filter(d => d.advisor);
  if (speakers.length < 2) return null;
  // Против кого интрига, тот о ней не советует.
  if (event.beat && speakers.some(d => d.advisor!.name === state.arc?.target)) return null;
  const favorites = speakers.map(d => favoriteOf(options, d.interest, d.also));
  return speakers.map((d, i) => {
    const favored = favorites[i];
    const rival = favorites[1 - i];
    // Спорит с вариантом соперника; если оба за одно — с тем, что хуже для своей области.
    const opposed = rival !== favored ? rival
      : options.filter(o => o !== favored).reduce((a, b) => (b.delta[d.interest] < a.delta[d.interest] ? b : a));
    const spun = hashSeed(state.seed, "spin", state.turn, d.id) % 100 < SPIN_CHANCE[d.advisor!.skill] * 100;
    const agree = i === 1 && rival === favored;
    const salt = hashSeed(state.seed, "debate", state.turn, d.id);
    const verdicts = agree ? AGREE : VERDICTS;
    const verdict = verdicts[salt % verdicts.length].replace("{n}", ORDINAL[favored.index]);
    const domain = domainLine(favored, opposed, d.interest, salt >>> 3);
    const spin = spinLine(favored, opposed, d.interest, spun, salt >>> 6, domain.claim?.choiceId === opposed.choice.id);
    return {
      id: d.id,
      name: d.advisor!.name,
      role: d.advisor!.role,
      favors: favored.choice.id,
      text: [verdict, domain.line, spin?.line].filter(Boolean).join(" "),
      claims: [domain.claim, spin?.claim].filter((c): c is Claim => !!c),
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
  const chosen = state.currentEvent?.choices.find(c => c.id === choiceId);
  if (!takes || !chosen) return [];
  const actual = choiceEffects(state, chosen, failed).resources;
  return takes.flatMap(take => take.claims.filter(c => c.choiceId === choiceId).map(claim => {
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
export function advisorNews(state: GameState, choiceId: string, failed: boolean): AdvisorNews[] {
  const takes = debate(state);
  if (!takes) return [];
  const checks = forecastChecks(state, choiceId, failed);
  return takes.map(take => {
    const overruled = take.favors !== choiceId && takes.some(other => other !== take && other.favors === choiceId);
    const reason = take.favors === choiceId ? "followed" as const : overruled ? "overruled" as const : null;
    const own = checks.filter(check => check.take.id === take.id);
    return {
      id: take.id,
      loyalty: reason === "followed" ? LOYALTY_FOLLOWED : reason === "overruled" ? LOYALTY_OVERRULED : 0,
      right: own.filter(check => check.right).length,
      wrong: own.filter(check => !check.right).length,
      reason,
    };
  });
}
