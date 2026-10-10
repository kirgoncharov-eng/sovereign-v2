import { pensionCall } from './pension-call.ts';
import { withEvidenceChoice } from './private-evidence.ts';
import { mandatePublicEvent } from './minister-public.ts';
import { calendarEpisode, calendarSlot } from './political-calendar.ts';
// Режим «Сценарии»: та же игра без обращения к модели. Событие выбирается из библиотеки
// карточек по состоянию страны, текст итога собирается из фрагментов. Всё мгновенно и офлайн.
import { promisesBroken, promisesKept } from "./promises.ts";
import { ARCS } from "../content/arcs.ts";
import { EARLY_THREADS } from "../content/early-threads.ts";
import { COUNCIL_A } from "../content/council-a.ts";
import { FAIL_A } from "../content/fail-a.ts";
import { BEAT_FAILS } from "../content/fail-beats.ts";
import { CRISIS_SCENES, FAIL_B } from "../content/fail-b.ts";
import { CARD_HEADLINES, CRISIS_HEADLINES, type HeadlinePair } from "../content/headlines-cards.ts";
import { COUNCIL_HEADLINES } from "../content/headlines-council.ts";
import { BEAT_HEADLINES } from "../content/headlines-beats.ts";
import { COUNCIL_B } from "../content/council-b.ts";
import { CRISIS_ESCALATE, EVENT_CARDS, RANDOM_EVENTS, type EventCard } from "../content/events.ts";
import { SCENES } from "../content/scenes.ts";
import { EVENT_EXT } from "../content/events-ext.ts";
import { BEAT_EXT } from "../content/beats-ext.ts";
import { DAY_TIMES, DAYLIGHT, NIGHT, NIGHT_TIMES, type PlaceKind, INTERCEPTS, PLACES, TIMES, WEATHER_ANY, WEATHER_BY_SEASON } from "../content/frame.ts";
import { MONTHS_ADJ, MONTHS_GEN, turnDate } from "./calendar.ts";
import { ECHOES } from "../content/echoes.ts";
import { sceneAfter } from "../content/scene-map.ts";
import { BUSINESS, FOREIGN, OPPOSITION, OPPOSITION_ELECTION, OPPOSITION_FAIL, OPPOSITION_SPECIAL, OUTLETS } from "../content/newspaper.ts";
import { BILL, LAWS, REPEAL, type LawDef } from "../content/laws.ts";
import { effectiveLaw, lawDef } from "./laws.ts";
import { DEEDS, ELECTION_NIGHT, INTERCUTS, roleGroup } from "../content/roles.ts";
import { TERMS_TURN, electionKind, fellTrying, isTermEnd, reignOf, forceFaction, pathDeal, pathOptions, pathVerdict, termRule, type PathOption } from "./terms.ts";
import { DIED, FINALE, LOCKED, PATHS, PATHS_AS, TERM_HOW, PATH_EPITAPHS, PATH_FALL, TERMS_TEXT } from "../content/terms.ts";
import { LAW_REACT, MEANWHILE, type LawAct, REACT_BY_TAG, REACT_DIPLOMAT, REACT_FAILURE, REACT_SPECIAL, SAY, SAY_DIPLOMAT, type SpecialAct } from "../content/reactions.ts";
import { MANAGEMENT_DOSSIERS } from "../content/management.ts";
import { PRESS_QUESTIONS, PRESS_TEXT, type PressWhen } from "../content/press.ts";
import { BUDGET_DEBT, BUDGET_ITEMS, BUDGET_MAX, BUDGET_REL, BUDGET_RES, BUDGET_TEXT, BUDGET_TOTAL } from "../content/budget.ts";
import { APPROACH_WORKS, CALL_DEMANDS, CALL_ENDINGS, CALL_REPLIES, CALL_TEXT, type Approach } from "../content/calls.ts";
import {
  COUNCIL_HINT, COUNCIL_OUTCOME, COUNCIL_TEXT, RELATED_TAGS, CRISIS_DESC, CRISIS_TITLES, DIFFICULTY_SITUATION, EPITAPHS, HEADLINES, HISTORIAN,
  FOREIGN_NAMES, IDEOLOGY_PARTIES, NAMES, POWER_LOSS, type LossEnd, SPEECHES, TAG_LINES, TITLES,
} from "../content/narration.ts";
import { ACTIONS, ADVISOR_ROLES, CAPITAL_CASES, COUNTRIES, FACTIONS_DATA, DELAYED, WEAK_ADVISOR_DELAYED, ELECTION_LABEL, FIGURE_ROLES, RATINGS, RES_CONFIG, TERM, localTurn, reignLength, termIndex, termOrdinal, termOrdinalGen } from "./data.ts";
import { INSIDER, INSIDER_LINES, MOLE, MOLE_LINES, OVERTURE, OVERTURE_REASON, PACT, PACT_BROKEN_LINE, PACT_GIVES, PACT_KEPT_LINE, PACT_OK_VARIANTS, type SpecialChoice } from "../content/people.ts";
import { MAX_PACTS, PACT_TAG, RIVAL_BLOCS, TRAITS, bondOf, pactBans, traitOf } from "./people.ts";
import { computePolls, dueBeat, hashSeed, isFemaleName, isSurvival, planTurn, plural, seededRandom, warningLevel } from "./engine.ts";
import { storyLetters } from "./stories.ts";
import { advisorNews, forecastReview } from "./forecasts.ts";
import { sanitizeProposals } from "./sanitize.ts";
import type { ActionTag, Bloc, Choice, Deal, DifficultyId, EndType, Faction, Figure, GameEvent, GameState, IdeologyId, Intro, Narration, PathId, ResourceDelta, Verdict } from "./types.ts";

type Rand = () => number;
const pick = <T,>(r: Rand, list: T[]): T => list[Math.floor(r() * list.length)];
// Вариант текста для n-го повторения одного и того же события за партию.
const nth = (list: readonly string[], n: number) => list[n % list.length];

// Выбор без повторов в пределах партии: пул перемешан зерном партии, индекс — номер хода.
function cycle<T>(list: T[], seed: number, salt: string, idx: number): T {
  const order = list.map((_, i) => i).sort((a, b) => hashSeed(seed, salt, a) - hashSeed(seed, salt, b));
  return list[order[((idx % list.length) + list.length) % list.length]];
}

const factionOf = (state: GameState, bloc: string) => state.factions.find(f => f.bloc === bloc);
function figureOf(state: GameState, bloc: string) {
  const ids = state.factions.filter(f => f.bloc === bloc).map(f => f.id);
  const inBloc = state.keyFigures.filter(f => ids.includes(f.faction));
  // Тексты событий написаны в мужском роде — берём мужчину, если он есть в этой группе.
  return inBloc.find(f => !isFemaleName(f.name)) ?? inBloc[0];
}
const quoted = (name: string) => (name.includes("«") ? name : `«${name}»`);

function rivalName(state: GameState): string {
  const polls = computePolls(state.country, state.factions, state.resources);
  const top = [...polls.parties].sort((a, b) => b.share - a.share)[0];
  return top ? quoted(top.name) : "оппозиции";
}

// Религиозная лексика страны: в Казахстане вместо церкви и прихожан — духовенство и верующие.
// {faith:temple} — со строчной, {faith:Temple} — с прописной.
const FAITH: Record<"christian" | "muslim", Record<string, string>> = {
  christian: {
    church: "церковь", temple: "храм", flock_gen: "прихожан", flock_dat: "прихожанам", parishes_dat: "приходам",
    diocese_dat: "епархии", priest_gen: "священника", icons: "иконами",
    sermons_loc: "воскресных проповедях", believer_gen: "христианина",
    prays: "служит молебен", prays_thanks: "служит благодарственный молебен", after_service: "после службы",
  },
  muslim: {
    church: "духовенство", temple: "мечеть", flock_gen: "верующих", flock_dat: "верующим", parishes_dat: "общинам",
    diocese_dat: "духовному управлению", priest_gen: "имама", icons: "плакатами",
    sermons_loc: "пятничных проповедях", believer_gen: "верующего",
    prays: "читает молитву", prays_thanks: "читает благодарственную молитву", after_service: "после пятничной молитвы",
  },
};
const faithOf = (country: string) => FAITH[country === "Казахстан" ? "muslim" : "christian"];

// Подстановка слотов {capital} {fig:security} и т.п.
export function fill(tpl: string, state: GameState, extra: Record<string, string> = {}): string {
  // Род по персонажу: {g:west:он|она} — форма для того, кто стоит за {fig:west}.
  const gendered = tpl.replace(/\{g:(\w+):([^|{}]*)\|([^{}]*)\}/g, (_m, bloc: string, he: string, she: string) => {
    const name = figureOf(state, bloc)?.name;
    return name && isFemaleName(name) ? she : he;
  });
  // Число по названию группы: {v:west:ставит|ставят} — «Запад ставит», «Западные партнёры ставят».
  const agreed = gendered.replace(/\{v:(\w+):([^|{}]*)\|([^{}]*)\}/g, (_m, bloc: string, one: string, many: string) => {
    const fac = factionOf(state, bloc);
    return fac && FACTIONS_DATA[state.country]?.find(f => f.id === fac.id)?.plural ? many : one;
  });
  return agreed.replace(/\{(\w+)(?::(\w+))?\}/g, (m, key: string, arg?: string) => {
    switch (key) {
      case "capital": {
        const cap = COUNTRIES[state.country].capital;
        return arg ? CAPITAL_CASES[cap]?.[arg as keyof (typeof CAPITAL_CASES)[string]] ?? cap : cap;
      }
      case "country": return state.country;
      case "leader": return state.leader.name;
      case "rival": return rivalName(state);
      case "crisis": return state.activeCrises[0]?.title ?? "кризис";
      case "target": return state.arc?.target ?? "неизвестный";
      case "fig": return figureOf(state, arg!)?.name ?? factionOf(state, arg!)?.name ?? "оппоненты";
      case "fac": return factionOf(state, arg!)?.name ?? "оппоненты";
      case "faith": {
        const word = faithOf(state.country)[arg!.toLowerCase()] ?? m;
        return arg![0] === arg![0].toUpperCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
      }
      default: return extra[key] ?? m;
    }
  });
}

// Шапка главы: день, время, погода, место. Детерминирована ходом, чтобы не менялась при перезагрузке.
// Место — по роду дела. У эпизодов интриги время и место задаёт сама сцена, в шапке только дата и погода.
export function dateline(state: GameState, kind: PlaceKind | "beat" = "desk"): string {
  const r = seededRandom(hashSeed(state.seed, "dateline", state.turn));
  const t = state.turn;
  const d = turnDate(state.seed, COUNTRIES[state.country].startYear, t);
  const weather = cycle([...WEATHER_BY_SEASON[d.season], ...WEATHER_ANY], state.seed, "weather", t);
  if (kind === "beat") return fill(`${d.day} ${MONTHS_GEN[d.month]} ${d.year}, ${d.weekday}. ${weather}`, state);
  const place = cycle(PLACES[kind], state.seed, "place", t);
  // Ночное место — ночное время; дневная погода или место — дневное. Ночью «жары в кабинетах» не бывает.
  const time = pick(r, NIGHT.has(place) ? NIGHT_TIMES : DAYLIGHT.has(weather) || DAYLIGHT.has(place) ? DAY_TIMES : TIMES);
  const sky = NIGHT.has(place) && DAYLIGHT.has(weather) ? "" : ` ${weather}`;
  return fill(`${d.day} ${MONTHS_GEN[d.month]} ${d.year}, ${d.weekday}, ${time}.${sky} ${place}`, state);
}
// Место по источнику обычного дела: улица и армия — ситуационный центр, иностранцы — спецсвязь.
const SOURCE_PLACE: Record<string, PlaceKind> = {
  "Улица": "crisis", "Армия": "crisis", "Разведка": "crisis", "Оппозиция": "crisis",
  "МИД": "foreign", "Брюссель": "foreign", "Кремль": "foreign", "Москва": "foreign", "Парламент": "parliament",
  "МВД": "crisis", "Министерство обороны": "crisis", "Олигарх": "private",
};

const chapter = (...parts: (string | undefined | null | false)[]) => parts.filter(Boolean).join("\n\n");

// ── Выбор карточки ───────────────────────────────────────────────────────────
const neededBlocs = (card: EventCard) =>
  [...`${card.title} ${card.description}`.matchAll(/\{(?:fig|fac):(\w+)\}/g)].map(m => m[1]);

