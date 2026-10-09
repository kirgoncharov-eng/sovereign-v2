// Игровой движок: чистые функции без сети и без React.
// Модель пишет текст и предлагает изменения, а считает и применяет их этот модуль.
import {
  ACTIONS, ADVISOR_ROLES, BIOGRAPHIES, BIO_CHANCE, BIO_RES, DELAYED, MAX_PENDING, WEAK_ADVISOR_DELAYED, type DelayedInfo, ADVISOR_SKILL, COUNCIL_CHARGES, COUNCIL_ELECTION_BONUS, COUNTRIES, COUP_FROM_TURN, COUP_MILITARY, COUP_RELATION, COSTS, CRISIS_DRAIN, pressureAt,
  ELECTION_LOSS_PENALTY, ELECTION_WIN_BONUS, HOSTILE_DRAIN, HOSTILE_RELATION, IMPEACH_RATING, NON_VOTING_BLOCS, PARTIES, CRISIS_LIFETIME, CRISIS_THRESHOLD, DIFF_REL_MOD, FACTIONS_DATA, FIGURE_ROLES,
  IDEOLOGY_ACTIONS, IDEOLOGY_BONUS, IDEOLOGY_PENALTY, IDEOLOGY_REL, LIMITS, RECOVERY_BELOW, RECOVERY_RATE,
  RES_CONFIG, RESOURCE_KEYS, SAVE_VERSION, START_RES, SURVIVAL_ENDS, CONTINUE_ENDS, TERM_FATIGUE, DEATH_FROM, DEATH_STEP, localTurn,
} from "./data.ts";
import { ARCS } from "../content/arcs.ts";
import { NAMES } from "../content/narration.ts";
import { FACTION_PASS, PACT_BROKEN, PACT_INCOME, PACT_KEPT, PACT_SIGN, PACT_VOTE_BONUS, bondOf, breaches, pactIncome, personalDelta } from "./people.ts";
import { stepPromises } from "./promises.ts";
import { stepLaws } from "./laws.ts";
import { stepLivingWorld, type LivingWorld } from "./living-world.ts";
import { electionKind, isTermEnd, nextReign, pathEnd, reignOf } from "./terms.ts";
import type {
  Advisor, ArcState, Choice, Crisis, GameMode, Pending, DifficultyId, Election, EndType, Polls, Faction, Figure, GameEvent, GameState, IdeologyId, Intro, Loyalty,
  LawInForce, Narration, NewCrisis, Pact, PactNews, PowerPath, PromiseNews, Reign, PromiseState, ResourceDelta, ResourceKey, Resources, TurnReport, Verdict,
} from "./types.ts";

