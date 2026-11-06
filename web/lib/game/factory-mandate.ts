// Контроль существующей заводской подписи: запись фактов, без повторного исполнения и нового таймера.
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { RESOURCE_KEYS } from './data.ts';
import { executionProfile } from './execution-risk.ts';
import type { Choice, GameState, HistoryEntry, ResourceDelta, TurnReport } from './types.ts';

export interface FactoryMandate {
  route: 'a' | 'b' | 'c';
  issued: number;
  success: boolean;
  responsibility: string;
  coordinators: { id: string; name: string; role: string }[];
  spent: ResourceDelta | null;
  followUp: { id: string; label: string; due: number } | null;
  settled?: { turn: number; actual: ResourceDelta | null };
}

type Signature = Pick<TurnReport, 'success' | 'sources' | 'scheduled'>;
type Settlement = Pick<TurnReport, 'matured' | 'sources'>;
const enabled = (state: Pick<GameState, 'country' | 'daily'>) => state.country === ALTERNATE_COUNTRY && !state.daily;

function recordedDelta(sources: TurnReport['sources'], label: string): ResourceDelta | null {
  if (!sources) return null;
  const result: ResourceDelta = {};
  for (const key of RESOURCE_KEYS) {
    const entries = (sources[key] ?? []).filter(([source]) => source === label);
    // Одноимённые платежи нельзя приписать конкретному поручению без разбивки.
    if (entries.length > 1) return null;
    if (entries[0]?.[1]) result[key] = entries[0][1];
  }
  return result;
}

export function recordFactoryMandate(state: GameState, choice: Choice, plan: Signature): FactoryMandate | undefined {
  const profile = enabled(state) ? executionProfile(state, choice) : null;
  if (!profile) return undefined;
  const actual = recordedDelta(plan.sources, 'решение');
  const later = plan.scheduled.find(effect => effect.label === choice.deal?.later?.label);
  return {
    route: choice.id as FactoryMandate['route'], issued: state.turn + 1, success: plan.success,
    responsibility: profile.responsibility,
    coordinators: profile.coordinators.flatMap(id => {
      const advisor = state.advisors.find(person => person.id === id);
      return advisor ? [{ id, name: advisor.name, role: advisor.role }] : [];
    }),
    spent: actual === null ? null : Object.fromEntries(Object.entries(actual).filter(([, value]) => value! < 0)) as ResourceDelta,
    followUp: later ? { id: later.id, label: later.label, due: later.due } : null,
  };
}

/** Фиксируем только реально сработавшее последствие; деньги уже учтены движком. */
export function settleFactoryMandates(state: GameState, plan: Settlement): HistoryEntry[] {
  if (!enabled(state)) return state.history;
  return state.history.map(entry => {
    const mandate = entry.factoryMandate;
    if (!mandate?.followUp || mandate.settled) return entry;
    const matured = plan.matured.find(effect => effect.id === mandate.followUp!.id
      && effect.due === mandate.followUp!.due && effect.label === mandate.followUp!.label);
    if (!matured) return entry;
    const sameLabel = plan.matured.filter(effect => effect.label.toLowerCase() === matured.label.toLowerCase());
    const actual = sameLabel.length === 1 ? recordedDelta(plan.sources, matured.label.toLowerCase()) : null;
    return { ...entry, factoryMandate: { ...mandate, settled: { turn: state.turn + 1, actual } } };
  });
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 500;
const deltas = (value: unknown, max = 100) => object(value) && Object.entries(value).every(([key, amount]) =>
  RESOURCE_KEYS.includes(key as typeof RESOURCE_KEYS[number]) && integer(amount, -100, max));

export function validFactoryMandate(value: unknown, turn: number): value is FactoryMandate {
  if (!object(value) || !['a', 'b', 'c'].includes(String(value.route)) || !integer(value.issued, 1, turn)
    || typeof value.success !== 'boolean' || !text(value.responsibility) || !(value.spent === null || deltas(value.spent, 0))
    || !Array.isArray(value.coordinators) || value.coordinators.length > 2
    || !value.coordinators.every(person => object(person) && ['economist', 'diplomat'].includes(String(person.id))
      && text(person.name) && text(person.role))) return false;
  const ids = value.coordinators.map(person => (person as Record<string, unknown>).id);
  if (new Set(ids).size !== ids.length) return false;
  const followUp = value.followUp;
  if (followUp !== null && (!object(followUp) || !value.success || !text(followUp.id) || !text(followUp.label)
    || !integer(followUp.due, value.issued + 1, value.issued + 40))) return false;
  const settled = value.settled;
  return settled === undefined || object(settled) && object(followUp)
    && integer(settled.turn, followUp.due as number, turn) && (settled.actual === null || deltas(settled.actual));
}