export function cardAvailable(card: EventCard, state: GameState): boolean {
  if (card.countries && !card.countries.includes(state.country)) return false;
  if (card.notArc && state.arc && card.notArc.includes(state.arc.id)) return false;
  if (neededBlocs(card).some(b => !state.factions.some(f => f.bloc === b))) return false;
  const w = card.when ?? {};
  const turn = state.turn + 1;
  const blocRel = (bloc: Bloc) => state.factions.filter(f => f.bloc === bloc).map(f => f.relation);
  if (w.minTurn && turn < w.minTurn) return false;
  if (w.maxTurn && turn > w.maxTurn) return false;
  if (w.low?.some(k => state.resources[k] >= 30)) return false;
  if (w.high?.some(k => state.resources[k] <= 60)) return false;
  if (w.hostile && !blocRel(w.hostile).some(r => r <= -40)) return false;
  if (w.friendly && !blocRel(w.friendly).some(r => r >= 40)) return false;
  if (w.crisis && !state.activeCrises.length) return false;
  // «Перед выборами» — только если выборы действительно будут: после отмены или ухода их нет.
  const vote = (t: number) => !!electionKind(t, state.path, reignOf(state).office);
  if (w.preElection && !vote(turn + 1) && !vote(turn + 2)) return false;
  // Когда страна уже живёт по чрезвычайному положению или указам, просить «ввести ЧП» некому.
  if (w.law === "emergency_powers" && (state.path?.id === "postpone" || state.path?.id === "dictatorship")) return false;
  if (w.ideo && !w.ideo.includes(state.ideo)) return false;
  if (w.law === 'pension_reform' && state.laws?.some(l => l.id === w.law && l.transition)) return false;
  if (w.law && !state.laws?.some(l => l.id === w.law && turn - l.since >= 2)) return false;
  return true;
}

// Карточки с условиями — более «адресные», поэтому выпадают чаще.
const cardWeight = (card: EventCard) =>
  (card.weight ?? 1) * (Object.keys(card.when ?? {}).some(k => k !== "minTurn") || card.countries ? 2 : 1);

export function pickCard(state: GameState, r: Rand): EventCard {
  const fresh = EVENT_CARDS.filter(c => !state.usedEvents?.includes(c.id) && cardAvailable(c, state));
  const pool = fresh.length ? fresh : EVENT_CARDS.filter(c => cardAvailable(c, state));
  const total = pool.reduce((s, c) => s + cardWeight(c), 0);
  let x = r() * total;
  for (const c of pool) { x -= cardWeight(c); if (x <= 0) return c; }
  return pool[pool.length - 1];
}

// Эпизод сквозной интриги: авторский текст, одинаковый в обоих режимах.
export function beatEvent(state: GameState): GameEvent | null {
  const due = dueBeat(state);
  if (!due) return null;
  const { arc, beat, variant, episode, total } = due;
  // Антагонист, которого развязка убирает с поста, уступает место преемнику — и больше не мелькает в хронике.
  const villain = state.keyFigures.find(f => f.name === state.arc?.target);
  const heir = villain ? successorName(state, villain) : "";
  const heirLine = heir ? ` Новый ${lower(villain!.role)} — ${heir}.` : "";
  return withEvidenceChoice(state, {
    title: fill(variant.title, state),
    source: "Секретно",
    description: chapter(dateline(state, "beat"), fill(variant.description, state), BEAT_EXT[variant.title] && fill(BEAT_EXT[variant.title], state)),
    isCritical: episode === total,
    affectedFactions: [],
    choices: variant.choices.map((c, i) => ({
      id: ["a", "b", "c"][i], text: fill(c.text, state), hint: c.hint, tags: c.tags, resolvesCrisis: null,
      ...(c.costReasons ? { costReasons: Object.fromEntries(Object.entries(c.costReasons).map(([k, v]) => [k, fill(v!, state)])) } : {}),
      ...(c.removes && villain ? { deal: { figure: villain.id, replace: heir } } : {}),
      arc: { flag: c.flag, ok: fill(c.ok, state) + (c.removes ? heirLine : ""), ...(c.fail ?? BEAT_FAILS[c.text] ? { fail: fill(c.fail ?? BEAT_FAILS[c.text], state) } : {}), effect: c.effect ?? {}, ...(c.epilogue ? { epilogue: fill(c.epilogue, state) } : {}) },
      ...headlines(BEAT_HEADLINES[c.text], state),
    })),
    council: null,
    beat: { arcId: arc.id, arcTitle: arc.title, turn: beat.turn, episode, total },
    randomEvent: null,
  });
}

// ── Люди и союзы ─────────────────────────────────────────────────────────────
// Особые дела: личная встреча, раскрытый свой человек, «червоточина», предложение союза.
// Выпадают не чаще раза в три хода и не перебивают интригу.
const SPECIAL_GAP = 3;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tagLabels = (tags: ActionTag[]) => tags.map(t => `«${ACTIONS[t].label}»`).join(" или ");

function successorName(state: GameState, fig: Figure): string {
  const r = seededRandom(hashSeed(state.seed, "successor", fig.id, state.turn));
  if (FOREIGN_NAMES[fig.id]) {
    const pool = FOREIGN_NAMES[fig.id];
    const lasts = pool.last.filter(l => !fig.name.endsWith(l));
    return `${pick(r, pool.first)} ${pick(r, lasts.length ? lasts : pool.last)}`;
  }
  const used = new Set<string>();
  for (const n of [state.leader.name, ...state.keyFigures.map(f => f.name), ...state.advisors.map(a => a.name), ...(state.former ?? [])]) {
    const [first, last] = n.split(" ");
    used.add(`first:${first}`);
    if (last) used.add(last.replace(/(ов|ев|ин)а$/, "$1").replace(/(ск|цк)ая$/, "$1ий"));
  }
  return personName(state.country, r, MALE_ROLES.has(fig.id), used);
}

interface SpecialOption { c: SpecialChoice; tags: ActionTag[]; deal: Deal }
function specialChoices(state: GameState, options: SpecialOption[], slots: Record<string, string>): Choice[] {
  const f = (t: string) => fill(t, state, slots);
  return options.map(({ c, tags, deal }, i) => ({
    id: ["a", "b", "c"][i], text: f(c.text), hint: f(c.hint), tags, resolvesCrisis: null, deal,
    scene: f(c.ok), sceneFail: f(c.fail), headline: f(c.headline[0]), headlineFail: f(c.headline[1]),
  }));
}

type SpecialEvent = GameEvent & { cardId: string };
function personEvent(state: GameState, kind: "overture" | "insider" | "mole", fig: Figure, turn: number): SpecialEvent {
  const fac = state.factions.find(f => f.id === fig.faction)!;
  const slots = { name: fig.name, role: lower(fig.role), camp: fac.name, successor: successorName(state, fig) };
  const base = { figure: fig.id };
  const facRel = (d: number) => ({ [fac.id]: d });
  const content = kind === "overture" ? OVERTURE : kind === "insider" ? INSIDER : MOLE;
  const [a, b, c] = content.choices;
  const options: SpecialOption[] = kind === "overture" ? [
    { c: a, tags: ["dialogue"], deal: { ...base, figureRel: 20 } },
    { c: b, tags: ["delay"], deal: { ...base, figureRel: 8 } },
    { c, tags: ["elite_deal"], deal: { ...base, figureRel: -30, factionRel: facRel(12) } },
  ] : kind === "insider" ? [
    { c: a, tags: ["elite_deal"], deal: { ...base, figureRel: 10, factionRel: facRel(-10) } },
    { c: b, tags: ["dialogue"], deal: { ...base, replace: slots.successor, factionRel: facRel(-8), factionAppr: facRel(-8), res: { politicalCapital: 6 } } },
    { c, tags: ["delay"], deal: { ...base, replace: slots.successor, factionRel: facRel(8), othersRel: -8 } },
  ] : [
    { c: a, tags: ["security"], deal: { ...base, replace: slots.successor, factionRel: facRel(-6) } },
    { c: b, tags: ["elite_deal"], deal: { ...base, figureRel: 40, res: { personalResource: -4 } } },
    { c, tags: ["propaganda"], deal: { ...base, figureRel: -5, res: { politicalCapital: 5 } } },
  ];
  const reason = kind === "overture" ? fill(OVERTURE_REASON[traitOf(state.seed, fig, fac.bloc)], state, slots) : null;
  return {
    cardId: `sp:${turn}:${kind}:${fig.id}`,
    title: fill(content.title, state, slots),
    source: kind === "mole" ? "Разведка" : "Лично",
    description: chapter(dateline(state, "private"), fill(content.description, state, slots), reason),
    isCritical: false,
    affectedFactions: [fac.id],
    choices: specialChoices(state, options, slots),
    council: null,
    special: { kind, figure: fig.id, faction: fac.id },
    randomEvent: null,
  };
}

function pactEvent(state: GameState, turn: number, r: Rand, seen: (kind: string, id: string) => boolean): SpecialEvent | null {
  const active = new Set((state.pacts ?? []).map(p => p.faction));
  const people = (f: Faction) => state.keyFigures.filter(k => k.faction === f.id).sort((a, b) => b.relation - a.relation);
  const cands = state.factions.filter(f => f.relation >= -35 && f.relation <= 60 && !active.has(f.id) && !seen("pact", f.id));
  if (!cands.length) return null;
  // Предложение чаще приносит тот, кто лично к вам расположен.
  const score = new Map(cands.map(f => [f.id, (people(f)[0]?.relation ?? -20) + r() * 30]));
  const fac = [...cands].sort((a, b) => score.get(b.id)! - score.get(a.id)!)[0];
  // Переговоры ведёт только тот, кто к вам хотя бы не враждебен; иначе — письмо на бланке.
  const fig = people(fac).find(k => k.relation >= 0);
  const warm = !!fig && fig.relation >= 20;
  const turns = fig && fig.relation >= 40 ? 5 : 4;
  const banCount = Math.min(3, 1 + (warm ? 0 : 1) + (state.betrayals ? 1 : 0));
  const rival = state.factions.filter(f => RIVAL_BLOCS[fac.bloc].includes(f.bloc) && !active.has(f.id)).sort((a, b) => a.relation - b.relation)[0];
  const ban = pactBans(fac.bloc, banCount), banAgainst = pactBans(fac.bloc, banCount + 1);
  // Какой по счёту союз предлагают: от него зависит, какими словами описан исход.
  const nth = (state.usedEvents ?? []).filter(u => u.includes(":pact:")).length;
  const variant = (c: SpecialChoice, extra: string[]) => ({ ...c, ok: [c.ok, ...extra][nth % (extra.length + 1)] });
  const slots = {
    name: fig?.name ?? "", role: lower(fig?.role ?? ""), camp: fac.name, gives: PACT_GIVES[fac.bloc],
    turns: plural(turns, "ход", "хода", "ходов"), ban: tagLabels(ban), against: rival?.name ?? "",
  };
  const base = fig ? { figure: fig.id } : {};
  const options: SpecialOption[] = [
    { c: variant(PACT.sign, PACT_OK_VARIANTS.sign), tags: [PACT_TAG[fac.bloc]], deal: { ...base, pact: { faction: fac.id, turns, ban } } },
    ...(rival ? [{ c: variant(PACT.against, PACT_OK_VARIANTS.against), tags: [PACT_TAG[fac.bloc]],
      deal: { ...base, pact: { faction: fac.id, turns, ban: banAgainst, against: rival.id } } }] : []),
    { c: variant(PACT.refuse, PACT_OK_VARIANTS.refuse), tags: ["delay"], deal: { ...base, figureRel: -6, factionRel: { [fac.id]: -4 } } },
  ];
  const choices = specialChoices(state, options, slots);
  return {
    cardId: `sp:${turn}:pact:${fac.id}`,
    title: fill(PACT.title, state, slots),
    source: "Канцелярия",
    description: chapter(dateline(state, "meeting"), fill(warm ? PACT.viaFigure : PACT.viaLetter, state, slots), fill(PACT.body, state, slots), state.betrayals ? PACT.betrayed : null),
    isCritical: false,
    affectedFactions: [fac.id, ...(rival ? [rival.id] : [])],
    choices,
    council: null,
    special: { kind: "pact", figure: fig?.id ?? null, faction: fac.id },
    randomEvent: null,
  };
}

