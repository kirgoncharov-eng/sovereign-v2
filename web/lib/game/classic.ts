// Режим «Сценарии»: та же игра без обращения к модели. Событие выбирается из библиотеки
// карточек по состоянию страны, текст итога собирается из фрагментов. Всё мгновенно и офлайн.
import { ARCS } from "../content/arcs.ts";
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
import { INTERCEPTS, INTERCUT_COLD, INTERCUT_WARM, PLACES, TIMES, WEATHER, WEEKDAYS } from "../content/frame.ts";
import { ECHOES } from "../content/echoes.ts";
import {
  COUNCIL_HINT, COUNCIL_OUTCOME, COUNCIL_TEXT, RELATED_TAGS, CRISIS_DESC, CRISIS_TITLES, DIFFICULTY_SITUATION, EPITAPHS, HEADLINES, HISTORIAN,
  FOREIGN_NAMES, IDEOLOGY_PARTIES, NAMES, POWER_LOSS, REACT_APPROVE, REACT_DISAPPROVE, REACT_FAILED, SPEECHES, TAG_LINES, TITLES,
} from "../content/narration.ts";
import { ACTIONS, ADVISOR_ROLES, CAPITAL_CASES, COUNTRIES, DELAYED, WEAK_ADVISOR_DELAYED, ELECTIONS, ELECTION_LABEL, FIGURE_ROLES, MAX_TURNS, RATINGS, RES_CONFIG } from "./data.ts";
import { INSIDER, INSIDER_LINES, MOLE, MOLE_LINES, OVERTURE, OVERTURE_REASON, PACT, PACT_BROKEN_LINE, PACT_GIVES, PACT_KEPT_LINE, PACT_OK_VARIANTS, type SpecialChoice } from "../content/people.ts";
import { MAX_PACTS, PACT_TAG, RIVAL_BLOCS, bondOf, pactBans, traitOf } from "./people.ts";
import { computePolls, dueBeat, hashSeed, isFemaleName, isSurvival, planTurn, plural, seededRandom, warningLevel } from "./engine.ts";
import { sanitizeProposals } from "./sanitize.ts";
import type { ActionTag, Bloc, Choice, Deal, DifficultyId, Faction, Figure, GameEvent, GameState, IdeologyId, Intro, Narration, Verdict } from "./types.ts";

type Rand = () => number;
const pick = <T,>(r: Rand, list: T[]): T => list[Math.floor(r() * list.length)];

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

// Подстановка слотов {capital} {fig:security} и т.п.
export function fill(tpl: string, state: GameState, extra: Record<string, string> = {}): string {
  return tpl.replace(/\{(\w+)(?::(\w+))?\}/g, (m, key: string, arg?: string) => {
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
      default: return extra[key] ?? m;
    }
  });
}

// Шапка главы: день, время, погода, место. Детерминирована ходом, чтобы не менялась при перезагрузке.
export function dateline(state: GameState): string {
  const r = seededRandom(hashSeed(state.seed, "dateline", state.turn));
  const t = state.turn;
  return fill(`${WEEKDAYS[(t + state.seed) % 7]}, ${pick(r, TIMES)}. ${cycle(WEATHER, state.seed, "weather", t)} ${cycle(PLACES, state.seed, "place", t)}`, state);
}

const chapter = (...parts: (string | undefined | null)[]) => parts.filter(Boolean).join("\n\n");

// ── Выбор карточки ───────────────────────────────────────────────────────────
const neededBlocs = (card: EventCard) =>
  [...`${card.title} ${card.description}`.matchAll(/\{(?:fig|fac):(\w+)\}/g)].map(m => m[1]);

export function cardAvailable(card: EventCard, state: GameState): boolean {
  if (card.countries && !card.countries.includes(state.country)) return false;
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
  if (w.preElection && !ELECTIONS[turn + 1] && !ELECTIONS[turn + 2]) return false;
  if (w.ideo && !w.ideo.includes(state.ideo)) return false;
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
  return {
    title: fill(variant.title, state),
    source: "Секретно",
    description: chapter(dateline(state), fill(variant.description, state), BEAT_EXT[variant.title] && fill(BEAT_EXT[variant.title], state)),
    isCritical: episode === total,
    affectedFactions: [],
    choices: variant.choices.map((c, i) => ({
      id: ["a", "b", "c"][i], text: fill(c.text, state), hint: c.hint, tags: c.tags, resolvesCrisis: null,
      arc: { flag: c.flag, ok: fill(c.ok, state), ...(c.fail ?? BEAT_FAILS[c.text] ? { fail: fill(c.fail ?? BEAT_FAILS[c.text], state) } : {}), effect: c.effect ?? {}, ...(c.epilogue ? { epilogue: fill(c.epilogue, state) } : {}) },
      ...headlines(BEAT_HEADLINES[c.text], state),
    })),
    council: null,
    beat: { arcId: arc.id, arcTitle: arc.title, turn: beat.turn, episode, total },
    randomEvent: null,
  };
}

