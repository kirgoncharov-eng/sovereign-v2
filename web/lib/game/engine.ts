// Игровой движок: чистые функции без сети и без React.
// Модель пишет текст и предлагает изменения, а считает и применяет их этот модуль.
import {
  ACTIONS, COUNTRIES, CRISIS_DRAIN, DIFF_PRESSURE, HOSTILE_DRAIN, HOSTILE_RELATION, CRISIS_LIFETIME, CRISIS_THRESHOLD, DIFF_REL_MOD, FACTIONS_DATA, FIGURE_ROLES,
  IDEOLOGY_ACTIONS, IDEOLOGY_BONUS, IDEOLOGY_PENALTY, IDEOLOGY_REL, LIMITS, MAX_TURNS, RECOVERY_BELOW, RECOVERY_RATE,
  RES_CONFIG, RESOURCE_KEYS, SAVE_VERSION, START_RES,
} from "./data.ts";
import type {
  Choice, Crisis, DifficultyId, EndType, Faction, Figure, GameEvent, GameState, IdeologyId, Intro, Loyalty,
  Narration, NewCrisis, ResourceDelta, ResourceKey, Resources, Verdict,
} from "./types.ts";

export const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
export const clampRel = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));
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
      loyalty: r.baseMood,
      relation,
    };
  });
}

export function computePublicApproval(factions: Faction[]): number {
  if (!factions?.length) return 50;
  return Math.round(factions.reduce((s, f) => s + f.approval, 0) / factions.length);
}

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
  const pa = computePublicApproval(state.factions);
  const minFacRel = Math.min(...state.factions.map(f => f.relation));
  if (minRes <= 10 || pa <= 15 || minFacRel <= -80) return "critical";
  if (minRes <= 22 || pa <= 25 || minFacRel <= -65) return "warning";
  return "none";
}

// Поражение важнее завершения мандата: рухнуть на последнем ходу — всё равно рухнуть.
export function detectEnd(resources: Resources, factions: Faction[], turn: number): EndType | null {
  if (computePublicApproval(factions) <= LIMITS.endApproval || resources.internalLegitimacy <= LIMITS.endResource) return "revolution";
  if (RESOURCE_KEYS.some(k => resources[k] <= LIMITS.endResource)) return "collapse";
  if (turn >= MAX_TURNS) return "mandate";
  return null;
}

export function createInitialState(
  country: string, diff: DifficultyId, ideo: IdeologyId, intro: Intro, rand: () => number = Math.random,
): GameState {
  return {
    version: SAVE_VERSION,
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
    currentEvent: null,
    lastTurn: null,
    ended: false, endType: null, powerLoss: null,
    verdict: null,
  };
}

export function startEvent(state: GameState, event: GameEvent): GameState {
  return { ...state, currentEvent: event, lastTurn: null };
}

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
export function choiceEffects(state: Pick<GameState, "ideo" | "factions">, choice: Choice) {
  const res: Record<string, number> = {};
  const rel: Record<string, number> = {};
  const appr: Record<string, number> = {};
  const ideo = IDEOLOGY_ACTIONS[state.ideo];
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
  return {
    resources: limitDelta(res, LIMITS.resourceDelta) as ResourceDelta,
    factionRel: limitDelta(rel, LIMITS.factionRelDelta),
    factionAppr: limitDelta(appr, LIMITS.factionApprDelta),
  };
}

export interface TurnPlan {
  choice: Choice;
  effects: ReturnType<typeof choiceEffects>;
  resources: Resources;
  factions: Faction[];
  keyFigures: Figure[];
  crises: Crisis[];
  resolvedCrisis: string | null;
  expiredCrises: string[];
  hostileFactions: string[];
  newCrisisKey: ResourceKey | null; // ресурс, провал которого породил новый кризис
  endType: EndType | null;
}

// Весь расчёт хода без текста. Модель потом описывает именно этот итог.
export function planTurn(state: GameState, choiceId: string): TurnPlan {
  const event = state.currentEvent;
  if (!event) throw new Error("Нет активного события");
  const choice = event.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error("Неизвестный вариант решения");

  const effects = choiceEffects(state, choice);
  let resources = applyDeltas(state.resources, effects.resources);
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

  return {
    choice, effects, resources, factions, keyFigures, crises,
    resolvedCrisis, expiredCrises: tick.expired, hostileFactions: hostile.map(f => f.name), newCrisisKey,
    endType: detectEnd(resources, factions, turn),
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
    history: [...state.history, {
      year: state.year, title: event.title, choice: plan.choice.text,
      headline: narration.headline, historianNote: narration.historianNote,
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
    },
    ended: plan.endType !== null,
    endType: plan.endType,
    powerLoss: plan.endType && plan.endType !== "mandate" ? narration.powerLoss : null,
  };
}