export function specialEvent(state: GameState): SpecialEvent | null {
  const turn = state.turn + 1;
  if (state.turn < 2 || isTermEnd(turn) || dueBeat(state)) return null;
  if (state.activeCrises.length && warningLevel(state) === "critical") return null;
  const marks = (state.usedEvents ?? []).filter(u => u.startsWith("sp:")).map(u => u.split(":"));
  if (turn - Math.max(0, ...marks.map(m => Number(m[1]) || 0)) < SPECIAL_GAP) return null;
  const seen = (kind: string, id: string) => marks.some(m => m[2] === kind && m[3] === id);
  // Утечки из одного и того же лагеря дважды — уже не новость.
  const campOf = (id: string) => state.keyFigures.find(f => f.id === id)?.faction;
  const seenCamp = (kind: string, fig: Figure) => marks.some(m => m[2] === kind && campOf(m[3]) === fig.faction);
  const r = seededRandom(hashSeed(state.seed, "special", state.turn));
  const facOf = (fig: Figure) => state.factions.find(f => f.id === fig.faction);
  // Антагонист интриги занят своей линией.
  const figs = state.keyFigures.filter(f => f.name !== state.arc?.target);
  // Червоточина: человек явно против вас, хотя его лагерь — за.
  const mole = figs.find(f => f.relation <= -20 && (facOf(f)?.relation ?? 0) >= 15 && f.relation - (facOf(f)?.relation ?? 0) <= -40 && !seenCamp("mole", f));
  if (mole && r() < 0.6) return personEvent(state, "mole", mole, turn);
  const insider = figs.find(f => bondOf(f, facOf(f)) === "insider" && (facOf(f)?.relation ?? 0) <= -30 && !seenCamp("insider", f));
  if (insider && r() < 0.5) return personEvent(state, "insider", insider, turn);
  const gap = (f: Figure) => f.relation - (facOf(f)?.relation ?? 0);
  const over = figs
    .filter(f => f.relation >= 10 && (facOf(f)?.relation ?? 0) <= 0 && gap(f) >= 25 && bondOf(f, facOf(f)) !== "insider" && !seen("overture", f.id))
    .sort((a, b) => gap(b) - gap(a))[0];
  if (over && r() < 0.45) return personEvent(state, "overture", over, turn);
  if (localTurn(turn) >= 4 && localTurn(turn) <= TERM - 3 && (state.pacts?.length ?? 0) < MAX_PACTS && r() < 0.3) return pactEvent(state, turn, r, seen);
  return null;
}

// ── Законы ───────────────────────────────────────────────────────────────────
// Раз в несколько ходов на стол ложится законопроект — или требование отменить давно принятый закон.
const LAW_GAP = 2;          // не чаще раза в два хода
const LAW_CHANCE = 0.85;    // почти всегда, когда можно
const LAW_REPEAT = 8;       // отклонённый или отложенный законопроект вернётся не раньше чем через 8 ходов

export function lawEvent(state: GameState): SpecialEvent | null {
  const turn = state.turn + 1;
  if (turn < 2 || isTermEnd(turn) || dueBeat(state)) return null;
  const marks = (state.usedEvents ?? []).filter(u => u.startsWith("law:")).map(u => u.split(":"));
  if (turn - Math.max(-LAW_GAP, ...marks.map(m => Number(m[1]) || 0)) < LAW_GAP) return null;
  const r = seededRandom(hashSeed(state.seed, "law", state.turn));
  if (r() > LAW_CHANCE) return null;
  const inForce = state.laws ?? [];
  const hasBloc = (bloc: Bloc) => state.factions.some(f => f.bloc === bloc);
  const slots = (def: LawDef) => ({ law: def.title });
  // Позиция сторон: авторы и союзники закона — за, противники — против. Отказ и отмена — наоборот.
  const stance = (def: LawDef, author: number, ally: number, foe: number) => {
    const out: Partial<Record<Bloc, number>> = {};
    for (const b of def.allies) out[b] = ally;
    for (const b of def.foes) out[b] = foe;
    out[def.bloc] = author;
    return out;
  };

  // Отмена: закон действует давно, а те, против кого он, озлоблены.
  const angry = inForce.map(l => ({ l, def: lawDef(l.id)! })).filter(({ l, def }) => def && turn - l.since >= 4
    && !marks.some(m => m[2] === "repeal" && m[3] === l.id)
    && Object.entries(effectiveLaw(def, l).drift ?? {}).some(([bloc, d]) => (d ?? 0) < 0 && state.factions.some(f => f.bloc === bloc && f.relation <= -35)));
  if (angry.length && r() < 0.5) {
    const { l, def } = pick(r, angry);
    const foes = state.factions.filter(f => (effectiveLaw(def, l).drift?.[f.bloc] ?? 0) < 0 && f.relation <= -35).map(f => `«${f.name}»`);
    const months = (turn - l.since) * 3;
    const f = (t: string) => fill(t, state, { ...slots(def), months: plural(months, "месяц", "месяца", "месяцев"), who: foes.join(", ") || "Противники закона" });
    return {
      cardId: `law:${turn}:repeal:${def.id}`,
      title: f(REPEAL.title), source: REPEAL.source,
      description: chapter(dateline(state, "parliament"), f(REPEAL.description)),
      isCritical: false, affectedFactions: state.factions.filter(x => def.drift?.[x.bloc]).map(x => x.id).slice(0, 4),
      choices: [
        { id: "a", text: REPEAL.keep.text, hint: REPEAL.keep.hint, tags: def.tags, resolvesCrisis: null, stance: stance(def, 4, 2, -5),
          scene: f(REPEAL.kept), sceneFail: f(REPEAL.keptFail), headline: f(REPEAL.keptHead.ok), headlineFail: f(REPEAL.keptHead.fail) },
        { id: "b", text: REPEAL.repeal.text, hint: REPEAL.repeal.hint, tags: def.veto, resolvesCrisis: null, law: { id: def.id, act: "repeal" }, stance: stance(def, -8, -4, 6),
          scene: f(REPEAL.passed), sceneFail: f(REPEAL.failed), headline: f(REPEAL.head.passed), headlineFail: f(REPEAL.head.failed) },
        { id: "c", text: REPEAL.wait.text, hint: REPEAL.wait.hint, tags: ["delay"], resolvesCrisis: null, stance: Object.fromEntries(def.foes.map(b => [b, -3])),
          scene: f(REPEAL.waitScene), sceneFail: f(REPEAL.waitScene), headline: f(REPEAL.waitHead), headlineFail: f(REPEAL.waitHead) },
      ],
      randomEvent: null,
    };
  }

  // Законопроект: не принят, не противоречит действующим, его автор есть в стране, давно не вносился.
  const offered = (id: string) => marks.some(m => m[2] === id && turn - Number(m[1]) < LAW_REPEAT);
  const bills = LAWS.filter(def => !inForce.some(l => l.id === def.id) && hasBloc(def.bloc) && !offered(def.id)
    && (!def.countries || def.countries.includes(state.country))
    && !def.conflicts?.some(c => inForce.some(l => l.id === c)));
  if (!bills.length) return null;
  const def = pick(r, bills);
  const f = (t: string) => fill(t, state, slots(def));
  const delayScene = f(cycle(BILL.delayScenes, state.seed, "bill-delay", marks.length));
  return {
    cardId: `law:${turn}:${def.id}`,
    title: f(BILL.title), source: BILL.source,
    description: chapter(dateline(state, "parliament"), f(def.pitch)),
    isCritical: false, affectedFactions: state.factions.filter(x => x.bloc === def.bloc || def.drift?.[x.bloc]).map(x => x.id).slice(0, 4),
    choices: [
      { id: "a", text: BILL.enact.text, hint: BILL.enact.hint, tags: def.tags, costReasons: def.costs, resolvesCrisis: null, law: { id: def.id, act: "enact" }, stance: stance(def, 8, 5, -6),
        scene: f(def.passed), sceneFail: f(def.failed), headline: f(def.head.passed), headlineFail: f(def.head.failed) },
      { id: "b", text: BILL.veto.text, hint: BILL.veto.hint, tags: def.veto, costReasons: def.vetoCosts, resolvesCrisis: null, stance: stance(def, -8, -3, 5),
        scene: f(def.vetoed), sceneFail: f(def.vetoed), headline: f(def.head.vetoed), headlineFail: f(def.head.vetoed) },
      { id: "c", text: BILL.delay.text, hint: BILL.delay.hint, tags: ["delay"], resolvesCrisis: null, stance: { [def.bloc]: -3 },
        scene: delayScene, sceneFail: delayScene, headline: f(BILL.delayHead), headlineFail: f(BILL.delayHead) },
    ],
    randomEvent: null,
  };
}

// ── Вопрос о сроках ──────────────────────────────────────────────────────────
// За полгода до президентских выборов: остаться, уйти, передать власть или взять её силой.
// Какие пути открыты, решают конституция страны и то, как лидер правил до сих пор.
export function termsEvent(state: GameState): SpecialEvent | null {
  const turn = state.turn + 1;
  if (localTurn(turn) !== TERMS_TURN || state.path) return null;
  const rule = termRule(state.country);
  const reign = reignOf(state);
  const options = pathOptions(state).filter(o => o.lock !== "na");
  const open = options.filter(o => !o.lock);
  const reason = (o: PathOption) => o.id === "run" ? (o.lock === "limit" ? LOCKED.limit : LOCKED.run)
    : o.id === "zeroing" ? LOCKED.zeroing[rule] ?? null
    : o.id === "rokirovka" ? LOCKED.rokirovka[o.lock === "lost" ? "lost" : "rule"]
    : o.id === "successor" ? LOCKED.successor
    : o.id === "postpone" ? LOCKED.postpone[o.lock === "force" ? "force" : "law"]
    : o.id === "dictatorship" ? LOCKED.dictatorship[o.lock === "force" ? "force" : "military"] : null;
  const locked = options.filter(o => o.lock).map(reason).filter((x): x is string => !!x);
  const choices: Choice[] = open.map((o, i) => {
    // Тот же путь в другой должности звучит иначе: премьер идёт в списке, правитель продлевает или возвращает выборы.
    const t = { ...PATHS[o.id], ...PATHS_AS[`${reign.office}:${o.id}`] };
    const heir = o.successor;
    const f = (x: string) => fill(x, state, { next: termOrdinal(reign.term + 1), ...(heir ? { name: heir.name, role: heir.role } : {}) });
    const base = {
      id: "abcdefg"[i], text: f(t.text), hint: f(t.hint), resolvesCrisis: null, path: o.id,
      ...(heir ? { successor: heir.name } : {}),
      scene: f(t.scene), sceneFail: f(t.sceneFail ?? t.scene), headline: f(t.head), headlineFail: f(t.headFail ?? t.head),
    };
    // Обнуление без готовых поправок — законопроект: голоса могут и не найтись.
    if (o.id === "zeroing" && o.viaLaw) return { ...base, tags: ["elite_deal", "propaganda"] as ActionTag[], law: { id: "constitution", act: "enact" as const } };
    return {
      ...base, tags: PATH_TAGS[o.id],
      ...(o.id === "zeroing" ? { hint: "поправки уже в силе — суду осталось истолковать их как надо" } : {}),
      deal: pathDeal(o.id, state.factions, heir, reign.office),
    };
  });
  const force = forceFaction(state.factions);
  return {
    cardId: `terms:${turn}`,
    title: TERMS_TEXT.title, source: TERMS_TEXT.source,
    description: chapter(dateline(state),
      fill(reign.term === 0 ? TERMS_TEXT.intro[rule] : TERMS_TEXT.later[reign.office], state, { term: termOrdinalGen(reign.term) }),
      locked.length ? [TERMS_TEXT.lockedHead, ...locked.map(l => `— ${l}`)].join("\n") : null,
      TERMS_TEXT.outro),
    isCritical: false,
    affectedFactions: state.factions.filter(x => ["security", "liberal", "west", "ruling"].includes(x.bloc)).map(x => x.id).slice(0, 4),
    choices,
    council: null,
    special: { kind: "terms", figure: null, faction: force?.id ?? state.factions[0].id },
    randomEvent: null,
  };
}
// Теги подписывают решение для реплик и газет; цену задаёт сделка.
const PATH_TAGS: Record<PathId, ActionTag[]> = {
  run: ["dialogue"], exit: ["dialogue"], zeroing: ["elite_deal"], rokirovka: ["elite_deal"],
  successor: ["elite_deal"], postpone: ["security"], dictatorship: ["repress"],
};

// ── Проверка документов ──────────────────────────────────────────────────────
// Дважды в первом сроке — управленческое совещание. Срочное дело переносит его,
// не превращая выбор в поиск заранее назначенной лжи.
export const inspectTurns = (seed: number) => (seed % 2 ? [4, 14] : [5, 15]);

