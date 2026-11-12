// До первого дела кандидатуры — черновик. Только общее утверждение исполняет назначения.
import { ADVISOR_ROLES, RESOURCE_KEYS } from './data.ts';
import { applyCabinetAction, cabinetCandidates, cabinetEnabled, prepareCabinet } from './cabinet.ts';
import type { Advisor, GameState, ResourceDelta } from './types.ts';

export interface CabinetFormation {
  status: 'pending' | 'confirmed';
  selected: Record<string, string>;
}

export const formingCabinet = (state: GameState | null) => !!state && cabinetEnabled(state)
  && state.cabinetFormation?.status === 'pending';

export function beginCabinetFormation(state: GameState): GameState {
  if (!cabinetEnabled(state) || state.cabinetFormation) return state;
  if (state.turn !== 0 || state.currentEvent || state.history.length || state.ended || state.cabinet?.changes) {
    throw new Error('Первоначальный состав доступен только до первого дела.');
  }
  return { ...prepareCabinet(state), cabinetFormation: { status: 'pending', selected: {} } };
}

export function selectInitialAdvisor(state: GameState, seat: string, candidate: string | null): GameState {
  if (!formingCabinet(state)) throw new Error('Первоначальный состав уже утверждён.');
  if (!ADVISOR_ROLES.some(role => role.id === seat)) throw new Error('Должность не найдена.');
  if (candidate !== null && !cabinetCandidates(state, seat).some(person => person.id === candidate)) {
    throw new Error('Кандидат не подходит для этой должности.');
  }
  const selected = { ...state.cabinetFormation!.selected };
  if (candidate === null) delete selected[seat]; else selected[seat] = candidate;
  return { ...state, cabinetFormation: { status: 'pending', selected } };
}

export function resetInitialCabinet(state: GameState): GameState {
  if (!formingCabinet(state)) throw new Error('Первоначальный состав уже утверждён.');
  return { ...state, cabinetFormation: { status: 'pending', selected: {} } };
}

/** Карточка выбранного человека до назначения; не меняет его отношения и не раскрывает скрытый навык. */
export function initialAdvisor(state: GameState, seat: string): Advisor | undefined {
  const id = state.cabinetFormation?.selected[seat];
  if (!id) return state.advisors.find(person => person.id === seat);
  const candidate = cabinetCandidates(state, seat).find(person => person.id === id);
  const role = ADVISOR_ROLES.find(role => role.id === seat);
  if (!candidate || !role) return undefined;
  return { id: seat, name: candidate.name, role: role.role, emoji: role.emoji, skill: candidate.skill,
    loyalty: candidate.loyalty, bio: candidate.bio, title: candidate.title, camp: candidate.camp, origin: candidate.channel };
}

export function initialCabinetPreview(state: GameState) {
  let next = state;
  let unavailable: string | null = formingCabinet(state) ? null : 'Первоначальный состав уже утверждён.';
  if (!unavailable) try {
    for (const role of ADVISOR_ROLES) {
      const candidate = state.cabinetFormation!.selected[role.id];
      if (candidate) next = applyCabinetAction(next, { kind: 'hire', candidate }, 'formation');
    }
  } catch (error) { unavailable = error instanceof Error ? error.message : 'Не удалось подготовить состав.'; }
  const cost: ResourceDelta = {};
  if (!unavailable) for (const key of RESOURCE_KEYS) {
    const delta = next.resources[key] - state.resources[key];
    if (delta) cost[key] = delta;
  }
  const reactions = unavailable ? [] : state.factions.map(faction => ({ id: faction.id, name: faction.name,
    delta: next.factions.find(after => after.id === faction.id)!.relation - faction.relation,
  })).filter(reaction => reaction.delta);
  return { next, cost, reactions, unavailable };
}

export function confirmInitialCabinet(state: GameState): GameState {
  if (state.cabinetFormation?.status === 'confirmed') return state;
  const preview = initialCabinetPreview(state);
  if (preview.unavailable) throw new Error(preview.unavailable);
  return { ...preview.next, cabinetFormation: { ...state.cabinetFormation!, status: 'confirmed' },
    // Первые назначения не считаются перестановками уже действующего совета. Их расходы остаются в ведомости.
    cabinet: { ...preview.next.cabinet!, changes: 0 },
  };
}

export function validCabinetFormation(value: unknown, state: GameState): value is CabinetFormation {
  if (!value || typeof value !== 'object' || !cabinetEnabled(state)) return false;
  const formation = value as CabinetFormation;
  if (!['pending', 'confirmed'].includes(formation.status) || !formation.selected
    || typeof formation.selected !== 'object' || Array.isArray(formation.selected)) return false;
  if (formation.status === 'pending' && (state.turn !== 0 || state.currentEvent || state.history.length || state.ended || !state.cabinet)) return false;
  return Object.entries(formation.selected).every(([seat, candidate]) => ADVISOR_ROLES.some(role => role.id === seat)
    && typeof candidate === 'string' && candidate.startsWith(`cabinet:0:${seat}:`)
    && (formation.status === 'confirmed' || state.cabinet!.roster.some(person => person.id === candidate && person.seat === seat)));
}