// ── Люди и союзы ─────────────────────────────────────────────────────────────
// Особые дела: личная встреча, раскрытый свой человек, «червоточина», предложение союза.
// Выпадают не чаще раза в три хода и не перебивают интригу.
const SPECIAL_GAP = 3;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const tagLabels = (tags: ActionTag[]) => tags.map(t => `«${ACTIONS[t].label}»`).join(" или ");

function successorName(state: GameState, fig: Figure): string {
  const r = seededRandom(hashSeed(state.seed, "successor", fig.id, state.turn));
  if (FOREIGN_NAMES[fig.id]) {
    const pool = FOREIGN_NAMES[fig.id];
    const lasts = pool.last.filter(l => !fig.name.endsWith(l));
    return `${pick(r, pool.first)} ${pick(r, lasts.length ? lasts : pool.last)}`;
  }
  const used = new Set<string>();
  for (const n of [state.leader.name, ...state.keyFigures.map(f => f.name), ...state.advisors.map(a => a.name)]) {
    const [first, last] = n.split(" ");
    used.add(`first:${first}`);
    if (last) used.add(last.replace(/(ов|ев|ин)а$/, "$1").replace(/ская$/, "ский"));
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
    description: chapter(dateline(state), fill(content.description, state, slots), reason),
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
    description: chapter(dateline(state), fill(warm ? PACT.viaFigure : PACT.viaLetter, state, slots), fill(PACT.body, state, slots), state.betrayals ? PACT.betrayed : null),
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
  if (state.turn < 2 || turn >= MAX_TURNS || dueBeat(state)) return null;
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
  if (turn >= 4 && turn <= MAX_TURNS - 3 && (state.pacts?.length ?? 0) < MAX_PACTS && r() < 0.3) return pactEvent(state, turn, r, seen);
  return null;
}

function buildEvent(state: GameState): GameEvent & { cardId?: string } {
  const beat = beatEvent(state);
  if (beat) return beat;
  const special = specialEvent(state);
  if (special) return special;
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
    description: chapter(dateline(state), fill(card.description, state), EVENT_EXT[card.id] && fill(EVENT_EXT[card.id], state)),
    isCritical: warningLevel(state) === "critical",
    affectedFactions: state.factions.filter(f => blocs.has(f.bloc)).slice(0, 4).map(f => f.id),
    choices: card.choices.map((c, i) => ({
      id: ["a", "b", "c", "d"][i], text: fill(c.text, state), hint: c.hint, tags: c.tags,
      resolvesCrisis: c.resolves ? crisisId : null,
      ...(escalated
        ? { scene: fill(CRISIS_SCENES[crisisKey!][i][0], state), sceneFail: fill(CRISIS_SCENES[crisisKey!][i][1], state) }
        : {
          ...(SCENES[card.id]?.[i] ? { scene: fill(SCENES[card.id][i], state) } : {}),
          ...(FAIL_SCENES[card.id]?.[i] ? { sceneFail: fill(FAIL_SCENES[card.id][i], state) } : {}),
        }),
      ...headlines(escalated ? CRISIS_HEADLINES[crisisKey!]?.[i] : CARD_HEADLINES[card.id]?.[i], state),
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

// Заголовок газеты к решению: при успехе и при провале.
const headlines = (pair: HeadlinePair | undefined, state: GameState) =>
  pair ? { headline: fill(pair[0], state), headlineFail: fill(pair[1], state) } : {};

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
];
const POLLS_DOWN = [
  "Утренние опросы ложатся на стол молча. Социолог не поднимает глаз. Цифры говорят сами.",
  "Новый замер приносят без сопроводительной записки — её и не нужно. Доверие проседает.",
  "Пресс-служба просит не публиковать свежий опрос. Цифры такие, что их лучше пересчитать дважды.",
  "Социологи осторожно пишут «отрицательная динамика». В переводе на обычный язык — люди отворачиваются.",
];

// ── Итог хода ────────────────────────────────────────────────────────────────
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
  let electionLine: string | null = null;
  if (plan.resolvedCrisis && !arc) after.push(`Кризис «${plan.resolvedCrisis}» наконец отступает. В ситуационном центре впервые за много дней кто-то шутит.`);
  const heard: Record<string, number> = { ...(state.echoes ?? {}) };
  for (const m of plan.matured) after.push(maturedStory(m.label, (heard[m.label] = (heard[m.label] ?? 0) + 1) - 1));
  if (plan.election) {
    const e = plan.election;
    electionLine = (e.outcome === "won"
      ? e.kind === "president"
        ? `${ELECTION_LABEL[e.kind]}. Последний регион досчитывают к трём часам ночи: ${e.leader}% против ${e.top.share}% у «${e.top.name}». Второй срок. Вы долго стоите у окна резиденции и смотрите на площадь, где уже начинают праздновать.`
        : `${ELECTION_LABEL[e.kind]}. В штабе открывают шампанское в 23:40, когда приходят данные из последнего региона: ${e.leader}% против ${e.top.share}% у «${e.top.name}». Вы выходите к сторонникам и впервые за месяц улыбаетесь не для камер.`
      : `${ELECTION_LABEL[e.kind]}. К полуночи всё ясно: «${e.top.name}» — ${e.top.share}%, у вас ${e.leader}%. В штабе молча выключают телевизоры. Кто-то уже собирает вещи.`);
  }
  const news = plan.pactNews;
  for (const name of news.kept) after.push(fill(cycle(PACT_KEPT_LINE, state.seed, "kept", state.turn), state, { camp: name }));
  for (const name of news.broken) after.push(fill(cycle(PACT_BROKEN_LINE, state.seed, "broken", state.betrayals ?? 0), state, { camp: name }));
  if (Math.abs(pollsAfter - pollsBefore) >= 4) after.push(cycle(pollsAfter > pollsBefore ? POLLS_UP : POLLS_DOWN, state.seed, `polls${pollsAfter > pollsBefore}`, state.turn));

  // «Тем временем»: персонаж, чьё личное отношение изменилось сильнее всего.
  // Антагонист интриги и герой особого дела не комментируют собственные эпизоды — они в них участники.
  const subject = state.currentEvent?.special?.figure;
  const cast = state.keyFigures.filter(f => !(arc && f.name === state.arc?.target) && f.id !== subject);
  const delta = (f: (typeof cast)[number]) => {
    const next = plan.keyFigures.find(x => x.id === f.id);
    return next && next.name === f.name ? next.relation - f.relation : 0;
  };
  const moved = [...cast]
    .map(f => ({ f, d: delta(f) }))
    .filter(x => Math.abs(x.d) >= 3)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  // Свой человек или червоточина иногда напоминают о себе вместо обычной реплики.
  const facOf = (f: (typeof cast)[number]) => state.factions.find(x => x.id === f.faction);
  const bonded = state.turn % 3 === 2 ? cast.find(f => ["insider", "mole"].includes(bondOf(f, facOf(f)) ?? "")) : undefined;
  const intercut = bonded
    ? fill(cycle(bondOf(bonded, facOf(bonded)) === "insider" ? INSIDER_LINES : MOLE_LINES, state.seed, "bond", state.turn), state, { name: bonded.name, camp: facOf(bonded)?.name ?? "" })
    : moved ? fill(cycle(moved.d > 0 ? INTERCUT_WARM : INTERCUT_COLD, state.seed, `ic${moved.d > 0}`, state.turn), state,
    { name: moved.f.name, role: moved.f.role.charAt(0).toLowerCase() + moved.f.role.slice(1) }) : null;

  // Нить интриги: между эпизодами — зловещая строка-предвестие.
  const arcDef = ARCS.find(a => a.id === state.arc?.id);
  // Через ход и без повторов: предвестие должно тревожить, а не надоедать.
  const hookIdx = (state.turn - 1) / 2;
  const hook = arcDef && !arc && !plan.endType && state.turn % 2 === 1 && hookIdx < arcDef.hooks.length
    ? fill(cycle(arcDef.hooks, state.seed, "hook", hookIdx), state) : null;
  const parts = [scene, after.join(" "), electionLine, intercut, hook];

  const react = (sign: number, pool: string[]) => cast
    .filter(f => f !== moved?.f && f !== bonded && Math.abs(delta(f)) >= 3 && Math.sign(delta(f)) === sign)
    .slice(0, 1)
    .map(f => fill(cycle(pool, state.seed, `re${sign}`, state.turn), state, { name: f.name, role: f.role.charAt(0).toLowerCase() + f.role.slice(1) }));
  // При провале сторонники идеи недовольны исполнением, а не хвалят «решимость».
  const reactions = [...react(1, plan.success ? REACT_APPROVE : REACT_FAILED), ...react(-1, REACT_DISAPPROVE)].slice(0, 3);

  // Документ хода — перехват по линии интриги, раз в четыре хода и без повторов.
  // Газета уже сама по себе итог хода, вторая подборка заголовков в ней не нужна.
  const icpt = arcDef ? INTERCEPTS[arcDef.id] : [];
  const icptIdx = (state.turn - 2) / 4;
  const document = arcDef && !arc && state.turn % 4 === 2 && icptIdx < icpt.length
    ? { kind: "intercept" as const, title: "ПЕРЕХВАТ · СОВЕРШЕННО СЕКРЕТНО", lines: [icpt[icptIdx], "Источник не установлен. Абонент на связь больше не выходил."] }
    : null;

  const key = plan.newCrisisKey;
  return {
    headline: plan.election ? electionHeadline(plan.election)
      : (plan.success ? plan.choice.headline : plan.choice.headlineFail) ?? fill(cycle(HEADLINES[tone], state.seed, `hl${tone}`, state.turn), state),
    narrative: chapter(...parts),
    document,
    reactions,
    historianNote: cycle(HISTORIAN[tone], state.seed, `hi${tone}`, state.turn),
    crisisTitle: key ? pick(r, CRISIS_TITLES[key]) : null,
    crisisDescription: key ? CRISIS_DESC[key] : null,
    powerLoss: plan.endType && !isSurvival(plan.endType) ? fill(pick(r, POWER_LOSS[plan.endType]), state) : null,
  };
}

// ── Совет ────────────────────────────────────────────────────────────────────
const CRISIS_FIXERS = ["social", "investment", "anticorruption", "dialogue", "reform", "security"];

const COUNCIL_CARDS = { ...COUNCIL_A, ...COUNCIL_B };
const FAIL_SCENES: Record<string, string[]> = { ...FAIL_A, ...FAIL_B };

function buildCouncil(state: GameState): Choice[] {
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
        advisor: role.id, text: fill(text, state), hint, tags: [tag], scene: fill(ok, state), sceneFail: fill(fail, state),
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
  if (i >= 8) last = last.replace(/(ов|ев|ин)$/, "$1а").replace(/ский$/, "ская");
  return `${n.first[i]} ${last}`;
}

// Роли, которые в этих странах занимают только мужчины: иначе тексты событий звучат нелепо.
const MALE_ROLES = new Set(["patriarch", "catholicos", "mufti", "general", "kgb", "knb", "interior", "sbu", "security", "shadow", "clan"]);

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
    advisors: ADVISOR_ROLES.map(() => unique()),
  };
}

// ── Финал ────────────────────────────────────────────────────────────────────
function buildVerdict(state: GameState): Verdict {
  const r = seededRandom(hashSeed(state.seed, "verdict"));
  const end = state.endType ?? "collapse";
  const rating = computePolls(state.country, state.factions, state.resources).leader;
  const avg = RES_CONFIG.reduce((s, c) => s + state.resources[c.key], 0) / RES_CONFIG.length;
  const score = avg + rating / 2 + (end === "reelected" ? 25 : end === "mandate" ? 12 : 0) - (state.stats?.failures ?? 0) * 2;
  const ratingLabel = RATINGS[Math.max(0, Math.min(RATINGS.length - 1, Math.floor((score - 20) / 14)))];
  const band = score >= 75 ? "good" : score >= 50 ? "mixed" : "bad";

  const counts = new Map<string, number>();
  for (const h of state.history) for (const t of h.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const [topTag, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["delay", 0];
  const startYear = COUNTRIES[state.country].startYear;
  const elections = (state.elections ?? []).map(e =>
    `${ELECTION_LABEL[e.kind].toLowerCase()} ${e.outcome === "won" ? "выиграны" : "проиграны"} (${e.leader}% против ${e.top.share}%)`).join(", ");

  const verdict = [
    `${state.leader.name} правил страной с ${startYear} по ${state.year} год и успел принять ${state.history.length} из ${MAX_TURNS} ключевых решений.`,
    topCount ? `Главный инструмент правления — «${ACTIONS[topTag as keyof typeof ACTIONS].label.toLowerCase()}»: к нему лидер прибегал ${plural(topCount, "раз", "раза", "раз")}.` : "",
    elections ? `Выборы: ${elections}.` : "",
    state.stats?.crisesResolved ? `Кризисов преодолено: ${state.stats.crisesResolved}.` : "",
    `К концу правления партия власти имела ${rating}% поддержки.`,
  ].filter(Boolean).join(" ");

  return {
    verdict,
    title: pick(r, TITLES[end]),
    epitaph: pick(r, EPITAPHS[band]),
    rating: ratingLabel,
    fallNarrative: isSurvival(end) ? null : state.powerLoss ?? fill(pick(r, POWER_LOSS[end as keyof typeof POWER_LOSS]), state),
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