export function inspectEvent(state: GameState): SpecialEvent | null {
  const turn = state.turn + 1;
  // Сверка докладов — дело первого срока: дальше аппарат уже знает, что вы читаете бумаги.
  const dates = inspectTurns(state.seed);
  const slot = termIndex(turn) === 0 ? calendarSlot(state, 'ins', dates, [dates[1] - 1, TERM]) : null;
  const k = slot === null ? -1 : dates.indexOf(slot);
  if (k < 0 || dueBeat(state)) return null;
  const docs=MANAGEMENT_DOSSIERS.filter(d=>state.factions.some(f=>f.bloc===d.bloc))
    .sort((a,b)=>hashSeed(state.seed,'management',a.id)-hashSeed(state.seed,'management',b.id));
  const doc=docs[k];if(!doc)return null;
  const facIds=state.factions.filter(f=>f.bloc===doc.bloc).map(f=>f.id);
  const choices=doc.options.map((option,i):Choice=>({
    id:['a','b','c'][i],text:option.text,hint:option.hint,tags:['delay'],resolvesCrisis:null,
    deal:{pure:true,res:option.res,factionRel:Object.fromEntries(facIds.map(id=>[id,option.relation])),later:option.later},
    scene:option.scene,sceneFail:option.scene,headline:option.head??`${doc.title}: ${option.text.toLowerCase()}`,headlineFail:option.head??`${doc.title}: ${option.text.toLowerCase()}`,
  }));
  return {cardId:`ins:${slot}:${doc.id}`,title:doc.title,source:'Рабочее совещание',description:chapter(dateline(state),doc.intro),isCritical:false,affectedFactions:facIds,
    choices,council:null,special:{kind:'inspect',figure:null,faction:facIds[0]??''},doc:{facts:doc.facts,lines:doc.lines,author:doc.who,key:null},randomEvent:null};
}

// Также переводит сохранённое дело старого формата в управленческое решение.
export function managementDocument<T extends GameEvent>(event: T): T {
  if (!event.doc) return event;
  const rel=(n:number)=>Object.fromEntries(event.affectedFactions.map(id=>[id,n]));
  const choice=(id:string,text:string,hint:string,res:ResourceDelta,n:number,scene:string,later:Deal['later']):Choice=>({
    id,text,hint,tags:["delay"],resolvesCrisis:null,
    deal:{pure:true,res,factionRel:rel(n),later},scene,sceneFail:scene,
    headline:`«${event.title}»: ${text.toLowerCase()}`,headlineFail:`«${event.title}»: ${text.toLowerCase()}`,
  });
  const title=event.title,who=event.doc.author;
  return {...event,doc:{...event.doc,key:null},choices:[
    choice('a','Запустить программу в текущем графике','Быстрый запуск и поддержка ведомства; сжатый график потребует дополнительных расходов.',{economy:2,politicalCapital:1},3,
      `Вы подписываете график исполнения. ${who} получает полномочия начать работу сегодня. В протоколе остаётся предупреждение аппарата: резерв небольшой, исправлять недочёты придётся по ходу. Министр финансов просит не обещать, что утверждённая смета станет окончательной.`,
      {turns:2,label:`${title}: расходы на ускоренный запуск`,res:{economy:-2,internalLegitimacy:-1},story:'Сжатый график потребовал дополнительных закупок и работы сверхурочно. Ведомство удержало темп, но часть жалоб пришлось разбирать уже после запуска.'}),
    choice('b','Разделить исполнение на этапы','Меньше риска для жителей; медленнее и дороже на старте, ведомство теряет свободу действий.',{economy:-1,politicalCapital:-2,internalLegitimacy:1},-2,
      `Вы оставляете программу в работе, но делите её на этапы. Следующую часть средств ведомство получит после сдачи первой. ${who} предупреждает, что прежний срок придётся пересмотреть. Секретарь записывает новую договорённость: оценивать результат по работающим объектам, а не по закрытым актам.`,
      {turns:2,label:`${title}: первые этапы сданы`,res:{economy:2,internalLegitimacy:1},story:'Первые этапы приняты отдельно. Работа шла медленнее первоначального графика, зато недочёты исправили до расширения программы.'}),
    choice('c','Установить внешний контроль исполнения','Потребует денег и политического капитала; ответственность станет прозрачнее, ведомство потеряет автономию.',{economy:-1,politicalCapital:-3},-4,
      `Вы поручаете независимой группе сопровождать исполнение программы. ${who} остаётся ответственным за результат, но больше не определяет критерии приёмки в одиночку. На совещании спорят о доступе к договорам и о том, кто будет отвечать за задержки. Вы устанавливаете правило: замечания фиксируют до оплаты следующего этапа.`,
      {turns:2,label:`${title}: внешний контроль`,res:{internalLegitimacy:3,politicalCapital:1},story:'Внешняя группа опубликовала ход исполнения и замечания к работе ведомства. Контроль не сделал программу бесплатной, но ответственность за решения стала понятнее.'}),
  ]};
}

// ── Пресс-конференция ────────────────────────────────────────────────────────
// Накануне выборов: три вопроса, подобранных под положение страны, без повторов за партию.
export const PRESS_TURNS = [9, 19];

export function pressEvent(state: GameState): SpecialEvent | null {
  const turn = state.turn + 1;
  const slot = calendarSlot(state, 'prs', PRESS_TURNS, [10, TERM]);
  const k = slot === null ? -1 : PRESS_TURNS.indexOf(localTurn(slot));
  if (k < 0 || dueBeat(state)) return null;
  const asked = new Set((state.usedEvents ?? []).filter(u => u.startsWith("prs:")).flatMap(u => u.split(":")[2].split(",")));
  const r = state.resources;
  // После «вопроса о сроках» выборов может и не быть: тогда о них не спрашивают.
  // Пресс-конференция стоит перед выборами — если они будут: в середине срока парламентские, в конце — главные.
  const ahead = turn - localTurn(turn) + (k === 0 ? 10 : TERM);
  const noVote = !electionKind(ahead, state.path, reignOf(state).office);
  const fits: Record<PressWhen, boolean> = {
    always: true, crisis: state.activeCrises.length > 0, lowEcon: r.economy < 40, lowLegit: r.internalLegitimacy < 40,
    elect: !noVote, pact: (state.pacts ?? []).length > 0, highMil: r.military > 60,
    highRating: computePolls(state.country, state.factions, r).leader >= 45, lowRep: r.externalReputation < 40,
    betrayal: (state.betrayals ?? 0) > 0, arc: !!state.arc && !state.arc.epilogue && state.arc.done.length >= 2,
  };
  const order = (q: { id: string }) => hashSeed(state.seed, "press", turn, q.id);
  const pool = PRESS_QUESTIONS.filter(q => fits[q.when] && !asked.has(q.id));
  // Один вопрос — про то, что происходит в стране сейчас; два других — из всего, что подходит.
  const topical = pool.filter(q => q.when !== "always").sort((a, b) => order(a) - order(b));
  const rest = pool.filter(q => q !== topical[0]).sort((a, b) => order(a) - order(b));
  const picked = [...topical.slice(0, 1), ...rest].slice(0, 3);
  if (picked.length < 3) return null;
  const pactName = state.factions.find(f => f.id === state.pacts?.[0]?.faction)?.name ?? "";
  const questions = picked.map(q => {
    const pensionRepealed = [...state.history].reverse().find(h => h.law?.id === 'pension_reform' && h.law.passed)?.law?.act === 'repeal' && !state.laws?.some(l => l.id === 'pension_reform');
    const transition = state.laws?.find(l => l.id === 'pension_reform')?.transition;
    const enactedPension = q.id === 'pension' && state.laws?.some(l => l.id === 'pension_reform');
    return { id: q.id, who: q.who, topic: q.topic,
      answers: enactedPension ? q.answers.map(a => ({ ...a, text: a.tone === 'honest' ? transition ? '«Повышение сохранили, но тем, кому при принятии закона оставалось не больше года, дали прежний возраст. Это уменьшило экономию фонда»' : '«Я подписал этот закон. Для людей это тяжёлая перемена, и я не стану выдавать её за подарок»' : a.tone === 'hard' ? '«Решение принято: иначе через десять лет платить будет нечем»' : '«Вопросы исполнения вам разъяснит правительство»' })) : q.id === 'pension' && pensionRepealed ? q.answers.map(a => ({ ...a, text: a.tone === 'honest' ? '«Я отменил повышение. Люди получили прежний возраст; бюджет потерял экономию, и я отвечаю за этот выбор»' : a.tone === 'hard' ? '«Отмену провёл я. Но нехватка денег в фонде от этого не исчезла»' : '«Правительство разъяснит последствия отмены»' })) : q.answers,
      text: enactedPension ? transition ? 'После звонка вы сохранили повышение, но ввели льготный выход для переходной группы. Почему уступили только ей?' : 'Вы уже приняли закон о повышении пенсионного возраста. Что скажете людям, которым теперь работать дольше?' : q.id === 'pension' && pensionRepealed ? 'Вы отменили повышение пенсионного возраста. Почему изменили курс и чем замените потерянную экономию?' : fill(q.text, state, { pact: pactName }),
    };
  });
  const skip: Choice = {
    id: "b", text: PRESS_TEXT.skip.text, hint: PRESS_TEXT.skip.hint, tags: ["delay"], resolvesCrisis: null,
    deal: { pure: true, res: { internalLegitimacy: -3, politicalCapital: -2 } },
    scene: PRESS_TEXT.skip.scene, sceneFail: PRESS_TEXT.skip.scene, headline: PRESS_TEXT.skip.head, headlineFail: PRESS_TEXT.skip.head,
  };
  return {
    cardId: `prs:${slot}:${picked.map(q => q.id).join(",")}`,
    title: noVote ? PRESS_TEXT.titleNoVote[state.path?.id ?? reignOf(state).how ?? ""] ?? PRESS_TEXT.titleNoVote.none : PRESS_TEXT.title[k],
    source: "Пресс-служба",
    description: chapter(dateline(state, "press"), PRESS_TEXT.intro),
    isCritical: false,
    affectedFactions: [],
    // Итоговое решение собирается из ответов (pressChoice); до тех пор доступна только отмена.
    choices: [{ ...skip, id: "a" }, skip],
    council: null,
    special: { kind: "press", figure: null, faction: "" },
    press: { outlet: "", questions },
    randomEvent: null,
  };
}

// Итог пресс-конференции: сумма эффектов ответов, тон большинства, сцена и цитата в заголовок.
// picks — номер ответа на каждый вопрос; -1 — промолчали, не уложившись во время.
export function pressChoice(state: GameState, picks: number[]): Choice {
  const qs = state.currentEvent?.press?.questions ?? [];
  const res: Record<string, number> = {}, relBloc: Record<string, number> = {};
  const tones: string[] = [];
  const lines: string[] = [PRESS_TEXT.open];
  let quote = "", strongest = -1;
  qs.forEach((q, i) => {
    const about = `${/^[аеиоуэ]/i.test(q.topic) ? "об" : "о"} ${q.topic}`;
    const a = q.answers[picks[i]];
    if (!a) {
      tones.push("evasive");
      res.internalLegitimacy = (res.internalLegitimacy ?? 0) - 2;
      lines.push(fill(PRESS_TEXT.silent, state, { about }));
      return;
    }
    tones.push(a.tone);
    for (const [k, v] of Object.entries(a.res)) res[k] = (res[k] ?? 0) + (v ?? 0);
    for (const [b, v] of Object.entries(a.rel)) relBloc[b] = (relBloc[b] ?? 0) + (v ?? 0);
    lines.push(fill(PRESS_TEXT.answer, state, { about, text: a.text }));
    const weight = Object.values(a.res).reduce((x, y) => x + Math.abs(y ?? 0), 0);
    if (weight > strongest) { strongest = weight; quote = a.text; }
  });
  const count = (t: string) => tones.filter(x => x === t).length;
  // Тон пресс-конференции — тот, что прозвучал хотя бы дважды; иначе зал запомнит смешанное впечатление.
  const tone = (["honest", "hard", "evasive"] as const).find(t => count(t) >= 2) ?? "mixed";
  lines.push(nth(PRESS_TEXT.close[tone], calendarEpisode(state, PRESS_TURNS)));
  const factionRel: Record<string, number> = {};
  for (const f of state.factions) if (relBloc[f.bloc]) factionRel[f.id] = relBloc[f.bloc];
  const headline = quote && quote.length <= 70 ? `Президент: ${quote}` : "Президент ответил на вопросы журналистов";
  const scene = lines.join(" ");
  return {
    id: "p", text: "Ответить на вопросы журналистов", hint: "", resolvesCrisis: null,
    tags: [tone === "hard" ? "propaganda" : tone === "evasive" ? "delay" : "dialogue"],
    deal: { pure: true, res, factionRel },
    scene, sceneFail: scene, headline, headlineFail: headline,
  };
}

// ── Звонок по защищённой линии ───────────────────────────────────────────────
// Дважды за партию звонит человек из окружения. Подход, который подходит его характеру,
// делает разговор дешёвым; не тот подход — дорогим. Первым звонит самый недовольный.
export const CALL_TURNS = [11, 17];
const CONCESSION: Record<Bloc, keyof GameState["resources"]> = {
  security: "economy", business: "economy", church: "politicalCapital", liberal: "politicalCapital", west: "economy",
  russia: "externalReputation", nationalist: "externalReputation", regional: "economy", ruling: "politicalCapital",
};

