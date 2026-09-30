// Игровой движок: чистые функции без сети и без React.
// Модель пишет текст и предлагает изменения, а считает и применяет их этот модуль.
import {
  COUNTRIES, CRISIS_LIFETIME, DIFF_REL_MOD, FACTIONS_DATA, FIGURE_ROLES, IDEOLOGY_REL,
  LIMITS, MAX_TURNS, RESOURCE_KEYS, SAVE_VERSION, START_RES,
} from "./data.ts";
import type {
  Consequence, Crisis, DifficultyId, EndType, Faction, Figure, GameEvent, GameState,
  IdeologyId, Intro, Loyalty, ResourceDelta, Resources, Verdict,
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
  if (computePublicApproval(factions) <= LIMITS.endApproval) return "revolution";
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

export function resolveTurn(state: GameState, choiceId: string, consequence: Consequence): GameState {
  const event = state.currentEvent;
  if (!event) throw new Error("Нет активного события");
  const choice = event.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error("Неизвестный вариант решения");

  let resources = applyDeltas(state.resources, consequence.resourceChanges);
  if (event.randomEvent) resources = applyDeltas(resources, event.randomEvent.resourceEffect);

  const factions = applyFactionChanges(state.factions, consequence.factionRelChanges, consequence.factionApprChanges);
  const keyFigures = applyFigureChanges(state.keyFigures, consequence.figureRelChanges);

  let crises = state.activeCrises;
  let resolvedCrisis: string | null = null;
  if (consequence.crisisResolved) {
    const hit = crises.find(c => c.id === consequence.crisisResolved);
    if (hit) {
      resolvedCrisis = hit.title;
      crises = crises.filter(c => c.id !== hit.id);
    }
  }

  const tick = tickCrises(crises, resources);
  resources = tick.resources;
  crises = tick.crises;

  const turn = state.turn + 1;
  let addedCrisis = false;
  if (consequence.newCrisis && crises.length < LIMITS.maxActiveCrises) {
    crises = [...crises, { ...consequence.newCrisis, id: `c${turn}`, turnsActive: 0 }];
    addedCrisis = true;
  }

  const endType = detectEnd(resources, factions, turn);

  return {
    ...state,
    resources, prevResources: { ...state.resources },
    factions, prevFactions: state.factions.map(f => ({ ...f })),
    keyFigures, prevFigures: state.keyFigures.map(f => ({ ...f })),
    activeCrises: crises,
    turn,
    year: state.year + (turn % 4 === 0 ? 1 : 0),
    history: [...state.history, {
      year: state.year, title: event.title, choice: choice.text,
      headline: consequence.headline, historianNote: consequence.historianNote,
    }],
    currentEvent: null,
    lastTurn: {
      ...consequence,
      choiceText: choice.text,
      resolvedCrisis,
      expiredCrises: tick.expired,
      addedCrisis,
    },
    ended: endType !== null,
    endType,
    powerLoss: endType && endType !== "mandate" ? consequence.powerLoss : null,
  };
}
