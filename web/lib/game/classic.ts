// Режим «Сценарии»: та же игра без обращения к модели. Событие выбирается из библиотеки
// карточек по состоянию страны, текст итога собирается из фрагментов. Всё мгновенно и офлайн.
import { ARCS } from "../content/arcs.ts";
import { EVENT_CARDS, RANDOM_EVENTS, type EventCard } from "../content/events.ts";
import { SCENES } from "../content/scenes.ts";
import { EVENT_EXT } from "../content/events-ext.ts";
import { BEAT_EXT } from "../content/beats-ext.ts";
import { INTERCEPTS, INTERCUT_COLD, INTERCUT_WARM, PLACES, PRESS_BY_TAG, PRESS_GENERAL, TIMES, WEATHER, WEEKDAYS } from "../content/frame.ts";
import {
  COUNCIL_TEXT, CRISIS_DESC, CRISIS_TITLES, DIFFICULTY_SITUATION, EPITAPHS, HEADLINES, HISTORIAN,
  IDEOLOGY_PARTIES, NAMES, POWER_LOSS, REACT_APPROVE, REACT_DISAPPROVE, SPEECHES, TAG_LINES, TITLES,
} from "../content/narration.ts";
import { ACTIONS, ADVISOR_ROLES, CAPITAL_CASES, COUNTRIES, ELECTIONS, ELECTION_LABEL, FIGURE_ROLES, MAX_TURNS, RATINGS, RES_CONFIG } from "./data.ts";
import { computePolls, dueBeat, hashSeed, isSurvival, planTurn, seededRandom, warningLevel } from "./engine.ts";
import { sanitizeProposals } from "./sanitize.ts";
import type { Bloc, Choice, DifficultyId, GameEvent, GameState, IdeologyId, Intro, Narration, Verdict } from "./types.ts";

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
  return state.keyFigures.find(f => ids.includes(f.faction));
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
      arc: { flag: c.flag, ok: fill(c.ok, state), ...(c.fail ? { fail: fill(c.fail, state) } : {}), effect: c.effect ?? {}, ...(c.epilogue ? { epilogue: fill(c.epilogue, state) } : {}) },
    })),
    council: null,
    beat: { arcId: arc.id, arcTitle: arc.title, turn: beat.turn, episode, total },
    randomEvent: null,
  };
}