export const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export const clampRel = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));
// «1 ход», «3 хода», «5 ходов».
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`;
}

export const loyaltyLabel = (r: number): Loyalty => (r >= 30 ? "союзник" : r <= -30 ? "враг" : "нейтрал");

export function initFactions(country: string, ideo: IdeologyId, diff: DifficultyId): Faction[] {
  const ideoRel = IDEOLOGY_REL[ideo] || {};
  const mod = DIFF_REL_MOD[diff] || 0;
  return (FACTIONS_DATA[country] || []).map(f => ({
    ...f,
    approval: f.baseApproval,
    relation: clampRel((ideoRel[f.id] || 0) + mod),
  }));
}

export function initFigures(
  country: string, ideo: IdeologyId, diff: DifficultyId, names: string[], rand: () => number = Math.random,
): Figure[] {
  const ideoRel = IDEOLOGY_REL[ideo] || {};
  const mod = DIFF_REL_MOD[diff] || 0;
  return (FIGURE_ROLES[country] || []).map((r, i) => {
    const relation = clampRel((ideoRel[r.faction] || 0) + mod + (rand() * 40 - 20)); // люди не копии своих групп
    return {
      id: r.id, role: r.role, faction: r.faction,
      name: names[i] || r.role,
      loyalty: loyaltyLabel(relation),
      relation,
    };
  });
}

// ── Опросы ───────────────────────────────────────────────────────────────────
// Голосуют группы общества (фракции без внешних сил) пропорционально своему весу (approval).
// Доля группы за лидера = её отношение к нему × настроение страны (легитимность и экономика).
// Остальные уходят к партии-конкуренту своего блока или в «не определились».
export function factionSupport(f: Faction, resources: Resources): number {
  const mood = 0.3 + (resources.internalLegitimacy + resources.economy) / 200;
  return Math.max(0, Math.min(1, ((f.relation + 100) / 200) * mood));
}

export function computePolls(country: string, factions: Faction[], resources: Resources): Polls {
  const voters = factions.filter(f => !NON_VOTING_BLOCS.includes(f.bloc));
  const total = voters.reduce((s, f) => s + f.approval, 0) || 1;
  const rivals = PARTIES[country] ?? [];
  const shares: Record<string, number> = Object.fromEntries(rivals.map(p => [p.id, 0]));
  let leader = 0;
  for (const f of voters) {
    const w = f.approval / total;
    const sup = factionSupport(f, resources);
    leader += w * sup;
    const rest = w * (1 - sup);
    const party = rivals.find(p => p.blocs.includes(f.bloc));
    if (party) shares[party.id] += rest * 0.75; // остальное — «не определились»
  }
  const pct = (v: number) => Math.round(v * 100);
  const parties = rivals.map(p => ({ id: p.id, name: p.name, share: pct(shares[p.id]) }));
  const lead = pct(leader);
  return { leader: lead, parties, undecided: Math.max(0, 100 - lead - parties.reduce((s, p) => s + p.share, 0)) };
}

export const leaderRating = (factions: Faction[], resources: Resources) =>
  computePolls("", factions, resources).leader;

export const securityRelation = (factions: Faction[]) => {
  const sec = factions.filter(f => f.bloc === "security");
  return sec.length ? sec.reduce((s, f) => s + f.relation, 0) / sec.length : 0;
};

export function applyDeltas(res: Resources, d: ResourceDelta | null | undefined): Resources {
  const n = { ...res };
  for (const k of RESOURCE_KEYS) n[k] = clamp(n[k] + (d?.[k] || 0));
  return n;
}

export function applyFactionChanges(
  factions: Faction[], relChanges: Record<string, number>, apprChanges: Record<string, number>,
): Faction[] {
  return factions.map(f => ({
    ...f,
    approval: clamp(f.approval + (apprChanges?.[f.id] || 0)),
    relation: clampRel(f.relation + (relChanges?.[f.id] || 0)),
  }));
}

export function applyFigureChanges(figures: Figure[], changes: Record<string, number>): Figure[] {
  return figures.map(fig => {
    const relation = clampRel(fig.relation + (changes?.[fig.id] || 0));
    return { ...fig, relation, loyalty: loyaltyLabel(relation) };
  });
}

export type WarningLevel = "none" | "warning" | "critical";

export interface WarningSignal { id: ResourceKey | "rating" | "security"; value: number; threshold: number; level: Exclude<WarningLevel, "none"> }

export function warningSignals(state: Pick<GameState, "resources" | "factions">): WarningSignal[] {
  const signals: WarningSignal[] = RESOURCE_KEYS.flatMap(id => {
    const value = state.resources[id];
    return value <= 22 ? [{ id, value, threshold: value <= 10 ? 10 : 22, level: value <= 10 ? "critical" as const : "warning" as const }] : [];
  });
  const rating = leaderRating(state.factions, state.resources);
  const sec = securityRelation(state.factions);
  if (rating <= 25) signals.push({ id: "rating", value: rating, threshold: rating <= 15 ? 15 : 25, level: rating <= 15 ? "critical" : "warning" });
  if (sec <= COUP_RELATION + 15) signals.push({ id: "security", value: sec, threshold: sec <= COUP_RELATION + 5 ? COUP_RELATION + 5 : COUP_RELATION + 15, level: sec <= COUP_RELATION + 5 ? "critical" : "warning" });
  return signals.sort((a, b) => Number(b.level === "critical") - Number(a.level === "critical"));
}

export function warningLevel(state: Pick<GameState, "resources" | "factions">): WarningLevel {
  return warningSignals(state)[0]?.level ?? "none";
}

export const isSurvival = (e: EndType | null) => !!e && SURVIVAL_ENDS.includes(e);

// Смерть на посту: после двенадцати лет у власти шанс растёт с каждым кварталом. Зависит только от зерна и хода.
export const diesInOffice = (seed: number, turn: number) =>
  turn >= DEATH_FROM && seededRandom(hashSeed(seed, "death", turn))() < (turn - DEATH_FROM + 4) * DEATH_STEP;

// Поражение важнее завершения мандата: рухнуть на последнем ходу — всё равно рухнуть.
export function detectEnd(resources: Resources, factions: Faction[], turn: number): EndType | null {
  if (leaderRating(factions, resources) <= LIMITS.endRating || resources.internalLegitimacy <= LIMITS.endResource) return "revolution";
  if (turn >= COUP_FROM_TURN && securityRelation(factions) <= COUP_RELATION && resources.military >= COUP_MILITARY) return "coup";
  if (RESOURCE_KEYS.some(k => resources[k] <= LIMITS.endResource)) return "collapse";
  if (isTermEnd(turn)) return "mandate"; // срок истёк — чем он кончится, решат путь и выборы
  return null;
}

// Конкретная причина падения — одной строкой, чтобы поражение не казалось случайным.
export function endCause(state: Pick<GameState, "endType" | "resources" | "factions">): string | null {
  const { endType, resources: r, factions } = state;
  const low = RES_CONFIG.filter(c => r[c.key] <= LIMITS.endResource).map(c => `${c.prompt.toLowerCase()} — ${r[c.key]} из 100`);
  if (endType === "collapse") return low.length ? `Рухнул ресурс: ${low.join(", ")}.` : null;
  if (endType === "revolution") return r.internalLegitimacy <= LIMITS.endResource
    ? `Легитимность упала до ${r.internalLegitimacy} из 100 — улица перестала признавать власть.`
    : `Рейтинг власти упал до ${leaderRating(factions, r)}% — поддержки не осталось.`;
  if (endType === "coup") return `Силовики стали враждебны (отношение ${securityRelation(factions)}), а армия осталась сильной (${r.military} из 100).`;
  return null;
}

// ── Интрига ──────────────────────────────────────────────────────────────────
// Авторские тексты интриг написаны в мужском роде — антагонистом выбираем мужчину, если он есть.
const FEMALE_NAMES = new Set(Object.values(NAMES).flatMap(n => n.first.slice(8)));
const MALE_A = new Set(["Никита", "Илья", "Кузьма", "Фома", "Лука"]);
export function isFemaleName(name: string): boolean {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return FEMALE_NAMES.has(first) || (/[ая]$/.test(first) && !MALE_A.has(first));
}
// Интрига на срок. В следующем сроке — другая: сыгранные не повторяются, пока есть новые.
export function pickArc(state: Pick<GameState, "advisors" | "keyFigures" | "factions">, rand: () => number, played: string[] = []): ArcState {
  const pool = ARCS.filter(a => !played.includes(a.id));
  const list = pool.length ? pool : ARCS;
  const arc = list[Math.floor(rand() * list.length)];
  const blocOf = (fig: Figure) => state.factions.find(f => f.id === fig.faction)?.bloc;
  let who: { name: string; role: string } | undefined;
  const men = <T extends { name: string }>(list: T[]) => (list.filter(x => !isFemaleName(x.name)).length ? list.filter(x => !isFemaleName(x.name)) : list);
  if (arc.target === "advisor") { const pool = men(state.advisors); who = pool[Math.floor(rand() * pool.length)]; }
  if (arc.target === "security") who = men(state.keyFigures.filter(f => blocOf(f) === "security"))[0];
  if (arc.target === "business") who = men(state.keyFigures.filter(f => blocOf(f) === "business" || blocOf(f) === "ruling"))[0];
  if (arc.target === "rival") who = men(state.keyFigures.filter(f => blocOf(f) === "liberal" || blocOf(f) === "nationalist"))[0];
  // Подходящего лагеря нет — антагонист из своих, а не посол или священник: им интриги не по роли.
  who ??= men(state.keyFigures.filter(f => !/^amb_|^investor$|^patriarch$|^catholicos$|^mufti$/.test(f.id))).sort((a, b) => a.relation - b.relation)[0];
  return { id: arc.id, target: who?.name ?? "неизвестный", targetRole: who?.role ?? "", flags: [], done: [], epilogue: null };
}

// Эпизод интриги, который должен случиться на следующем ходу (если есть).
export function dueBeat(state: Pick<GameState, "arc" | "turn">) {
  const arc = ARCS.find(a => a.id === state.arc?.id);
  if (!arc || !state.arc) return null;
  const idx = arc.beats.findIndex(b => b.turn === localTurn(state.turn + 1) && !state.arc!.done.includes(b.turn));
  if (idx < 0) return null;
  const beat = arc.beats[idx];
  const variant = beat.variants.find(v => !v.requires || v.requires.some(f => state.arc!.flags.includes(f))) ?? beat.variants[beat.variants.length - 1];
  return { arc, beat, variant, episode: idx + 1, total: arc.beats.length };
}

export function createInitialState(
  country: string, diff: DifficultyId, ideo: IdeologyId, intro: Intro, rand: () => number = Math.random,
  mode: GameMode = "classic", bio?: string,
): GameState {
  const biography = BIOGRAPHIES.find(b => b.id === bio);
  const state: GameState = {
    version: SAVE_VERSION,
    mode,
    seed: Math.floor(rand() * 4294967296),
    usedEvents: [],
    stats: { crisesResolved: 0, councils: 0, failures: 0 },
    country, diff, ideo,
    leader: intro.leader,
    speech: intro.speech,
    situation: intro.situation,
    resources: biography ? applyDeltas(START_RES[diff], { [biography.res]: BIO_RES }) : { ...START_RES[diff] }, prevResources: null,
    ...(biography ? { bio: biography.id } : {}),
    factions: initFactions(country, ideo, diff), prevFactions: null,
    keyFigures: initFigures(country, ideo, diff, intro.players, rand), prevFigures: null,
    activeCrises: [],
    year: COUNTRIES[country].startYear,
    turn: 0,
    history: [],
    elections: [],
    advisors: initAdvisors(diff, intro.advisors ?? [], rand),
    councilCharges: COUNCIL_CHARGES[diff],
    pending: [],
    arc: null,
    currentEvent: null,
    lastTurn: null,
    ended: false, endType: null, powerLoss: null,
    verdict: null,
  };
  return { ...state, arc: pickArc(state, rand) };
}

export function startEvent(state: GameState, event: GameEvent & { cardId?: string }): GameState {
  const { cardId, ...ev } = event;
  const usedEvents = cardId ? [...(state.usedEvents ?? []), cardId].slice(-40) : (state.usedEvents ?? []);
  return { ...state, currentEvent: cardId ? { ...ev, card: cardId } : ev, lastTurn: null, usedEvents };
}

// Совет собран: предложения советников добавляются к вариантам, тратится один сбор.
export function conveneCouncil(state: GameState, proposals: Choice[]): GameState {
  if (!state.currentEvent || state.councilCharges <= 0) return state;
  const spent = proposals.length ? 1 : 0; // если советникам нечего сказать, сбор не засчитывается
  return {
    ...state,
    councilCharges: state.councilCharges - spent,
    stats: { ...state.stats, councils: (state.stats?.councils ?? 0) + spent },
    currentEvent: { ...state.currentEvent, council: proposals },
  };
}

export function initAdvisors(diff: DifficultyId, names: string[], rand: () => number = Math.random): Advisor[] {
  // на лёгкой сложности команда сильнее
  const bias = { debut: 0.4, coalition: 0.2, crisis: 0, ruins: -0.2 }[diff] ?? 0;
  return ADVISOR_ROLES.map((r, i) => ({
    id: r.id, role: r.role, emoji: r.emoji,
    name: names[i] || r.role,
    skill: Math.max(1, Math.min(3, Math.floor(rand() * 3 + bias) + 1)) as 1 | 2 | 3,
  }));
}

// Отложенные последствия решения: по тегам и за слабого советника.
// Отложенные последствия по тегам — у обычных решений. У закона последствия свои — каждый ход, пока он действует;
// у эпизода интриги — сюжетные, у сделки и союза — прописанные в самой сделке.
// Общие «розданные деньги разогнали инфляцию» к ним не относятся.
export function delayedEffects(choice: Choice): DelayedInfo[] {
  if (choice.deal || choice.stance || choice.arc) return [];
  const list = choice.tags.map(t => DELAYED[t]).filter((d): d is DelayedInfo => !!d);
  if (choice.advisor?.skill === 1) list.push(WEAK_ADVISOR_DELAYED);
  return list;
}

export const findChoice = (event: GameEvent, id: string): Choice | undefined =>
  event.choices.find(c => c.id === id) ?? event.council?.find(c => c.id === id);

export function setVerdict(state: GameState, verdict: Verdict): GameState {
  return { ...state, verdict };
}

// Кризисы отнимают ресурсы каждый ход и затухают сами по истечении срока.
export function tickCrises(crises: Crisis[], resources: Resources) {
  let res = resources;
  const alive: Crisis[] = [];
  const expired: string[] = [];
  for (const c of crises) {
    res = applyDeltas(res, c.resourceDrain);
    const turnsActive = c.turnsActive + 1;
    if (turnsActive >= (CRISIS_LIFETIME[c.severity] ?? 4)) expired.push(c.title);
    else alive.push({ ...c, turnsActive });
  }
  return { crises: alive, resources: res, expired };
}

const addDelta = (acc: Record<string, number>, d: Record<string, number | undefined> | undefined, k = 1) => {
  for (const [key, v] of Object.entries(d ?? {})) if (v) acc[key] = (acc[key] ?? 0) + v * k;
};
const limitDelta = (d: Record<string, number>, limit: number) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d)) {
    const r = Math.max(-limit, Math.min(limit, Math.round(v)));
    if (r !== 0) out[k] = r;
  }
  return out;
};

// Цена решения: сумма эффектов его тегов + поправка за (не)соответствие идеологии.
// Детерминирована — сервер и клиент считают одно и то же, игрок видит её до выбора.
// ── Случайность с зерном: одинаковый результат у сервера и клиента, перезагрузка не перебросит кубик.
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Шанс, что решение исполнят как задумано. Выжидание не проваливается.
type ChanceState = Pick<GameState, "factions" | "resources"> & Partial<Pick<GameState, "keyFigures" | "pacts" | "bio">>;
// Группы, руками которых решение исполняется: те, кому оно выгодно.
export const executors = (factions: Faction[], choice: Pick<Choice, "tags">) => {
  const blocs = new Set(choice.tags.flatMap(t => Object.entries(ACTIONS[t]?.rel ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([b]) => b)));
  return factions.filter(f => blocs.has(f.bloc));
};

export function successChance(state: ChanceState, choice: Choice): number {
  if (choice.tags.every(t => t === "delay") || choice.deal?.pure) return 1;
  let p = 0.8;
  if (choice.advisor) p += (choice.advisor.skill - 2) * 0.12;
  if (choice.resolvesCrisis) p += 0.1; // на борьбу с кризисом брошены все силы
  const bio = BIOGRAPHIES.find(b => b.id === state.bio);
  if (bio && choice.tags.some(t => bio.tags.includes(t))) p += BIO_CHANCE; // лидер знает это ремесло
  // чем лучше к вам относятся исполнители, тем надёжнее; а их люди могут и помочь, и саботировать
  const exec = executors(state.factions, choice);
  const avg = (xs: number[]) => xs.reduce((s, r) => s + r, 0) / xs.length;
  if (exec.length) p += avg(exec.map(f => f.relation)) / 400;
  // Человек, который относится к вам лучше своего лагеря, проталкивает решение; хуже — саботирует.
  const people = (state.keyFigures ?? []).filter(fig => exec.some(f => f.id === fig.faction));
  if (people.length) p += avg(people.map(fig => fig.relation - exec.find(f => f.id === fig.faction)!.relation)) / 400;
  if (state.pacts?.some(pc => exec.some(f => f.id === pc.faction))) p += 0.05; // союзник даёт свой аппарат
  if (state.resources.politicalCapital < 25) p -= 0.1;
  if (state.resources.personalResource < 25) p -= 0.05;
  return Math.round(Math.max(0.3, Math.min(0.95, p)) * 100) / 100;
}

export function rollSuccess(state: ChanceState & Pick<GameState, "seed" | "turn">, choice: Choice): boolean {
  return seededRandom(hashSeed(state.seed ?? 0, state.turn, choice.id, choice.text))() < successChance(state, choice);
}

export function choiceEffects(state: Pick<GameState, "ideo" | "factions"> & Partial<Pick<GameState, "pacts" | "betrayals">>, choice: Choice, failed = false) {
  const res: Record<string, number> = {};
  const rel: Record<string, number> = {};
  const appr: Record<string, number> = {};
  const ideo = IDEOLOGY_ACTIONS[state.ideo];
  addDelta(res, choice.arc?.effect);
  for (const tag of choice.deal?.pure ? [] : choice.tags) {
    const a = ACTIONS[tag];
    if (!a) continue;
    addDelta(res, a.res);
    if (ideo.aligned.includes(tag)) addDelta(res, IDEOLOGY_BONUS);
    if (ideo.opposed.includes(tag)) addDelta(res, IDEOLOGY_PENALTY);
    for (const f of state.factions) {
      if (!choice.stance) addDelta(rel, { [f.id]: a.rel[f.bloc] });
      addDelta(appr, { [f.id]: a.appr?.[f.bloc] });
    }
  }
  // Законы и подобные им решения задевают тех, кого касаются по сути: союзный договор злит не «патриотов вообще»,
  // а Запад и либералов. Тогда отношения берутся из позиции сторон, а не из общих тегов.
  if (choice.stance) for (const f of state.factions) addDelta(rel, { [f.id]: choice.stance[f.bloc] });
  for (const k of Object.keys(res)) if (res[k] < 0) res[k] *= COSTS.weight;
  // Качество советника: потери умножаются на cost, выгода — на gain.
  const skill = choice.advisor ? ADVISOR_SKILL[choice.advisor.skill] : null;
  if (skill) for (const k of Object.keys(res)) res[k] *= res[k] < 0 ? skill.cost : skill.gain;
  // Провал: выгода почти не наступает, а цена растёт.
  if (failed) {
    for (const k of Object.keys(res)) res[k] *= res[k] < 0 ? 1.15 : 0.5;
    for (const k of Object.keys(rel)) if (rel[k] > 0) rel[k] *= 0.5;
  }
  // Сделки и союзы идут поверх обычной цены решения.
  const relOut = limitDelta(rel, LIMITS.factionRelDelta), apprOut = limitDelta(appr, LIMITS.factionApprDelta);
  const extra: Record<string, number> = {}, extraAppr: Record<string, number> = {};
  const deal = choice.deal;
  if (deal && !failed) {
    addDelta(extra, deal.factionRel);
    addDelta(extraAppr, deal.factionAppr);
    if (deal.pact) {
      addDelta(extra, { [deal.pact.faction]: PACT_SIGN.faction });
      if (deal.pact.against) addDelta(extra, { [deal.pact.against]: PACT_SIGN.against });
    }
  }
  // Нарушенный союз: обманутая группа в ярости, остальные делают выводы. Считается и при провале — важен умысел.
  for (const p of choice.deal?.pure ? [] : breaches(state.pacts, choice.tags)) {
    for (const f of state.factions) addDelta(extra, { [f.id]: f.id === p.faction ? PACT_BROKEN.faction : PACT_BROKEN.others });
  }
  for (const [k, v] of Object.entries(extra)) relOut[k] = (relOut[k] ?? 0) + Math.round(v);
  for (const [k, v] of Object.entries(extraAppr)) apprOut[k] = (apprOut[k] ?? 0) + Math.round(v);
  for (const d of [relOut, apprOut]) for (const k of Object.keys(d)) if (!d[k]) delete d[k];
  const resOut = limitDelta(res, LIMITS.resourceDelta);
  if (deal?.res && !failed) for (const [k, v] of Object.entries(deal.res)) if (v) resOut[k] = (resOut[k] ?? 0) + v;
  return {
    resources: resOut as ResourceDelta,
    factionRel: relOut,
    factionAppr: apprOut,
  };
}

// Личные перемены: доля от отношения группы, характер человека, сделки и союзы.
export function figureDeltas(
  state: Pick<GameState, "seed" | "keyFigures" | "pacts" | "factions">, choice: Choice, success: boolean, factionRel: Record<string, number>,
  kept: Pact[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  const broken = choice.deal?.pure ? [] : breaches(state.pacts, choice.tags);
  const deal = success ? choice.deal : undefined;
  for (const fig of state.keyFigures) {
    let d = Math.round((factionRel[fig.faction] ?? 0) * FACTION_PASS) + personalDelta(state.seed ?? 0, fig, state.factions.find(f => f.id === fig.faction)?.bloc, choice.tags, !success);
    if (deal?.figure === fig.id) d += (deal.figureRel ?? 0) + (deal.pact ? PACT_SIGN.figure : 0);
    else if (deal?.othersRel && fig.relation >= 30) d += deal.othersRel;
    if (broken.some(p => p.figure === fig.id)) d += PACT_BROKEN.figure;
    if (kept.some(p => p.figure === fig.id)) d += PACT_KEPT.figure;
    if (d) out[fig.id] = d;
  }
  return out;
}

export interface TurnPlan {
  world?: LivingWorld;
  worldStory: string | null;
  choice: Choice;
  success: boolean;
  chance: number;
  effects: ReturnType<typeof choiceEffects>;
  resources: Resources;
  factions: Faction[];
  keyFigures: Figure[];
  crises: Crisis[];
  resolvedCrisis: string | null;
  expiredCrises: string[];
  hostileFactions: string[];
  election: Election | null;
  matured: Pending[];
  scheduled: Pending[];
  pending: Pending[];
  newCrisisKey: ResourceKey | null; // ресурс, провал которого породил новый кризис
  endType: EndType | null;
  pacts: Pact[];
  pactNews: PactNews;
  betrayals: number;
  promises: PromiseState[];
  promiseNews: PromiseNews;
  laws: LawInForce[];
  lawNews: TurnReport["law"] | null;
  path: PowerPath | null;
  sources: Partial<Record<ResourceKey, [string, number][]>>; // из чего сложилась перемена ресурсов
  reign: Reign;                                  // правление после хода (новый срок — уже с новыми правилами)
  termResult: { n: number; outcome: EndType } | null; // срок кончился, правление продолжается
}

// Весь расчёт хода без текста. Модель потом описывает именно этот итог.
export function planTurn(state: GameState, choiceId: string, opts: { assumeSuccess?: boolean } = {}): TurnPlan {
  const event = state.currentEvent;
  if (!event) throw new Error("Нет активного события");
  const choice = findChoice(event, choiceId);
  if (!choice) throw new Error("Неизвестный вариант решения");

  const chance = successChance(state, choice);
  const success = opts.assumeSuccess ? true : rollSuccess(state, choice);
  const effects = choiceEffects(state, choice, !success);
  // Из чего сложилась перемена каждого ресурса: решение, давление, кризис, враждебная группа, закон.
  const sources: Partial<Record<ResourceKey, [string, number][]>> = {};
  const note = (label: string, before: Resources, after: Resources) => {
    for (const k of RESOURCE_KEYS) {
      const d = after[k] - before[k];
      if (!d) continue;
      const list = (sources[k] ??= []);
      const same = list.find(x => x[0] === label);
      if (same) same[1] += d; else list.push([label, d]);
    }
  };
  let resources = state.resources;
  const add = (label: string, d: ResourceDelta | null | undefined) => { const next = applyDeltas(resources, d); note(label, resources, next); resources = next; };
  add("решение", effects.resources);
  const nextTurn = state.turn + 1;

  // Срабатывают отложенные последствия прошлых решений; новые встают в очередь.
  const pendingAll = state.pending ?? [];
  const matured = pendingAll.filter(p => p.due <= nextTurn);
  for (const p of matured) add(p.label.toLowerCase(), p.res);
  // Провал отменяет отложенную пользу, но не отложенный вред.
  const net = (d: { res: ResourceDelta }) => Object.values(d.res).reduce((x, y) => x + (y ?? 0), 0);
  const later = success && choice.deal?.later ? [{ ...choice.deal.later, story: choice.deal.later.story ?? "" }] : [];
  // Сюжет храним только у сделок: эхо из таблицы DELAYED рассказчик берёт сам, с вариантами.
  const tagged = delayedEffects(choice).filter(d => success || net(d) < 0).map(d => ({ ...d, story: "" }));
  const scheduled: Pending[] = [...tagged, ...later].map((d, i) => ({
    id: `p${nextTurn}_${i}`, due: nextTurn + d.turns, from: state.turn, label: d.label, res: d.res, source: choice.text,
    ...(state.currentEvent?.title ? { event: state.currentEvent.title } : {}),
    ...(d.story ? { story: d.story } : {}),
  }));
  const pending = [...pendingAll.filter(p => p.due > nextTurn), ...scheduled].slice(-MAX_PENDING);
  if (event.randomEvent) add(event.randomEvent.title.toLowerCase(), event.randomEvent.resourceEffect);

  // Союзы: нарушенные рвутся, истёкшие засчитываются, новые вступают в силу со следующего хода.
  const oldPacts = state.pacts ?? [];
  const broken = choice.deal?.pure ? [] : breaches(oldPacts, choice.tags);
  const kept = oldPacts.filter(p => !broken.includes(p) && p.until <= nextTurn);
  const facName = (id: string) => state.factions.find(f => f.id === id)?.name ?? id;
  for (const p of oldPacts) {
    if (broken.includes(p)) continue;
    const bloc = state.factions.find(f => f.id === p.faction)?.bloc;
    if (bloc) add(`союз с «${facName(p.faction)}»`, { [PACT_INCOME[bloc]]: pactIncome(p) });
  }
  const keptRel: Record<string, number> = {};
  for (const p of kept) keptRel[p.faction] = PACT_KEPT.faction;
  const signed = success && choice.deal?.pact ? [{
    faction: choice.deal.pact.faction, figure: choice.deal.figure ?? null, since: nextTurn,
    until: nextTurn + choice.deal.pact.turns, ban: choice.deal.pact.ban, against: choice.deal.pact.against ?? null,
  }] : [];
  const pacts = [...oldPacts.filter(p => !broken.includes(p) && !kept.includes(p)), ...signed];
  const pactNews: PactNews = { signed: signed.map(p => facName(p.faction)), kept: kept.map(p => facName(p.faction)), broken: broken.map(p => facName(p.faction)) };

  let factions = applyFactionChanges(state.factions, effects.factionRel, effects.factionAppr);
  if (kept.length) factions = applyFactionChanges(factions, keptRel, {});
  let keyFigures = applyFigureChanges(state.keyFigures, figureDeltas(state, choice, success, effects.factionRel, kept));
  // Человек уходит с поста: преемник приходит с позицией своей группы.
  const deal = success ? choice.deal : undefined;
  if (deal?.replace && deal.figure) keyFigures = keyFigures.map(fig => {
    if (fig.id !== deal.figure) return fig;
    const relation = clampRel((factions.find(f => f.id === fig.faction)?.relation ?? 0) * 0.7);
    return { ...fig, name: deal.replace!, relation, loyalty: loyaltyLabel(relation) };
  });

  let crises = state.activeCrises;
  let resolvedCrisis: string | null = null;
  // Кризис закрывается, только если решение исполнили.
  const hit = success && choice.resolvesCrisis ? crises.find(c => c.id === choice.resolvesCrisis) : null;
  if (hit) {
    resolvedCrisis = hit.title;
    crises = crises.filter(c => c.id !== hit.id);
  }

  const tick = tickCrises(crises, resources);
  crises = tick.crises;
  note(crises.length ? `кризис «${crises[0].title}»${crises.length > 1 ? " и другие" : ""}` : "кризисы", resources, tick.resources);
  resources = tick.resources;

  // Давление обстоятельств (по сложности) и вредительство враждебных фракций.
  const turn = state.turn + 1;
  const pressure = pressureAt(state.diff, turn);
  if (pressure) {
    add("давление обстоятельств", {
      [RESOURCE_KEYS[turn % RESOURCE_KEYS.length]]: -Math.ceil(pressure / 2),
      [RESOURCE_KEYS[(turn + 3) % RESOURCE_KEYS.length]]: -Math.floor(pressure / 2),
    });
  }
  // Враждебная группа вредит, если её не сдерживает союз или свой человек внутри.
  const hostile = factions.filter(f => f.relation <= HOSTILE_RELATION && !pacts.some(p => p.faction === f.id)
    && !keyFigures.some(fig => fig.faction === f.id && bondOf(fig, f) === "insider"));
  for (const f of hostile) add(`вредят «${f.name}»`, HOSTILE_DRAIN[f.bloc]);

  const worldStep = stepLivingWorld({ ...state, resources, factions, keyFigures }, turn, success ? choice.projectReview : undefined);
  for (const effect of worldStep.effects) add(effect.label, effect.res);

  // Институты понемногу восстанавливаются: просевшие ресурсы подтягиваются вверх.
  const beforeRecovery = { ...resources };
  for (const k of RESOURCE_KEYS) {
    if (resources[k] < RECOVERY_BELOW && resources[k] > 0) resources[k] = clamp(resources[k] + RECOVERY_RATE);
  }
  note("институты восстанавливаются", beforeRecovery, resources);

  // Ресурс, провалившийся ниже порога, порождает кризис — если по нему ещё нет кризиса.
  let newCrisisKey: ResourceKey | null = null;
  if (crises.length < LIMITS.maxActiveCrises) {
    newCrisisKey = RESOURCE_KEYS.find(k =>
      resources[k] < CRISIS_THRESHOLD && state.resources[k] >= CRISIS_THRESHOLD &&
      !crises.some(c => c.resourceDrain[k])) ?? null;
  }

  // Законы: действующие работают каждый ход; принятый сейчас — со следующего.
  const lawStep = stepLaws(state.laws, choice.law, success, nextTurn, factions);
  add("законы", lawStep.res);
  factions = applyFactionChanges(factions, lawStep.rel, {});

  // Обещания: решение продвигает или нарушает их; в срок проверяется всё остальное.
  const promiseStep = stepPromises(state.promises, choice.deal?.pure ? [] : choice.tags, success, turn, resources, factions);
  add("обещания", promiseStep.res);
  factions = applyFactionChanges(factions, promiseStep.rel, {});

  // «Вопрос о сроках»: путь выбран, если решение исполнили; сорванное обнуление — значит, уходить.
  const path: PowerPath | null = choice.path
    ? success ? { id: choice.path, turn, ...(choice.successor ? { successor: choice.successor } : {}) } : { id: "exit", turn, from: choice.path }
    : state.path ?? null;

  // Выборы: по итогам хода считается опрос, он же — результат голосования.
  const reign = reignOf(state);
  let election: Election | null = null;
  const kind = electionKind(turn, path, reign.office);
  if (kind) {
    // Союзники по пакту голосуют за своих.
    const voters = factions.map(f => pacts.some(p => p.faction === f.id) ? { ...f, relation: clampRel(f.relation + PACT_VOTE_BONUS) } : f);
    const polls = computePolls(state.country, voters, resources);
    const top = [...polls.parties].sort((a, b) => b.share - a.share)[0] ?? { id: "", name: "", share: 0 };
    const outcome = polls.leader > top.share ? "won" : kind === "parliament" && polls.leader < IMPEACH_RATING ? "impeached" : "lost";
    election = { turn, kind, leader: polls.leader, top, outcome };
    if (kind === "parliament") add("выборы", outcome === "won" ? ELECTION_WIN_BONUS : ELECTION_LOSS_PENALTY);
  }

  // Импичмент грозит только действующему президенту: рокировка в конце срока его не боится.
  let endType: EndType | null = election?.outcome === "impeached" && !isTermEnd(turn) ? "impeachment" : detectEnd(resources, factions, turn);
  if (endType === "mandate") {
    const won = election?.outcome === "won";
    // Без решения по сроку (старые партии) — как раньше: выборы для президента и премьера, указы для правителя.
    const p = path ?? (reign.office === "ruler" ? { id: reign.how ?? "dictatorship", turn } : { id: "run" as const, turn });
    endType = pathEnd(p, won, { factions, resources, keyFigures }, reign);
  }
  // Остался у власти — начинается следующий срок, и он тяжелее прошлого: власть приедается.
  let termResult: TurnPlan["termResult"] = null, nextR = reign;
  if (endType && CONTINUE_ENDS.includes(endType)) {
    termResult = { n: reign.term + 1, outcome: endType };
    nextR = nextReign(reign, endType, path);
    add("новый срок: власть приедается", TERM_FATIGUE);
    endType = null;
  }
  // Годы берут своё: после двенадцати лет у власти лидер может не дожить до конца срока.
  if (!endType && diesInOffice(state.seed, turn)) endType = "died";

  return {
    choice, effects, success, chance, resources, factions, keyFigures, crises, election, matured, scheduled, pending,
    resolvedCrisis, expiredCrises: tick.expired, hostileFactions: hostile.map(f => f.name), newCrisisKey,
    endType,
    pacts, pactNews, betrayals: (state.betrayals ?? 0) + broken.length,
    promises: promiseStep.promises, promiseNews: promiseStep.news,
    laws: lawStep.laws, lawNews: lawStep.news,
    path, reign: nextR, termResult, sources,
    world: worldStep.world, worldStory: worldStep.story,
  };
}

export function resolveTurn(state: GameState, choiceId: string, narration: Narration): GameState {
  const plan = planTurn(state, choiceId);
  const event = state.currentEvent!;
  const turn = state.turn + 1;

  let crises = plan.crises;
  let newCrisis: NewCrisis | null = null;
  if (plan.newCrisisKey) {
    const label = RES_CONFIG.find(r => r.key === plan.newCrisisKey)!.prompt.toLowerCase();
    newCrisis = {
      title: narration.crisisTitle || `Провал: ${label}`,
      description: narration.crisisDescription || "",
      severity: plan.resources[plan.newCrisisKey] < 10 ? "high" : "medium",
      resourceDrain: { [plan.newCrisisKey]: -CRISIS_DRAIN },
    };
    crises = [...crises, { ...newCrisis, id: `c${turn}`, turnsActive: 0 }];
  }

  return {
    ...state,
    resources: plan.resources, prevResources: { ...state.resources },
    ...(plan.world ? { world: plan.world } : {}),
    factions: plan.factions, prevFactions: state.factions.map(f => ({ ...f })),
    keyFigures: plan.keyFigures, prevFigures: state.keyFigures.map(f => ({ ...f })),
    activeCrises: crises,
    turn,
    year: state.year + (turn % 4 === 0 ? 1 : 0),
    elections: plan.election ? [...(state.elections ?? []), plan.election] : (state.elections ?? []),
    councilCharges: state.councilCharges + (plan.election?.kind === "parliament" && plan.election.outcome === "won" ? COUNCIL_ELECTION_BONUS : 0),
    history: [...state.history, {
      year: state.year, title: event.title, choice: plan.choice.text,
      headline: narration.headline, historianNote: narration.historianNote,
      tags: plan.choice.tags, success: plan.success,
      ...(narration.heard?.length ? { heard: narration.heard } : {}),
      ...(narration.cast?.length ? { cast: narration.cast } : {}),
    }],
    currentEvent: null,
    lastTurn: {
      ...narration,
      choiceText: plan.choice.text,
      tags: plan.choice.tags,
      resourceChanges: plan.effects.resources,
      factionRelChanges: plan.effects.factionRel,
      resolvedCrisis: plan.resolvedCrisis,
      expiredCrises: plan.expiredCrises,
      newCrisis,
      election: plan.election,
      success: plan.success,
      chance: plan.chance,
      matured: plan.matured,
      scheduled: plan.scheduled,
      ...(plan.pactNews.signed.length + plan.pactNews.kept.length + plan.pactNews.broken.length ? { pacts: plan.pactNews } : {}),
      ...(plan.promiseNews.kept.length + plan.promiseNews.broken.length + plan.promiseNews.advanced.length ? { promises: plan.promiseNews } : {}),
      ...(plan.lawNews ? { law: plan.lawNews } : {}),
      ...(plan.termResult ? { term: plan.termResult } : {}),
      sources: plan.sources,
    },
    pending: plan.pending,
    pacts: plan.pacts,
    // Новый срок: прошлое решение о сроке закрыто, интрига — новая.
    ...(plan.termResult || state.reign ? { reign: plan.termResult ? {
      ...plan.reign,
      arcs: [...plan.reign.arcs, ...(state.arc ? [state.arc.id] : [])],
      epilogues: [...plan.reign.epilogues, ...(plan.choice.arc?.epilogue ?? state.arc?.epilogue ? [plan.choice.arc?.epilogue ?? state.arc!.epilogue!] : [])],
    } : plan.reign } : {}),
    betrayals: plan.betrayals,
    promises: plan.promises,
    laws: plan.laws,
    path: plan.termResult ? null : plan.path,
    former: [...(state.former ?? []), ...state.keyFigures.filter(f => !plan.keyFigures.some(g => g.name === f.name)).map(f => f.name)],
    echoes: plan.matured.reduce((acc, m) => ({ ...acc, [m.label]: (acc[m.label] ?? 0) + 1 }), { ...(state.echoes ?? {}) }),
    // Флаг «later»: эпизоды интриги во втором сроке знают, что президент не новый.
    arc: plan.termResult
      ? { ...pickArc({ ...state, keyFigures: plan.keyFigures, factions: plan.factions }, seededRandom(hashSeed(state.seed, "arc", turn)),
        [...plan.reign.arcs, ...(state.arc ? [state.arc.id] : [])]), flags: ["later"] }
      : state.arc ? {
        ...state.arc,
        flags: plan.choice.arc?.flag ? [...state.arc.flags, plan.choice.arc.flag] : state.arc.flags,
        done: event.beat ? [...state.arc.done, event.beat.turn] : state.arc.done,
        epilogue: plan.choice.arc?.epilogue ?? state.arc.epilogue,
      } : null,
    stats: {
      crisesResolved: (state.stats?.crisesResolved ?? 0) + (plan.resolvedCrisis ? 1 : 0),
      councils: state.stats?.councils ?? 0,
      failures: (state.stats?.failures ?? 0) + (plan.success ? 0 : 1),
    },
    ended: plan.endType !== null,
    endType: plan.endType,
    powerLoss: plan.endType && !isSurvival(plan.endType) ? narration.powerLoss : null,
  };
}