export function callEvent(state: GameState): SpecialEvent | null {
  const slot = calendarSlot(state, 'call', CALL_TURNS, [16, TERM]);
  const k = slot === null ? -1 : CALL_TURNS.indexOf(localTurn(slot));
  if (k < 0 || dueBeat(state)) return null;
  const called = new Set((state.usedEvents ?? []).filter(u => u.startsWith("call:")).map(u => u.split(":")[2]));
  const negotiated = pensionCall(state, slot!, called);
  if (negotiated) return negotiated;
  const facOf = (f: Figure) => state.factions.find(x => x.id === f.faction);
  const pool = state.keyFigures.filter(f => f.name !== state.arc?.target && !called.has(f.id) && facOf(f));
  if (!pool.length) return null;
  const fig = k === 0
    ? [...pool].sort((a, b) => a.relation - b.relation)[0]
    : [...pool].sort((a, b) => hashSeed(state.seed, "call", a.id) - hashSeed(state.seed, "call", b.id))[0];
  const fac = facOf(fig)!;
  const slots = { name: fig.name, role: lower(fig.role), camp: fac.name };
  const selectedDemand = cycle(CALL_DEMANDS[fac.bloc], state.seed, `demand${fig.id}`, k);
  const demand = typeof selectedDemand === 'string' ? selectedDemand : state.laws?.some(l => l.id === selectedDemand.law) ? selectedDemand.text : selectedDemand.otherwise;
  const hang: Choice = {
    id: "b", text: CALL_TEXT.hangup.text, hint: CALL_TEXT.hangup.hint, tags: ["delay"], resolvesCrisis: null,
    deal: { pure: true, figure: fig.id, figureRel: -10, factionRel: { [fac.id]: -3 } },
    scene: fill(CALL_TEXT.hangup.scene, state, slots), sceneFail: fill(CALL_TEXT.hangup.scene, state, slots),
    headline: CALL_TEXT.hangup.head, headlineFail: CALL_TEXT.hangup.head,
  };
  return {
    cardId: `call:${slot}:${fig.id}`,
    title: CALL_TEXT.title,
    source: "Защищённая линия",
    description: chapter(dateline(state, "call"), fill(CALL_TEXT.intro, state, slots)),
    isCritical: false,
    affectedFactions: [fac.id],
    // Итог собирается из выбранного подхода и развязки (callChoice); до тех пор можно не брать трубку.
    choices: [{ ...hang, id: "a" }, hang],
    council: null,
    special: { kind: "call", figure: fig.id, faction: fac.id },
    call: { figure: fig.id, trait: traitOf(state.seed, fig, fac.bloc), demand: fill(demand, state) },
    randomEvent: null,
  };
}

// Ответ собеседника на подход — один и тот же в интерфейсе и в тексте хода.
export const callReply = (seed: number, call: { figure: string }, approach: Approach, ok: boolean) =>
  cycle(CALL_REPLIES[approach][ok ? "ok" : "no"], seed, `reply${call.figure}${approach}`, 0);

// Сработает ли подход на этого человека.
export const approachWorks = (trait: string, approach: Approach) => (APPROACH_WORKS[approach] as string[]).includes(trait);

export function callChoice(state: GameState, approach: Approach, ending: (typeof CALL_ENDINGS)[number]["id"]): Choice {
  const call = state.currentEvent!.call!;
  if (call.negotiation) throw new Error('Выберите конкретное решение по закону');
  const fig = state.keyFigures.find(f => f.id === call.figure)!;
  const fac = state.factions.find(f => f.id === fig.faction)!;
  const slots = { name: fig.name, role: lower(fig.role), camp: fac.name };
  const ok = approachWorks(call.trait, approach);
  const reply = callReply(state.seed, call, approach, ok);
  const T = CALL_TEXT;
  const table: { fig: number; fac: number; res: Record<string, number> } = {
    deal:   ok ? { fig: 15, fac: 6, res: { politicalCapital: -1 } } : { fig: 8, fac: 6, res: { politicalCapital: -3, [CONCESSION[fac.bloc]]: -3 } },
    refuse: ok ? { fig: -5, fac: -3, res: { politicalCapital: 1 } } : { fig: -15, fac: -8, res: {} },
    later:  ok ? { fig: 0, fac: 0, res: {} } : { fig: -5, fac: -2, res: {} },
  }[ending];
  // Предложить должность стоит личных ресурсов, давление без успеха — лишний враг.
  const res: Record<string, number> = { ...table.res };
  if (approach === "offer") res.personalResource = (res.personalResource ?? 0) - 2;
  const figRel = table.fig + (approach === "pressure" && !ok ? -5 : 0);
  const scene = [
    `${fig.name} начинает без приветствия: ${fill(call.demand, state, slots)}`,
    `Вы ${APPROACH_SAY[approach]}. ${reply}.`,
    fill(nth(T.outcome[`${ending}_${ok ? "ok" : "no"}`], calendarEpisode(state, CALL_TURNS)), state, slots),
  ].join(" ");
  const head = fill(T.heads[ending], state, slots);
  return {
    id: "p", text: "Разговор по защищённой линии", hint: "", resolvesCrisis: null,
    tags: [ending === "deal" ? "elite_deal" : ending === "refuse" ? "security" : "delay"],
    deal: {
      pure: true, figure: fig.id, figureRel: figRel, factionRel: table.fac ? { [fac.id]: table.fac } : undefined, res,
      ...(ending === "later" ? { later: { turns: 2, label: T.later.label, res: { politicalCapital: -2 }, story: fill(T.later.story, state, slots) } } : {}),
    },
    scene, sceneFail: scene, headline: head, headlineFail: head,
  };
}
const APPROACH_SAY: Record<Approach, string> = {
  offer: "предлагаете взамен должность и бюджет",
  principle: "говорите о принципах и о стране",
  pressure: "напоминаете, кто здесь власть",
  numbers: "раскладываете цифры: кто и что потеряет",
};

// ── Предвыборный бюджет ──────────────────────────────────────────────────────
// На восьмом ходу, за два хода до парламентских выборов: 10 млрд на пять статей, можно занять ещё 3.
export const BUDGET_TURN = 8;

export function budgetEvent(state: GameState): SpecialEvent | null {
  const slot = calendarSlot(state, 'budget', [BUDGET_TURN], [10]);
  if (slot === null || dueBeat(state)) return null;
  const T = BUDGET_TEXT;
  const skip: Choice = {
    id: "b", text: T.skip.text, hint: T.skip.hint, tags: ["delay"], resolvesCrisis: null,
    deal: { pure: true, res: { politicalCapital: -3, internalLegitimacy: -1 } },
    scene: T.skip.scene, sceneFail: T.skip.scene, headline: T.skip.head, headlineFail: T.skip.head,
  };
  return {
    cardId: `budget:${slot}`,
    title: T.title,
    source: "Министерство финансов",
    description: chapter(dateline(state), T.intro),
    isCritical: false,
    affectedFactions: [],
    // Итог собирается из распределения (budgetChoice); до тех пор можно жить по прошлогоднему.
    choices: [{ ...skip, id: "a" }, skip],
    council: null,
    special: { kind: "budget", figure: null, faction: "" },
    budget: { total: BUDGET_TOTAL },
    randomEvent: null,
  };
}

// Бюджет по распределению: alloc — миллиарды по статьям, debt — заняты ли ещё 3 млрд.
export function budgetChoice(state: GameState, alloc: Record<string, number>, debt: boolean): Choice {
  const T = BUDGET_TEXT;
  const res: Record<string, number> = {}, factionRel: Record<string, number> = {};
  const n = (id: string) => Math.max(0, Math.min(BUDGET_MAX, Math.round(alloc[id] ?? 0)));
  for (const item of BUDGET_ITEMS) {
    const p = n(item.id);
    res[item.res] = (res[item.res] ?? 0) + BUDGET_RES[p];
    const bloc = item.blocs.find(b => state.factions.some(f => f.bloc === b));
    if (bloc && BUDGET_REL[p]) for (const f of state.factions) if (f.bloc === bloc) factionRel[f.id] = (factionRel[f.id] ?? 0) + BUDGET_REL[p];
  }
  for (const k of Object.keys(res)) if (!res[k]) delete res[k];
  const sorted = [...BUDGET_ITEMS].sort((a, b) => n(b.id) - n(a.id));
  const top = sorted[0], low = sorted[sorted.length - 1];
  const even = n(top.id) - n(low.id) <= 1;
  // Порядковый номер бюджета в партии: выборы каждые десять ходов, бюджет — перед ними.
  const nth = <T,>(list: T[], salt: string) => cycle(list, state.seed, salt, Math.floor(state.turn / 10));
  const lines = [nth(T.open, "budget-open")];
  if (even) lines.push(nth(T.even, "budget-even"));
  else {
    lines.push(fill(T.most, state, { label: top.label, n: String(n(top.id)) }), top.top);
    lines.push(fill(T.least, state, { label: low.label, n: String(n(low.id)) }));
    if (n(low.id) <= 1) lines.push(low.low);
  }
  if (debt) lines.push(nth(T.debt, "budget-debt"));
  const head = debt ? T.headDebt : even ? T.headEven : top.head;
  const scene = lines.join(" ");
  return {
    id: "p", text: "Утвердить бюджет на год", hint: "", resolvesCrisis: null,
    tags: [even ? "dialogue" : top.tag],
    deal: {
      pure: true, res, factionRel,
      ...(debt ? { later: { turns: 3, label: T.later.label, res: { economy: -6, externalReputation: -2 }, story: T.later.story } } : {}),
    },
    scene, sceneFail: scene, headline: head, headlineFail: head,
  };
}
export const budgetLimit = (debt: boolean) => BUDGET_TOTAL + (debt ? BUDGET_DEBT : 0);

function buildEvent(state: GameState): GameEvent & { cardId?: string } {
  const terms = termsEvent(state);
  if (terms) return terms;
  const beat = beatEvent(state);
  if (beat) return beat;
  const publicQuestion = mandatePublicEvent(state);
  if (publicQuestion) return publicQuestion;
  // Самое раннее ожидающее дело первым получает освободившийся квартал.
  const interlude = [inspectEvent(state), pressEvent(state), callEvent(state), budgetEvent(state)]
    .filter((event): event is SpecialEvent => event !== null)
    .sort((a, b) => Number(a.cardId.split(':')[1]) - Number(b.cardId.split(':')[1]))[0];
  if (interlude) return interlude;
  const special = specialEvent(state);
  if (special) return special;
  const bill = lawEvent(state);
  if (bill) return bill;
  const r = seededRandom(hashSeed(state.seed, "event", state.turn));
  let card = pickCard(state, r);
  const crisisId = state.activeCrises[0]?.id ?? null;
  // Обострение кризиса: описание и ходы под конкретный тип кризиса.
  const crisisKey = Object.keys(state.activeCrises[0]?.resourceDrain ?? {})[0] as keyof typeof CRISIS_ESCALATE | undefined;
  const escalated = card.id === "crisis_escalates" && !!crisisKey && !!CRISIS_ESCALATE[crisisKey];
  if (escalated) card = { ...card, ...CRISIS_ESCALATE[crisisKey!] };
  const blocs = new Set(card.choices.flatMap(c => c.tags.flatMap(t => Object.keys(ACTIONS[t].rel))));
  const random = state.turn > 0 && r() < 0.28 ? pick(r, RANDOM_EVENTS) : null;
  return {
    cardId: card.id,
    title: fill(card.title, state),
    source: card.source,
    description: chapter(dateline(state, SOURCE_PLACE[card.source] ?? (warningLevel(state) === "critical" ? "crisis" : "desk")), fill(card.description, state), state.turn > 0 && EVENT_EXT[card.id] && fill(EVENT_EXT[card.id], state)),
    isCritical: warningLevel(state) === "critical",
    affectedFactions: state.factions.filter(f => blocs.has(f.bloc)).slice(0, 4).map(f => f.id),
    choices: card.choices.map((c, i) => ({
      id: ["a", "b", "c", "d"][i], text: fill(c.text, state), hint: c.hint, tags: c.tags,
      ...(c.costReasons ? { costReasons: Object.fromEntries(Object.entries(c.costReasons).map(([k, v]) => [k, fill(v!, state)])) } : {}),
      resolvesCrisis: c.resolves ? crisisId : null,
      ...(escalated
        ? { scene: fill(CRISIS_SCENES[crisisKey!][i][0], state), sceneFail: fill(CRISIS_SCENES[crisisKey!][i][1], state) }
        : {
          ...(SCENES[card.id]?.[i] ?? c.scene ? { scene: fill(SCENES[card.id]?.[i] ?? c.scene!, state) } : {}),
          ...(FAIL_SCENES[card.id]?.[i] ?? c.fail ? { sceneFail: fill(FAIL_SCENES[card.id]?.[i] ?? c.fail!, state) } : {}),
        }),
      ...headlines(escalated ? CRISIS_HEADLINES[crisisKey!]?.[i] : CARD_HEADLINES[card.id]?.[i] ?? c.head, state),
    })),
    council: null,
    randomEvent: random ? { title: random.title, description: random.description, resourceEffect: random.effect } : null,
  };
}