function buildEvent(state: GameState): GameEvent & { cardId?: string } {
  const beat = beatEvent(state);
  if (beat) return beat;
  const r = seededRandom(hashSeed(state.seed, "event", state.turn));
  const card = pickCard(state, r);
  const crisisId = state.activeCrises[0]?.id ?? null;
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
      ...(SCENES[card.id]?.[i] ? { scene: fill(SCENES[card.id][i], state) } : {}),
    })),
    council: null,
    randomEvent: random ? { title: random.title, description: random.description, resourceEffect: random.effect } : null,
  };
}

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
  const failLine = () => pick(r, TAG_LINES[plan.choice.tags[0]].fail);
  let scene: string;
  if (arc) scene = plan.success ? arc.ok : arc.fail ?? failLine();
  else if (plan.choice.scene) scene = plan.success ? plan.choice.scene : `${failLine()} ${pick(r, TAG_LINES[plan.choice.tags[0]].fail)}`;
  else scene = plan.choice.tags.map(tag => pick(r, TAG_LINES[tag][plan.success ? "ok" : "fail"])).join(" ");

  const after: string[] = [];
  if (plan.resolvedCrisis && !arc) after.push(`Кризис «${plan.resolvedCrisis}» наконец отступает. В ситуационном центре впервые за много дней кто-то шутит.`);
  for (const m of plan.matured) after.push(`А тем временем даёт о себе знать прошлое: «${m.label}». Вы помните, с чего это началось, — с решения «${m.source}».`);
  if (plan.election) {
    const e = plan.election;
    after.push(e.outcome === "won"
      ? `${ELECTION_LABEL[e.kind]}. В штабе открывают шампанское в 23:40, когда приходят данные из последнего региона: ${e.leader}% против ${e.top.share}% у «${e.top.name}». Вы выходите к сторонникам и впервые за месяц улыбаетесь не для камер.`
      : `${ELECTION_LABEL[e.kind]}. К полуночи всё ясно: «${e.top.name}» — ${e.top.share}%, у вас ${e.leader}%. В штабе молча выключают телевизоры. Кто-то уже собирает вещи.`);
  }
  if (Math.abs(pollsAfter - pollsBefore) >= 4) after.push(pollsAfter > pollsBefore
    ? "Утренние опросы ложатся на стол, и социолог впервые за долгое время позволяет себе улыбнуться: доверие растёт."
    : "Утренние опросы ложатся на стол молча. Социолог не поднимает глаз. Цифры говорят сами.");

  // «Тем временем»: персонаж, чьё отношение изменилось сильнее всего.
  const moved = [...state.keyFigures]
    .map(f => ({ f, d: plan.effects.factionRel[f.faction] ?? 0 }))
    .filter(x => x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  const intercut = moved ? fill(cycle(moved.d > 0 ? INTERCUT_WARM : INTERCUT_COLD, state.seed, `ic${moved.d > 0}`, state.turn), state,
    { name: moved.f.name, role: moved.f.role.charAt(0).toLowerCase() + moved.f.role.slice(1) }) : null;

  // Нить интриги: между эпизодами — зловещая строка-предвестие.
  const arcDef = ARCS.find(a => a.id === state.arc?.id);
  const hook = arcDef && !arc && !plan.endType
    ? fill(arcDef.hooks[(state.turn * 3 + (state.seed % 5)) % arcDef.hooks.length], state) : null;
  const parts = [scene, after.join(" "), intercut, hook];

  const react = (sign: number, pool: string[]) => state.keyFigures
    .filter(f => f !== moved?.f && Math.sign(plan.effects.factionRel[f.faction] ?? 0) === sign)
    .slice(0, 2)
    .map((f, i) => fill(cycle(pool, state.seed, `re${sign}`, state.turn * 2 + i), state, { name: f.name, role: f.role.charAt(0).toLowerCase() + f.role.slice(1) }));
  const reactions = [...react(1, REACT_APPROVE), ...react(-1, REACT_DISAPPROVE)].slice(0, 3);

  // Документ хода: между эпизодами интриги — перехват, в остальных ходах — утренние газеты.
  const document = arcDef && !arc && state.turn % 2 === 1
    ? { kind: "intercept" as const, title: "ПЕРЕХВАТ · СОВЕРШЕННО СЕКРЕТНО", lines: [INTERCEPTS[arcDef.id][Math.floor(state.turn / 2) % INTERCEPTS[arcDef.id].length], "Источник не установлен. Абонент на связь больше не выходил."] }
    : { kind: "press" as const, title: "УТРЕННИЕ ГАЗЕТЫ", lines: [
        pick(r, PRESS_BY_TAG[plan.choice.tags[0]]),
        fill(pick(r, PRESS_GENERAL), state),
        ...(plan.choice.tags[1] ? [pick(r, PRESS_BY_TAG[plan.choice.tags[1]])] : []),
      ] };

  const key = plan.newCrisisKey;
  return {
    headline: fill(cycle(HEADLINES[tone], state.seed, `hl${tone}`, state.turn), state),
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

function buildCouncil(state: GameState): Choice[] {
  const r = seededRandom(hashSeed(state.seed, "council", state.turn));
  const used = new Set(state.currentEvent?.choices.flatMap(c => c.tags) ?? []);
  const crisisId = state.activeCrises[0]?.id ?? null;
  const raw = ADVISOR_ROLES.map(role => {
    const options = role.domain.filter(t => t !== "delay" && !used.has(t));
    const tag = pick(r, options.length ? options : role.domain);
    return {
      advisor: role.id, text: pick(r, COUNCIL_TEXT[tag]), hint: ACTIONS[tag].desc, tags: [tag],
      resolvesCrisis: crisisId && CRISIS_FIXERS.includes(tag) && r() < 0.5 ? crisisId : null,
    };
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

function personName(country: string, r: Rand, male = false): string {
  const n = NAMES[country] ?? NAMES["Беларусь"];
  const i = Math.floor(r() * (male ? 8 : n.first.length));
  let last = pick(r, n.last);
  if (i >= 8) last = last.replace(/(ов|ев|ин)$/, "$1а").replace(/ский$/, "ская");
  return `${n.first[i]} ${last}`;
}

function buildIntro(country: string, diff: DifficultyId, ideo: IdeologyId): Intro {
  const r = Math.random;
  const names = new Set<string>();
  const unique = (male = false) => { let n = personName(country, r, male); while (names.has(n)) n = personName(country, r, male); names.add(n); return n; };
  const leader = unique(true);
  return {
    leader: { name: leader, party: pick(r, IDEOLOGY_PARTIES[ideo]), bio: pick(r, BIOS) },
    speech: SPEECHES[ideo][0].replaceAll("{country}", country),
    situation: `${COUNTRIES[country].context} ${DIFFICULTY_SITUATION[diff]}`,
    players: FIGURE_ROLES[country].map(() => unique()),
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
    `${state.leader.name} правил страной с ${startYear} по ${state.year} год — ${state.history.length} из ${MAX_TURNS} ключевых решений.`,
    topCount ? `Его главным инструментом был «${ACTIONS[topTag as keyof typeof ACTIONS].label.toLowerCase()}»: к нему он прибегал ${topCount} раз.` : "",
    elections ? `Выборы: ${elections}.` : "",
    state.stats?.crisesResolved ? `Кризисов преодолено: ${state.stats.crisesResolved}.` : "",
    state.arc?.epilogue ?? "",
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
  setup: async (country: string, diff: string, ideo: string) => buildIntro(country, diff as DifficultyId, ideo as IdeologyId),
  event: async (state: GameState) => buildEvent(state),
  consequence: async (state: GameState, choiceId: string) => buildNarration(state, choiceId),
  council: async (state: GameState) => buildCouncil(state),
  ending: async (state: GameState) => buildVerdict(state),
};
