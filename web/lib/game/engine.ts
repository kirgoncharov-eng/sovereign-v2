// Игровой движок: чистые функции без сети и без React.
// Модель пишет текст и предлагает изменения, а считает и применяет их этот модуль.
import {
  ACTIONS, ADVISOR_ROLES, DELAYED, MAX_PENDING, WEAK_ADVISOR_DELAYED, type DelayedInfo, ADVISOR_SKILL, COUNCIL_CHARGES, COUNCIL_ELECTION_BONUS, COUNTRIES, COUP_FROM_TURN, COUP_MILITARY, COUP_RELATION, CRISIS_DRAIN, DIFF_PRESSURE, ELECTIONS,
  ELECTION_LOSS_PENALTY, ELECTION_WIN_BONUS, HOSTILE_DRAIN, HOSTILE_RELATION, IMPEACH_RATING, NON_VOTING_BLOCS, PARTIES, CRISIS_LIFETIME, CRISIS_THRESHOLD, DIFF_REL_MOD, FACTIONS_DATA, FIGURE_ROLES,
  IDEOLOGY_ACTIONS, IDEOLOGY_BONUS, IDEOLOGY_PENALTY, IDEOLOGY_REL, LIMITS, MAX_TURNS, RECOVERY_BELOW, RECOVERY_RATE,
  RES_CONFIG, RESOURCE_KEYS, SAVE_VERSION, START_RES,
} from "./data.ts";
import { ARCS } from "../content/arcs.ts";
import { NAMES } from "../content/narration.ts";
import type {
  Advisor, ArcState, Choice, Crisis, GameMode, Pending, DifficultyId, Election, EndType, Polls, Faction, Figure, GameEvent, GameState, IdeologyId, Intro, Loyalty,
  Narration, NewCrisis, ResourceDelta, ResourceKey, Resources, Verdict,
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
    const relation = clampRel((ideoRel[r.faction] || 0) + mod + (rand() * 20 - 10));
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

const securityRelation = (factions: Faction[]) => {
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

export function warningLevel(state: Pick<GameState, "resources" | "factions">): WarningLevel {
  const minRes = Math.min(...RESOURCE_KEYS.map(k => state.resources[k]));
  const rating = leaderRating(state.factions, state.resources);
  const sec = securityRelation(state.factions);
  if (minRes <= 10 || rating <= 15 || sec <= COUP_RELATION + 5) return "critical";
  if (minRes <= 22 || rating <= 25 || sec <= COUP_RELATION + 15) return "warning";
  return "none";
}

export const isSurvival = (e: EndType | null) => e === "mandate" || e === "reelected";

// Поражение важнее завершения мандата: рухнуть на последнем ходу — всё равно рухнуть.
export function detectEnd(resources: Resources, factions: Faction[], turn: number): EndType | null {
  if (leaderRating(factions, resources) <= LIMITS.endRating || resources.internalLegitimacy <= LIMITS.endResource) return "revolution";
  if (turn >= COUP_FROM_TURN && securityRelation(factions) <= COUP_RELATION && resources.military >= COUP_MILITARY) return "coup";
  if (RESOURCE_KEYS.some(k => resources[k] <= LIMITS.endResource)) return "collapse";
  if (turn >= MAX_TURNS) return "mandate";
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
export function pickArc(state: Pick<GameState, "advisors" | "keyFigures" | "factions">, rand: () => number): ArcState {
  const arc = ARCS[Math.floor(rand() * ARCS.length)];
  const blocOf = (fig: Figure) => state.factions.find(f => f.id === fig.faction)?.bloc;
  let who: { name: string; role: string } | undefined;
  const men = <T extends { name: string }>(list: T[]) => (list.filter(x => !isFemaleName(x.name)).length ? list.filter(x => !isFemaleName(x.name)) : list);
  if (arc.target === "advisor") { const pool = men(state.advisors); who = pool[Math.floor(rand() * pool.length)]; }
  if (arc.target === "security") who = men(state.keyFigures.filter(f => blocOf(f) === "security"))[0];
  if (arc.target === "business") who = men(state.keyFigures.filter(f => blocOf(f) === "business" || blocOf(f) === "ruling"))[0];
  if (arc.target === "rival") who = men(state.keyFigures.filter(f => blocOf(f) === "liberal" || blocOf(f) === "nationalist"))[0];
  who ??= [...state.keyFigures].sort((a, b) => a.relation - b.relation)[0];
  return { id: arc.id, target: who?.name ?? "неизвестный", targetRole: who?.role ?? "", flags: [], done: [], epilogue: null };
}

// Эпизод интриги, который должен случиться на следующем ходу (если есть).
export function dueBeat(state: Pick<GameState, "arc" | "turn">) {
  const arc = ARCS.find(a => a.id === state.arc?.id);
  if (!arc || !state.arc) return null;
  const idx = arc.beats.findIndex(b => b.turn === state.turn + 1 && !state.arc!.done.includes(b.turn));
  if (idx < 0) return null;
  const beat = arc.beats[idx];
  const variant = beat.variants.find(v => !v.requires || v.requires.some(f => state.arc!.flags.includes(f))) ?? beat.variants[beat.variants.length - 1];
  return { arc, beat, variant, episode: idx + 1, total: arc.beats.length };
}

export function createInitialState(
  country: string, diff: DifficultyId, ideo: IdeologyId, intro: Intro, rand: () => number = Math.random,
  mode: GameMode = "classic",
): GameState {
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
    resources: { ...START_RES[diff] }, prevResources: null,
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
  return { ...state, currentEvent: ev, lastTurn: null, usedEvents };
}

// Совет собран: предложения советников добавляются к вариантам, тратится один сбор.
export function conveneCouncil(state: GameState, proposals: Choice[]): GameState {
  if (!state.currentEvent || state.councilCharges <= 0) return state;
  return {
    ...state,
    councilCharges: state.councilCharges - 1,
    stats: { ...state.stats, councils: (state.stats?.councils ?? 0) + 1 },
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
export function delayedEffects(choice: Choice): DelayedInfo[] {
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
export function successChance(state: Pick<GameState, "factions" | "resources">, choice: Choice): number {
  if (choice.tags.every(t => t === "delay")) return 1;
  let p = 0.8;
  if (choice.advisor) p += (choice.advisor.skill - 2) * 0.12;
  // исполнителями выступают группы, которым решение выгодно: чем лучше они к вам относятся, тем надёжнее
  const rels: number[] = [];
  for (const tag of choice.tags) {
    for (const [bloc, v] of Object.entries(ACTIONS[tag]?.rel ?? {})) {
      if ((v ?? 0) > 0) for (const f of state.factions) if (f.bloc === bloc) rels.push(f.relation);
    }
  }
  if (rels.length) p += rels.reduce((s, r) => s + r, 0) / rels.length / 400;
  if (state.resources.politicalCapital < 25) p -= 0.1;
  if (state.resources.personalResource < 25) p -= 0.05;
  return Math.round(Math.max(0.3, Math.min(0.95, p)) * 100) / 100;
}

export function rollSuccess(state: Pick<GameState, "seed" | "turn" | "factions" | "resources">, choice: Choice): boolean {
  return seededRandom(hashSeed(state.seed ?? 0, state.turn, choice.id, choice.text))() < successChance(state, choice);
}

export function choiceEffects(state: Pick<GameState, "ideo" | "factions">, choice: Choice, failed = false) {
  const res: Record<string, number> = {};
  const rel: Record<string, number> = {};
  const appr: Record<string, number> = {};
  const ideo = IDEOLOGY_ACTIONS[state.ideo];
  addDelta(res, choice.arc?.effect);
  for (const tag of choice.tags) {
    const a = ACTIONS[tag];
    if (!a) continue;
    addDelta(res, a.res);
    if (ideo.aligned.includes(tag)) addDelta(res, IDEOLOGY_BONUS);
    if (ideo.opposed.includes(tag)) addDelta(res, IDEOLOGY_PENALTY);
    for (const f of state.factions) {
      addDelta(rel, { [f.id]: a.rel[f.bloc] });
      addDelta(appr, { [f.id]: a.appr?.[f.bloc] });
    }
  }
  // Качество советника: потери умножаются на cost, выгода — на gain.
  const skill = choice.advisor ? ADVISOR_SKILL[choice.advisor.skill] : null;
  if (skill) for (const k of Object.keys(res)) res[k] *= res[k] < 0 ? skill.cost : skill.gain;
  // Провал: выгода почти не наступает, а цена растёт.
  if (failed) {
    for (const k of Object.keys(res)) res[k] *= res[k] < 0 ? 1.15 : 0.5;
    for (const k of Object.keys(rel)) if (rel[k] > 0) rel[k] *= 0.5;
  }
  return {
    resources: limitDelta(res, LIMITS.resourceDelta) as ResourceDelta,
    factionRel: limitDelta(rel, LIMITS.factionRelDelta),
    factionAppr: limitDelta(appr, LIMITS.factionApprDelta),
  };
}

export interface TurnPlan {
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
  let resources = applyDeltas(state.resources, effects.resources);
  const nextTurn = state.turn + 1;

  // Срабатывают отложенные последствия прошлых решений; новые встают в очередь.
  const pendingAll = state.pending ?? [];
  const matured = pendingAll.filter(p => p.due <= nextTurn);
  for (const p of matured) resources = applyDeltas(resources, p.res);
  const scheduled: Pending[] = delayedEffects(choice).map((d, i) => ({
    id: `p${nextTurn}_${i}`, due: nextTurn + d.turns, label: d.label, res: d.res, source: choice.text,
  }));
  const pending = [...pendingAll.filter(p => p.due > nextTurn), ...scheduled].slice(-MAX_PENDING);
  if (event.randomEvent) resources = applyDeltas(resources, event.randomEvent.resourceEffect);

  const factions = applyFactionChanges(state.factions, effects.factionRel, effects.factionAppr);
  const figureChanges: Record<string, number> = {};
  for (const fig of state.keyFigures) {
    const d = effects.factionRel[fig.faction];
    if (d) figureChanges[fig.id] = Math.round(d * 0.8);
  }
  const keyFigures = applyFigureChanges(state.keyFigures, figureChanges);

  let crises = state.activeCrises;
  let resolvedCrisis: string | null = null;
  const hit = choice.resolvesCrisis ? crises.find(c => c.id === choice.resolvesCrisis) : null;
  if (hit) {
    resolvedCrisis = hit.title;
    crises = crises.filter(c => c.id !== hit.id);
  }

  const tick = tickCrises(crises, resources);
  crises = tick.crises;
  resources = tick.resources;

  // Давление обстоятельств (по сложности) и вредительство враждебных фракций.
  const turn = state.turn + 1;
  const pressure = DIFF_PRESSURE[state.diff] ?? 0;
  if (pressure) {
    resources = applyDeltas(resources, {
      [RESOURCE_KEYS[turn % RESOURCE_KEYS.length]]: -Math.ceil(pressure / 2),
      [RESOURCE_KEYS[(turn + 3) % RESOURCE_KEYS.length]]: -Math.floor(pressure / 2),
    });
  }
  const hostile = factions.filter(f => f.relation <= HOSTILE_RELATION);
  for (const f of hostile) resources = applyDeltas(resources, HOSTILE_DRAIN[f.bloc]);

  // Институты понемногу восстанавливаются: просевшие ресурсы подтягиваются вверх.
  for (const k of RESOURCE_KEYS) {
    if (resources[k] < RECOVERY_BELOW && resources[k] > 0) resources[k] = clamp(resources[k] + RECOVERY_RATE);
  }

  // Ресурс, провалившийся ниже порога, порождает кризис — если по нему ещё нет кризиса.
  let newCrisisKey: ResourceKey | null = null;
  if (crises.length < LIMITS.maxActiveCrises) {
    newCrisisKey = RESOURCE_KEYS.find(k =>
      resources[k] < CRISIS_THRESHOLD && state.resources[k] >= CRISIS_THRESHOLD &&
      !crises.some(c => c.resourceDrain[k])) ?? null;
  }

  // Выборы: по итогам хода считается опрос, он же — результат голосования.
  let election: Election | null = null;
  const kind = ELECTIONS[turn];
  if (kind) {
    const polls = computePolls(state.country, factions, resources);
    const top = [...polls.parties].sort((a, b) => b.share - a.share)[0] ?? { id: "", name: "", share: 0 };
    const outcome = polls.leader > top.share ? "won" : kind === "parliament" && polls.leader < IMPEACH_RATING ? "impeached" : "lost";
    election = { turn, kind, leader: polls.leader, top, outcome };
    if (kind === "parliament") resources = applyDeltas(resources, outcome === "won" ? ELECTION_WIN_BONUS : ELECTION_LOSS_PENALTY);
  }

  let endType = election?.outcome === "impeached" ? "impeachment" : detectEnd(resources, factions, turn);
  if (endType === "mandate" && election?.outcome === "won") endType = "reelected";

  return {
    choice, effects, success, chance, resources, factions, keyFigures, crises, election, matured, scheduled, pending,
    resolvedCrisis, expiredCrises: tick.expired, hostileFactions: hostile.map(f => f.name), newCrisisKey,
    endType: endType as EndType | null,
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
    },
    pending: plan.pending,
    arc: state.arc ? {
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