// В ход выборов главная новость — выборы.
function electionHeadline(e: NonNullable<ReturnType<typeof planTurn>["election"]>) {
  const pres = e.kind === "president";
  if (e.outcome === "won") return pres ? `Президент переизбран: ${e.leader}% против ${e.top.share}%` : `Партия власти удержала парламент: ${e.leader}%`;
  if (e.outcome === "impeached") return `Разгром на выборах: «${e.top.name}» берёт парламент и готовит импичмент`;
  return pres ? `Власть уходит: «${e.top.name}» побеждает на выборах` : `«${e.top.name}» выигрывает парламентские выборы`;
}

// Развязка «вопроса о сроках» в последний ход: что стало с выбранным путём.
function finaleOf(state: GameState, plan: ReturnType<typeof planTurn>): { head: string; text: string } | null {
  const { election: e } = plan;
  const end = plan.termResult?.outcome ?? plan.endType;
  const office = reignOf(state).office;
  const path = plan.path ?? (isTermEnd(state.turn + 1) && office === "ruler" ? { id: reignOf(state).how ?? "dictatorship", turn: state.turn + 1 } : null);
  if (!path || !isTermEnd(state.turn + 1)) return null;
  if (!isSurvival(end) && end !== "betrayed") return null;
  const won = e?.outcome === "won";
  // Президент идёт на выборы — обычная ночь подсчёта; у премьера и у правителя, вернувшего выборы, — своя развязка.
  if (path.id === "run" && office === "president") return null;
  const key = path.id === "run" ? `${office === "premier" ? "rokirovka" : "return"}:${won ? "won" : "lost"}`
    : path.id === "exit" ? (path.from ? `exit:${path.from}` : "exit")
    : path.id === "postpone" || path.id === "dictatorship" ? (office === "ruler" ? `${path.id}:keep` : path.id)
    : path.id === "successor" ? (end === "betrayed" ? "successor:betrayed" : won ? "successor:won" : "successor:lost")
    : `${path.id}:${won ? "won" : "lost"}`;
  const fin = FINALE[key] ?? FINALE.exit;
  const slots = { name: path.successor ?? "", pct: String(e?.leader ?? 0), rival: e?.top.name ?? "", rivalPct: String(e?.top.share ?? 0) };
  return { head: fill(fin.head, state, slots), text: fill(fin.text, state, slots) };
}

// Заголовок газеты к решению: при успехе и при провале.
const headlines = (pair: HeadlinePair | undefined, state: GameState) =>
  pair ? { headline: fill(pair[0], state), headlineFail: fill(pair[1], state) } : {};

const MAX_ECHOES = 2;
// Ходы 2, 4 и 6: продолжение выбранного пути между ранними эпизодами.
// Флаг хранит намерение и при провале, поэтому отдельно проверяем результат в хронике.
export function earlyArcHook(state: GameState): string | null {
  const turn = localTurn(state.turn + 1);
  if (![2, 4, 6].includes(turn) || !state.arc || state.currentEvent?.beat || state.arc.epilogue) return null;
  const thread = EARLY_THREADS[state.arc.id];
  const beat = state.arc.done.at(-1);
  if (!thread || beat !== (turn === 2 ? 1 : 3)) return null;
  const result = state.history[termIndex(state.turn + 1) * TERM + beat - 1];
  if (!result || result.success === undefined) return null;
  const flag = state.arc.flags.at(-1);
  const text = result.success === false ? thread.failed[turn === 2 ? 0 : turn === 4 ? 1 : 2]
    : turn === 2 ? thread.opening[flag ?? ""] : thread.followUp[flag ?? ""]?.[turn === 4 ? 0 : 1];
  return text ? fill(text, state) : null;
}

// «Аукается апрельское дело «Студенты захватили университет».» — откуда пришло последствие.
function echoLead(state: GameState, m: { from?: number; event?: string }): string {
  if (m.from === undefined || !m.event) return "";
  const adj = MONTHS_ADJ[turnDate(state.seed, COUNTRIES[state.country].startYear, m.from).month];
  return m.event.includes("«") ? `Аукается ${adj} решение. ` : `Аукается ${adj} дело «${m.event}». `;
}

// Эхо прошлого решения — авторская фраза. Если то же эхо уже звучало в партии, берётся следующий вариант.
const maturedStory = (label: string, times: number) => {
  const first = [...Object.values(DELAYED), WEAK_ADVISOR_DELAYED].find(d => d?.label === label)?.story ?? `Аукнулось прошлое решение: ${label.toLowerCase()}.`;
  const all = [first, ...(ECHOES[label] ?? [])];
  return all[times % all.length];
};

// Строки об опросах: доверие растёт или падает — каждый раз немного по-разному.
const POLLS_UP = [
  "Утренние опросы ложатся на стол, и социолог впервые за долгое время позволяет себе улыбнуться: доверие растёт.",
  "Свежий замер приходит раньше обычного: цифры поползли вверх, и пресс-служба просит разрешения их опубликовать.",
  "Социологи звонят сами, что бывает редко: рост виден даже в регионах, где за вас не голосовали никогда.",
  "В штабе вешают на стену новый график. Линия впервые за месяц смотрит вверх.",
  "Таксисты в столице, которых опрашивает ваша пресс-служба, впервые говорят о вас без мата. Для пресс-службы это лучший индикатор.",
  "Даже оппозиционный телеканал вынужден признать в вечернем выпуске: рейтинг президента растёт.",
  "Социолог приносит замер лично и задерживается в дверях: «Такого прироста я не видел с прошлых выборов».",
  "На рынке в рабочем районе продавщица говорит в камеру: «Этот хоть что-то делает». Пресс-служба пересылает вам ролик трижды.",
];
const POLLS_DOWN = [
  "Утренние опросы ложатся на стол молча. Социолог не поднимает глаз. Цифры говорят сами.",
  "Новый замер приносят без сопроводительной записки — её и не нужно. Доверие проседает.",
  "Пресс-служба просит не публиковать свежий опрос. Цифры такие, что их лучше пересчитать дважды.",
  "Социологи осторожно пишут «отрицательная динамика». В переводе на обычный язык — люди отворачиваются.",
  "Опрос показывает то, что вы и так чувствуете по лицам в зале: доверие уходит, и уходит быстро.",
  "Ваш портрет на остановке у министерства кто-то разрисовал ночью. Дворники стирают его к утру, социологи — нет.",
  "Штаб просит отменить поездку в регионы: по свежим цифрам там вас встретят не цветами.",
  "Рейтинг проседает второй замер подряд. Пресс-секретарь впервые не находит, как это подать.",
];

// ── Итог хода ────────────────────────────────────────────────────────────────
// Что игрок сделал с особым делом: провёл его или отказался. Реплики и газета пишут о том, что случилось.
// Пресс-конференция, звонок и бюджет проходят вариантом «p», остальные варианты — отказ; у доклада «a» — подпись не глядя.
export function specialAct(state: GameState, choice: Choice): SpecialAct | null {
  const kind = state.currentEvent?.special?.kind;
  if (state.currentEvent?.call?.negotiation) return null;
  if (kind === "inspect") return choice.id === "a" ? "inspect_sign" : "inspect";
  if (kind === "press" || kind === "call" || kind === "budget") return choice.id === "p" ? kind : `${kind}_skip`;
  return null;
}

// Что сделали с законом: провели, отклонили, отменили или отстояли.
function lawActOf(c: Choice): LawAct | null {
  if (c.law) return c.law.act;
  if (c.text === BILL.veto.text) return "veto";
  if (c.text === REPEAL.keep.text) return "keep";
  return null;
}

// Деловая газета пишет о деньгах, только когда решение и было о деньгах.
const MONEY_TAGS: ActionTag[] = ["social", "austerity", "investment", "elite_deal", "anticorruption", "pro_russia", "pro_west"];

function buildNarration(state: GameState, choiceId: string): Narration {
  const plan = planTurn(state, choiceId);
  const r = seededRandom(hashSeed(state.seed, "narr", state.turn, choiceId));
  const total = RES_CONFIG.reduce((s, c) => s + plan.resources[c.key] - state.resources[c.key], 0);
  const tone = !plan.success ? "fail" : total >= 6 ? "good" : total <= -6 ? "bad" : "mixed";
  const pollsBefore = computePolls(state.country, state.factions, state.resources).leader;
  const pollsAfter = computePolls(state.country, plan.factions, plan.resources).leader;

  // Глава хода: сцена → последствия → «тем временем» → крючок интриги.
  const arc = plan.choice.arc;
  // У эпизодов интриги провал описан нейтрально: общие тексты по тегам написаны под другие ситуации.
  const failLine = () => pick(r, COUNCIL_OUTCOME[plan.choice.tags[0]].fail);
  let scene: string;
  if (arc) scene = plan.success ? arc.ok : arc.fail ?? failLine();
  else if (!plan.success && plan.choice.sceneFail) scene = plan.choice.sceneFail;
  else if (plan.choice.scene) {
    const fails = [...new Set(plan.choice.tags.map(t => pick(r, COUNCIL_OUTCOME[t].fail)))];
    scene = plan.success ? plan.choice.scene : plan.choice.sceneFail ?? fails.join(" ");
  }
  else {
    // У предложений совета нет авторских сцен — берём итоги, которые подходят к любому делу.
    const lines = plan.choice.advisor ? COUNCIL_OUTCOME : TAG_LINES;
    scene = plan.choice.tags.map(tag => pick(r, lines[tag][plan.success ? "ok" : "fail"])).join(" ");
  }

  const after: string[] = [];
  if (plan.worldStory) after.push(plan.worldStory);
  let electionLine: string | null = null;
  if (plan.resolvedCrisis && !arc) after.push(`Кризис «${plan.resolvedCrisis}» наконец отступает. В ситуационном центре впервые за много дней кто-то шутит.`);
  const echoed: Record<string, number> = { ...(state.echoes ?? {}) };
  // Эхо прошлых решений: сначала — какое именно решение аукнулось, чтобы связь была видна. Не больше двух за ход:
  // газета, в которой аукается всё сразу, читается как список.
  for (const m of plan.matured.slice(0, MAX_ECHOES)) {
    const story = m.story || maturedStory(m.label, (echoed[m.label] = (echoed[m.label] ?? 0) + 1) - 1);
    after.push(`${echoLead(state, m)}${story}`);
  }
  if (plan.election) {
    const e = plan.election;
    electionLine = (e.outcome === "won"
      ? e.kind === "president"
        ? `${ELECTION_LABEL[e.kind]}. Последний регион досчитывают к трём часам ночи: ${e.leader}% против ${e.top.share}% у «${e.top.name}». ${upper(termOrdinal(reignOf(state).term + 1))} срок. Вы долго стоите у окна резиденции и смотрите на площадь, где уже начинают праздновать.`
        : `${ELECTION_LABEL[e.kind]}. В штабе открывают шампанское в 23:40, когда приходят данные из последнего региона: ${e.leader}% против ${e.top.share}% у «${e.top.name}». Вы выходите к сторонникам и впервые за месяц улыбаетесь не для камер.`
      : `${ELECTION_LABEL[e.kind]}. К полуночи всё ясно: «${e.top.name}» — ${e.top.share}%, у вас ${e.leader}%. В штабе молча выключают телевизоры. Кто-то уже собирает вещи.`);
  }
  const news = plan.pactNews;
  for (const name of news.kept) after.push(fill(cycle(PACT_KEPT_LINE, state.seed, "kept", state.turn), state, { camp: name }));
  for (const name of news.broken) after.push(fill(cycle(PACT_BROKEN_LINE, state.seed, "broken", state.betrayals ?? 0), state, { camp: name }));
  // Строка об опросах — если сцена сама уже не говорит о рейтинге: два разных числа в одной заметке — небрежность.
  if (Math.abs(pollsAfter - pollsBefore) >= 4 && !/рейтинг|опрос|замер/i.test(scene)) after.push(cycle(pollsAfter > pollsBefore ? POLLS_UP : POLLS_DOWN, state.seed, `polls${pollsAfter > pollsBefore}`, state.turn));

  // «Тем временем»: персонаж, чьё личное отношение изменилось сильнее всего.
  // Антагонист интриги и герой особого дела не комментируют собственные эпизоды — они в них участники.
  const subject = state.currentEvent?.special?.figure;
  // Антагонист интриги живёт своей линией: в репликах и параллельных сценах его нет.
  // Кто появлялся в двух прошлых главах, в этой отдыхает: один и тот же человек каждый ход надоедает.
  const recent = new Set(state.history.slice(-2).flatMap(h => h.cast ?? []));
  const cast = state.keyFigures.filter(f => f.name !== state.arc?.target && f.id !== subject && !recent.has(f.name));
  const delta = (f: (typeof cast)[number]) => {
    const next = plan.keyFigures.find(x => x.id === f.id);
    return next && next.name === f.name ? next.relation - f.relation : 0;
  };
  // У закона есть стороны: за него говорят его сторонники, против — противники; остальным до него дела нет.
  const stanceOf = (f: (typeof cast)[number]) => plan.choice.stance?.[state.factions.find(x => x.id === f.faction)?.bloc ?? "liberal"];
  const onSide = (f: (typeof cast)[number], sign: number) => !plan.choice.stance || Math.sign(stanceOf(f) ?? 0) === sign;
  // Послы и иностранный бизнес появляются, только когда решение касается их столиц.
  const concerns = (f: (typeof cast)[number]) => {
    const bloc = state.factions.find(x => x.id === f.faction)?.bloc;
    // Доклады, бюджет, звонки — дела внутренней кухни: их обсуждают власть и элиты; пресс-конференцию — ещё и оппозиция.
    const sa = specialAct(state, plan.choice);
    if (sa && !["power", "elite", ...(sa.startsWith("press") ? ["outsider"] : [])].includes(roleGroup(f.id))) return false;
    if (bloc !== "west" && bloc !== "russia") return true;
    return plan.choice.stance ? !!plan.choice.stance[bloc] : plan.choice.tags.some(t => ACTIONS[t].rel[bloc]);
  };
  const moved = [...cast]
    .map(f => ({ f, d: delta(f) }))
    .filter(x => Math.abs(x.d) >= 3 && concerns(x.f) && onSide(x.f, Math.sign(x.d)))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  // Свой человек или червоточина иногда напоминают о себе вместо обычной реплики.
  const facOf = (f: (typeof cast)[number]) => state.factions.find(x => x.id === f.faction);
  const bonded = state.turn % 3 === 2 ? cast.find(f => ["insider", "mole"].includes(bondOf(f, facOf(f)) ?? "")) : undefined;
  // Что человек делает, зависит от его места: генерал не созывает митинг, посол не голосует в комитетах.
  const movedGroup = moved && roleGroup(moved.f.id);
  const intercutPool = moved ? INTERCUTS[movedGroup!][moved.d > 0 ? "warm" : "cold"] : [];
  // В ночь выборов говорит самый близкий к вам человек — о результате, а не о решении дня.
  const closest = plan.election ? [...state.keyFigures].filter(f => f.name !== state.arc?.target && f.name !== plan.path?.successor)
    .sort((x, y) => y.relation - x.relation)[0] : undefined;
  const intercut = closest
    ? fill(cycle(ELECTION_NIGHT[plan.election!.outcome === "won" ? "won" : "lost"][roleGroup(closest.id)], state.seed, "elnight", state.turn), state, { name: closest.name, role: lower(closest.role) })
    : bonded
    ? fill(cycle(bondOf(bonded, facOf(bonded)) === "insider" ? INSIDER_LINES : MOLE_LINES, state.seed, "bond", state.turn), state, { name: bonded.name, camp: facOf(bonded)?.name ?? "" })
    : moved ? fill(cycle(intercutPool, state.seed, `ic${moved.d > 0}${movedGroup}`, state.turn)
      .replace(/^Тем временем /, `${cycle(MEANWHILE, state.seed, "meanwhile", state.turn)} `), state,
    { name: moved.f.name, role: lower(moved.f.role) }) : null;

  // Нить интриги: между эпизодами — зловещая строка-предвестие.
  const arcDef = ARCS.find(a => a.id === state.arc?.id);
  // Через ход и без повторов: предвестие должно тревожить, а не надоедать.
  const hookIdx = (localTurn(state.turn + 1) - 2) / 2;
  // После развязки интрига молчит: ни предвестий, ни перехватов.
  const arcOpen = !!arcDef && (state.arc?.done.length ?? 0) < arcDef.beats.length;
  const hook = arcDef && arcOpen && !arc && !plan.endType && state.turn % 2 === 1 && hookIdx < arcDef.hooks.length
    ? earlyArcHook(state) ?? fill(cycle(arcDef.hooks, state.seed, "hook", hookIdx), state) : null;
  const died = plan.endType === "died" ? { head: pick(r, DIED.head), text: pick(r, DIED.text) } : null;
  const finale = died ?? finaleOf(state, plan);
  const parts = [scene, ...after, finale?.text ?? electionLine, intercut, hook];

  // То, что уже звучало в партии, не повторяется, пока в пуле есть свежие варианты.
  const heard = new Set(state.history.flatMap(h => h.heard ?? []));
  const said: string[] = [];
  const fresh = (pool: string[], salt: string, idx: number) => {
    const pickd = [...pool.keys()].map(i => cycle(pool, state.seed, salt, idx + i)).find(x => !heard.has(x)) ?? cycle(pool, state.seed, salt, idx);
    said.push(pickd);
    return pickd;
  };
  // Говорит тот, кого решение задело сильнее всех, — и говорит о сути решения:
  // о том его аспекте, который бьёт по его лагерю или играет ему на руку. Послы — языком нот.
  const voice = (f: (typeof cast)[number], sign: number, q: string) => {
    const say = cycle(/посол/i.test(f.role) ? SAY_DIPLOMAT : SAY, state.seed, `say${sign}`, state.turn);
    return fill(say, state, { name: f.name, role: lower(f.role), q }).replace(/([?!])», —/, "$1» —").replace(/([?!])»\.$/, "$1»");
  };
  const quote = (f: (typeof cast)[number], sign: number) => {
    const bloc = facOf(f)?.bloc;
    if (!bloc) return null;
    const side = sign > 0 ? "pro" : "con";
    // Провал обсуждают как провал: одни злорадствуют, другие досадуют на исполнение.
    if (!plan.success) return voice(f, sign, fresh(REACT_FAILURE[side], `qf${side}`, state.turn));
    const act = specialAct(state, plan.choice);
    if (act) return voice(f, sign, fresh(REACT_SPECIAL[act][side], `qs${act}${side}`, state.turn));
    if (state.currentEvent?.special?.kind) return null;
    // Закон обсуждают как закон: за что голосовали и что отклонили.
    const lawAct = lawActOf(plan.choice);
    if (lawAct && bloc !== "west" && bloc !== "russia") {
      const law = state.currentEvent?.title.match(/«(.+)»/)?.[1] ?? "";
      return voice(f, sign, fill(fresh(LAW_REACT[lawAct][side], `ql${lawAct}${side}`, state.turn), state, { law }));
    }
    // Чем решение задело: интересом лагеря или личными убеждениями говорящего.
    const trait = TRAITS[traitOf(state.seed, f, bloc)];
    const weight = (t: ActionTag) => sign * ((ACTIONS[t].rel[bloc] ?? 0) / 4 + (trait.like.includes(t) ? 7 : 0) - (trait.dislike.includes(t) ? 7 : 0));
    // Высказываются о том, что задевает их лагерь: патриарх не рецензирует кредит МВФ.
    const tag = plan.choice.tags.filter(t => weight(t) > 0 && (ACTIONS[t].rel[bloc] ?? 0) !== 0).sort((a, b) => weight(b) - weight(a))[0];
    if (!tag) return null;
    const envoy = (bloc === "west" || bloc === "russia") && roleGroup(f.id) === "envoy" ? bloc : null;
    const uses = state.history.filter(h => h.tags?.includes(tag)).length;
    return voice(f, sign, envoy ? fresh(REACT_DIPLOMAT[envoy][side], `q${envoy}${side}`, state.turn)
      : fresh(REACT_BY_TAG[tag][side], `q${tag}${side}`, uses));
  };
  // Если сказать по сути нечего — только поступок, без слов: так реплика не уходит мимо темы.
  const deed = (sign: number, f: (typeof cast)[number]) =>
    fill(cycle(DEEDS[roleGroup(f.id)][sign > 0 ? "pro" : "con"], state.seed, `re${sign}`, state.turn), state, { name: f.name, role: lower(f.role) });
  const speakers: string[] = [];
  // Эпизод интриги — дело закрытое: публика о нём не знает и не комментирует.
  // По закону говорят стороны: по одному человеку от тех, кто за, и от тех, кто против.
  // Интерес лагеря: позиция сторон у закона, иначе — как теги решения задевают блок.
  const interestOf = (f: (typeof cast)[number]) => {
    const b = facOf(f)?.bloc;
    if (!b) return 0;
    if (plan.choice.stance) return plan.choice.stance[b] ?? 0;
    // У сделки цену задаёт она сама: теги лишь подписывают решение.
    if (plan.choice.deal?.pure) return plan.choice.deal.factionRel?.[f.faction] ?? 0;
    return plan.choice.tags.reduce((s, t) => s + (ACTIONS[t].rel[b] ?? 0), 0);
  };
  // Личные убеждения: человек может говорить и поперёк своего лагеря, если решение задело то, во что он верит.
  const traitPull = (f: (typeof cast)[number], sign: number) => {
    const b = facOf(f)?.bloc;
    const tr = b && TRAITS[traitOf(state.seed, f, b)];
    return !!tr && plan.choice.tags.some(t => (sign > 0 ? tr.like : tr.dislike).includes(t));
  };
  const sAct = specialAct(state, plan.choice);
  const fits = (f: (typeof cast)[number], sign: number) => {
    if (sAct) return Math.abs(delta(f)) >= 3 && Math.sign(delta(f)) === sign;
    // Провал: те, кому решение было выгодно, досадуют; те, кому нет, злорадствуют.
    if (!plan.success) return Math.sign(interestOf(f)) === sign;
    if (plan.choice.stance) return onSide(f, sign);
    return Math.abs(delta(f)) >= 3 && Math.sign(delta(f)) === sign && (Math.sign(interestOf(f)) === sign || traitPull(f, sign));
  };
  const react = (sign: number) => (arc ? [] : cast)
    .filter(f => f !== moved?.f && f !== bonded && f.id !== closest?.id && concerns(f) && fits(f, sign))
    .sort((a, b) => Math.abs(stanceOf(b) ?? 0) - Math.abs(stanceOf(a) ?? 0) || Math.abs(delta(b)) - Math.abs(delta(a)))
    .slice(0, 1)
    .map(f => { speakers.push(f.name); return quote(f, sign) ?? deed(sign, f); });
  const reactions = [...react(1), ...react(-1)].slice(0, 3);
  // Кто появился в этой главе: в следующих двух он уступит место другим.
  const appeared = [...(closest ? [closest.name] : bonded ? [bonded.name] : moved && intercut ? [moved.f.name] : []), ...speakers];

  // Документ хода — перехват по линии интриги, раз в четыре хода и без повторов.
  // Газета уже сама по себе итог хода, вторая подборка заголовков в ней не нужна.
  const icpt = arcDef ? INTERCEPTS[arcDef.id] : [];
  const icptIdx = (state.turn - 2) / 4;
  const document = arcDef && arcOpen && !arc && state.turn % 4 === 2 && icptIdx < icpt.length
    ? { kind: "intercept" as const, title: "ПЕРЕХВАТ · СОВЕРШЕННО СЕКРЕТНО", lines: [icpt[icptIdx], "Источник не установлен. Абонент на связь больше не выходил."] }
    : null;

  // Что пишут другие: оппозиция — о сути решения, деловая или иностранная пресса — о том, что сильнее сдвинулось.
  const act = specialAct(state, plan.choice);
  const lead = plan.choice.tags.find(t => t !== "delay") ?? plan.choice.tags[0] ?? "delay";
  const opposition = plan.election ? fresh(OPPOSITION_ELECTION[plan.election.outcome === "won" ? "won" : "lost"], "opel", state.turn)
    : !plan.success ? fresh(OPPOSITION_FAIL, "opfail", state.turn)
    : act ? fresh(OPPOSITION_SPECIAL[act], `op${act}`, state.turn)
    : fresh(OPPOSITION[lead], `op${lead}`, state.history.filter(h => h.tags?.includes(lead)).length);
  const econ = plan.resources.economy - state.resources.economy, ext = plan.resources.externalReputation - state.resources.externalReputation;
  const second = Math.abs(ext) >= 3 && Math.abs(ext) >= Math.abs(econ)
    ? { outlet: OUTLETS.foreign, headline: fill(fresh(FOREIGN[ext > 0 ? "up" : "down"], `fp${ext > 0}`, state.turn), state) }
    : Math.abs(econ) >= 3 && (act === "budget" || plan.choice.tags.some(t => MONEY_TAGS.includes(t)))
      ? { outlet: OUTLETS.business, headline: fresh(BUSINESS[econ > 0 ? "up" : "down"], `bz${econ > 0}`, state.turn) } : null;
  const press = arc && !plan.election ? [] : [{ outlet: OUTLETS.opposition, headline: fill(opposition, state) }, ...(second ? [second] : [])];

  const key = plan.newCrisisKey;
  // Личные сообщения: истории людей продолжаются, пока правление идёт.
  const letters = plan.endType && !isSurvival(plan.endType) ? [] : storyLetters(state)
    .map(letter => ({ ...letter, text: fill(letter.text, state, { name: letter.from, role: lower(letter.role ?? "") }) }));
  // Газета сверяет прогнозы советников с тем, что вышло: так видно, кому и в чём верить.
  const forecasts = forecastReview(state, choiceId, !plan.success);
  const advisorUpdates = advisorNews(state, choiceId, !plan.success);
  return {
    press,
    heard: said,
    ...(letters.length ? { letters } : {}),
    ...(forecasts.length ? { forecasts } : {}),
    ...(advisorUpdates.length ? { advisorNews: advisorUpdates } : {}),
    ...(appeared.length ? { cast: appeared } : {}),
    scene: state.currentEvent ? sceneAfter(state.currentEvent, plan.choice, plan.success) : "square",
    headline: finale ? finale.head : plan.election ? electionHeadline(plan.election)
      : (plan.success ? plan.choice.headline : plan.choice.headlineFail) ?? fill(cycle(HEADLINES[tone], state.seed, `hl${tone}`, state.turn), state),
    narrative: chapter(...parts),
    document,
    reactions,
    historianNote: cycle(HISTORIAN[tone], state.seed, `hi${tone}`, state.turn),
    crisisTitle: key ? pick(r, CRISIS_TITLES[key]) : null,
    crisisDescription: key ? CRISIS_DESC[key] : null,
    powerLoss: plan.endType && !isSurvival(plan.endType) ? fallText(r, plan.path, plan.endType, state) : null,
  };
}

// ── Совет ────────────────────────────────────────────────────────────────────
const CRISIS_FIXERS = ["social", "investment", "anticorruption", "dialogue", "reform", "security"];

const COUNCIL_CARDS = { ...COUNCIL_A, ...COUNCIL_B };
const FAIL_SCENES: Record<string, string[]> = { ...FAIL_A, ...FAIL_B };

function buildCouncil(state: GameState): Choice[] {
  // A generic policy proposal cannot answer a factual question about this signature.
  if (state.currentEvent?.choices.some(c => c.mandateResponse || c.projectReview)) return [];
  const r = seededRandom(hashSeed(state.seed, "council", state.turn));
  // Авторский совет для конкретного дела: у каждого советника свой ход и свои последствия.
  const authored = state.currentEvent?.card ? COUNCIL_CARDS[state.currentEvent.card] : undefined;
  if (authored) {
    const crisisId = state.activeCrises[0]?.id ?? null;
    const raw = ADVISOR_ROLES.flatMap(role => {
      const p = authored[role.id as keyof typeof authored];
      if (!p) return [];
      const [tag, text, hint, ok, fail] = p;
      return [{
        advisor: role.id, text: fill(text, state), hint: fill(hint, state), tags: [tag], scene: fill(ok, state), sceneFail: fill(fail, state),
        ...headlines(COUNCIL_HEADLINES[state.currentEvent!.card!]?.[role.id as keyof (typeof COUNCIL_HEADLINES)[string]], state),
        resolvesCrisis: crisisId && CRISIS_FIXERS.includes(tag) && r() < 0.5 ? crisisId : null,
      }];
    });
    return sanitizeProposals(raw, state.advisors, state.activeCrises.map(c => c.id), true);
  }
  const eventTags = state.currentEvent?.choices.flatMap(c => c.tags) ?? [];
  const used = new Set(eventTags);
  // Уместны только подходы, родственные вариантам самого события.
  const relevant = new Set(eventTags.flatMap(t => RELATED_TAGS[t]));
  const crisisId = state.activeCrises[0]?.id ?? null;
  const taken = new Set<ActionTag>();
  const raw = ADVISOR_ROLES.flatMap(role => {
    const fits = role.domain.filter(t => t !== "delay" && relevant.has(t) && !taken.has(t));
    const fresh = fits.filter(t => !used.has(t));
    const options = fresh.length ? fresh : fits;
    if (!options.length) return []; // советнику нечего предложить по этому делу
    const tag = pick(r, options);
    taken.add(tag);
    return [{
      advisor: role.id, text: pick(r, COUNCIL_TEXT[tag]), hint: COUNCIL_HINT[tag], tags: [tag],
      resolvesCrisis: crisisId && CRISIS_FIXERS.includes(tag) && r() < 0.5 ? crisisId : null,
    }];
  });
  return sanitizeProposals(raw, state.advisors, state.activeCrises.map(c => c.id));
}

// ── Вступление ───────────────────────────────────────────────────────────────
const BIOS = [
  "Бывший дипломат, вернувшийся в политику после десяти лет за границей.",
  "Экономист, прославившийся резкими выступлениями против коррупции.",
  "Мэр промышленного города, которого называют «человеком из народа».",
  "Юрист по правам человека, неожиданно для всех выигравший праймериз.",
  "Бывший офицер, ставший депутатом на волне протестов.",
];

function personName(country: string, r: Rand, male = false, used?: Set<string>): string {
  const n = NAMES[country] ?? NAMES["Беларусь"];
  // имя тоже не повторяем, пока есть свободные
  const pool = [...Array(male ? 8 : n.first.length).keys()].filter(k => !used?.has(`first:${n.first[k]}`));
  const i = pool.length ? pool[Math.floor(r() * pool.length)] : Math.floor(r() * (male ? 8 : n.first.length));
  used?.add(`first:${n.first[i]}`);
  const free = used ? n.last.filter(l => !used.has(l)) : [];
  let last = pick(r, free.length ? free : n.last);
  used?.add(last);
  if (i >= 8) last = last.replace(/(ов|ев|ин)$/, "$1а").replace(/(ск|цк)ий$/, "$1ая");
  return `${n.first[i]} ${last}`;
}

// Роли, которые в этих странах занимают только мужчины: иначе тексты событий звучат нелепо.
// Тексты интриг написаны о мужчине-антагонисте: роли, из которых он выбирается, всегда достаются мужчинам.
const MALE_ROLES = new Set(["patriarch", "catholicos", "mufti", "general", "kgb", "knb", "interior", "sbu", "security", "shadow", "clan", "prosecutor", "oligarch", "opp_leader", "activist", "nat_leader", "revanchist"]);

function buildIntro(country: string, diff: DifficultyId, ideo: IdeologyId, seed?: number): Intro {
  const r = seed === undefined ? Math.random : seededRandom(hashSeed(seed, "intro"));
  const surnames = new Set<string>();
  const unique = (male = false) => personName(country, r, male, surnames);
  const foreign = (pool: { first: string[]; last: string[] }) => `${pick(r, pool.first)} ${pick(r, pool.last)}`;
  const leader = unique(true);
  return {
    leader: { name: leader, party: pick(r, IDEOLOGY_PARTIES[ideo]), bio: pick(r, BIOS) },
    speech: SPEECHES[ideo][0].replaceAll("{country}", country),
    situation: `${COUNTRIES[country].context} ${DIFFICULTY_SITUATION[diff]}`,
    players: FIGURE_ROLES[country].map(f => FOREIGN_NAMES[f.id] ? foreign(FOREIGN_NAMES[f.id]) : unique(MALE_ROLES.has(f.id))),
    // Советник по безопасности — всегда мужчина: из советников выбирается «крот», а тексты интриги — в мужском роде.
    advisors: ADVISOR_ROLES.map(r => unique(r.id === "security")),
  };
}

// ── Финал ────────────────────────────────────────────────────────────────────
// Сцена падения: после попытки отменить выборы — своя, «свергнут при попытке».
function fallText(r: Rand, path: GameState["path"], end: EndType, state: GameState): string {
  const pool = fellTrying(path, end) ? PATH_FALL[end as "coup" | "revolution"] : POWER_LOSS[end as LossEnd] ?? POWER_LOSS.collapse;
  return fill(pick(r, pool), state, { name: path?.successor ?? "" });
}

// Насколько концовка украшает вердикт: остаться по закону лучше, чем силой.
const VERDICT_BONUS: Partial<Record<EndType, number>> = {
  reelected: 25, zeroed: 20, premier: 20, leader_of_nation: 20, retired: 18, mandate: 12, emergency_rule: 8, dictator: 5,
};

function buildVerdict(state: GameState): Verdict {
  const r = seededRandom(hashSeed(state.seed, "verdict"));
  const end = state.endType ?? "collapse";
  const rating = computePolls(state.country, state.factions, state.resources).leader;
  const avg = RES_CONFIG.reduce((s, c) => s + state.resources[c.key], 0) / RES_CONFIG.length;
  const kept = promisesKept(state.promises), broke = promisesBroken(state.promises), given = state.promises?.length ?? 0;
  const score = avg + rating / 2 + (VERDICT_BONUS[end] ?? 0) - (state.stats?.failures ?? 0) * 2 + kept * 5 - broke * 4;
  const ratingLabel = RATINGS[Math.max(0, Math.min(RATINGS.length - 1, Math.floor((score - 20) / 14)))];
  const band = score >= 75 ? "good" : score >= 50 ? "mixed" : "bad";

  const counts = new Map<string, number>();
  for (const h of state.history) for (const t of h.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const [topTag, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["delay", 0];
  const startYear = COUNTRIES[state.country].startYear;
  const elections = (state.elections ?? []).map(e =>
    `${ELECTION_LABEL[e.kind].toLowerCase()} ${e.outcome === "won" ? "выиграны" : "проиграны"} (${e.leader}% против ${e.top.share}%)`).join(", ");

  const verdict = [
    `${state.leader.name} правил страной ${reignLength(state.turn)} — с ${startYear} по ${state.year} год — и принял ${plural(state.history.length, "ключевое решение", "ключевых решения", "ключевых решений")}.`,
    state.reign?.past.length ? `Как он оставался у власти: ${state.reign.past.map(p => `после ${termOrdinalGen(p.term)} срока ${TERM_HOW[p.outcome] ?? ""}`).join(", ")}.` : "",
    topCount ? `Главный инструмент правления — «${ACTIONS[topTag as keyof typeof ACTIONS].label.toLowerCase()}»: к нему лидер прибегал ${plural(topCount, "раз", "раза", "раз")}.` : "",
    elections ? `Выборы: ${elections}.` : "",
    pathVerdict(state.path, end),
    state.stats?.crisesResolved ? `Кризисов преодолено: ${state.stats.crisesResolved}.` : "",
    given ? (kept === given ? `Все ${plural(given, "обещание", "обещания", "обещаний")} избирателям исполнены — редкость для любой столицы.`
      : kept ? `Из ${given} предвыборных обещаний исполнено ${kept}${broke ? `, нарушено ${broke}` : ""}.`
      : broke ? `Ни одно из предвыборных обещаний не исполнено${broke === given ? " — все нарушены" : ""}.` : "") : "",
    state.laws?.length ? `Законы, по которым живёт страна: ${state.laws.map(l => `«${lawDef(l.id)?.title}»`).join(", ")}.` : "",
    `К концу правления партия власти имела ${rating}% поддержки.`,
  ].filter(Boolean).join(" ");

  return {
    verdict,
    title: pick(r, fellTrying(state.path, end) ? PATH_FALL.titles : TITLES[end]),
    epitaph: pick(r, PATH_EPITAPHS[end] ?? EPITAPHS[band]),
    rating: ratingLabel,
    fallNarrative: isSurvival(end) ? null : state.powerLoss ?? fallText(r, state.path, end, state),
  };
}

// Тот же интерфейс, что у ИИ-клиента, — экран игры не знает, кто пишет текст.
export const classicApi = {
  setup: async (country: string, diff: string, ideo: string, seed?: number) => buildIntro(country, diff as DifficultyId, ideo as IdeologyId, seed),
  event: async (state: GameState) => buildEvent(state),
  consequence: async (state: GameState, choiceId: string) => buildNarration(state, choiceId),
  council: async (state: GameState) => buildCouncil(state),
  ending: async (state: GameState) => buildVerdict(state),
};
