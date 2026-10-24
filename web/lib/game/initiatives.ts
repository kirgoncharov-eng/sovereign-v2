// Инициативы не двигают календарь: подпись расходует общий с поручениями резерв квартала.
import { CRISIS_THRESHOLD, MAX_PENDING, RESOURCE_KEYS, TERM } from './data.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { MAX_PACTS, PACT_SIGN, pactBans } from './people.ts';
import { isObj } from './sanitize.ts';
import type { Bloc, GameState, Pact, Pending, ResourceDelta, ResourceKey, Resources } from './types.ts';

export type InitiativeId = 'advance:domestic' | 'advance:russia' | 'advance:west' | 'support:regional' | 'support:ruling'
  | 'garrison' | 'settlement' | 'payments' | 'delegate';
export type InitiativeReserve = 'advance' | 'support' | 'garrison' | 'settlement' | 'payments' | 'delegate';
export type InitiativeBlock = 'unavailable_campaign' | 'first_decision' | 'ended' | 'intervention_used' | 'reserve_used'
  | 'actor_missing' | 'partner_refuses' | 'pact_exists' | 'pact_limit' | 'repayment_after_term' | 'resource_floor'
  | 'resource_threshold' | 'security_warning' | 'no_gain';
export interface InitiativeActor { kind: 'figure' | 'advisor'; id: string; name: string; role: string }
export interface InitiativeSignature {
  id: InitiativeId;
  reserve: InitiativeReserve;
  term: number;
  turn: number;
  actor: InitiativeActor;
  immediate: ResourceDelta;
  repaymentId?: string;
}
export interface InitiativeState { version: 1; lastActionTurn: number | null; signed: InitiativeSignature[] }
export interface InitiativeOption {
  id: InitiativeId;
  reserve: InitiativeReserve;
  resource: ResourceKey;
  actor: InitiativeActor | null;
  faction: { id: string; name: string; bloc: Bloc } | null;
  immediate: ResourceDelta;
  factionChanges: Record<string, number>;
  signedTurn: number;
  term: number;
  reserveRemaining: 0 | 1;
  repayment: { id: string; due: number; res: ResourceDelta } | null;
  pact: Pact | null;
  blocked: { code: InitiativeBlock; resource?: ResourceKey; after?: number } | null;
}

interface Definition {
  id: InitiativeId;
  reserve: InitiativeReserve;
  resource: ResourceKey;
  label: string;
  res: ResourceDelta;
  advisor?: string;
  bloc?: Bloc;
  relations?: Partial<Record<Bloc, number>>;
}
const DEFINITIONS: readonly Definition[] = [
  { id: 'advance:domestic', reserve: 'advance', resource: 'economy', label: 'Аванс казначейства', advisor: 'economist',
    res: { economy: 8, politicalCapital: -3, internalLegitimacy: -2 } },
  { id: 'advance:russia', reserve: 'advance', resource: 'economy', label: 'Аванс Российской делегации', bloc: 'russia',
    res: { economy: 8, personalResource: -2, externalReputation: -3 }, relations: { russia: 4, west: -4, nationalist: -2 } },
  { id: 'advance:west', reserve: 'advance', resource: 'economy', label: 'Аванс Торгового союза', bloc: 'west',
    res: { economy: 8, personalResource: -2, politicalCapital: -3 }, relations: { west: 4, security: -4, russia: -4 } },
  { id: 'support:regional', reserve: 'support', resource: 'politicalCapital', label: 'Поддержка областей', bloc: 'regional',
    res: { politicalCapital: 6, economy: -3, personalResource: -2 } },
  { id: 'garrison', reserve: 'garrison', resource: 'military', label: 'Снабжение гарнизонов', advisor: 'security',
    res: { military: 6, economy: -5, politicalCapital: -1 } },
  { id: 'settlement', reserve: 'settlement', resource: 'externalReputation', label: 'Урегулирование внешних претензий', bloc: 'west',
    res: { externalReputation: 6, economy: -4, politicalCapital: -2 } },
  { id: 'payments', reserve: 'payments', resource: 'internalLegitimacy', label: 'Резерв срочных выплат', advisor: 'economist',
    res: { internalLegitimacy: 6, economy: -5, politicalCapital: -1 } },
  { id: 'delegate', reserve: 'delegate', resource: 'personalResource', label: 'Делегирование согласований', advisor: 'strategist',
    res: { personalResource: 7, politicalCapital: -4, economy: -1 } },
];
const bounded = (n: number, min = 0) => Math.max(min, Math.min(100, Math.round(n)));
const enabled = (gs: GameState) => gs.country === ALTERNATE_COUNTRY && !gs.daily;
const definition = (id: string) => DEFINITIONS.find(entry => entry.id === id);
const signatures = (gs: GameState) => enabled(gs) ? gs.initiatives?.signed ?? [] : [];
const debtId = (term: number) => `initiative:${term}:advance`;

// Старые сохранения учитывают только world.lastActionTurn; ранняя подпись живёт вне ещё не открытого world.
export function interventionUsed(gs: GameState): boolean {
  return gs.world?.lastActionTurn === gs.turn || enabled(gs) && gs.initiatives?.lastActionTurn === gs.turn;
}

export function initiativeOptions(gs: GameState, resource?: ResourceKey): InitiativeOption[] {
  if (!enabled(gs)) return [];
  const term = Math.floor(gs.turn / TERM), signedTurn = gs.turn + 1;
  return DEFINITIONS.filter(entry => !resource || entry.resource === resource).map(entry => {
    const faction = entry.bloc ? gs.factions.find(f => f.bloc === entry.bloc) ?? null : null;
    const person = entry.advisor ? gs.advisors.find(a => a.id === entry.advisor)
      : gs.keyFigures.find(f => f.faction === faction?.id);
    const actor: InitiativeActor | null = person
      ? { kind: entry.advisor ? 'advisor' : 'figure', id: person.id, name: person.name, role: person.role } : null;
    const immediate: ResourceDelta = {};
    for (const key of RESOURCE_KEYS) if (entry.res[key] !== undefined) {
      immediate[key] = bounded(gs.resources[key] + entry.res[key]!) - gs.resources[key];
    }
    const factionChanges: Record<string, number> = {};
    for (const f of gs.factions) {
      const delta = entry.reserve === 'support' && f.id === faction?.id ? PACT_SIGN.faction : entry.relations?.[f.bloc];
      if (delta) factionChanges[f.id] = bounded(f.relation + delta, -100) - f.relation;
    }
    const reserveRemaining = signatures(gs).some(s => s.term === term && s.reserve === entry.reserve) ? 0 : 1;
    const repayment = entry.reserve === 'advance' ? { id: debtId(term), due: signedTurn + 3, res: { economy: -10 } } : null;
    const pact: Pact | null = entry.reserve === 'support' && faction && actor ? {
      faction: faction.id, figure: actor.id, since: signedTurn, until: signedTurn + 3, ban: pactBans(faction.bloc, 2), against: null,
    } : null;
    let blocked: InitiativeOption['blocked'] = null;
    const block = (code: InitiativeBlock) => { blocked ??= { code }; };
    if (gs.ended) block('ended');
    if (gs.turn < 1) block('first_decision');
    if (interventionUsed(gs)) block('intervention_used');
    if (!reserveRemaining) block('reserve_used');
    if (!actor) block('actor_missing');
    if (entry.bloc && faction && person && (faction.relation < -20 || !('relation' in person) || person.relation < 0)) {
      block('partner_refuses');
    }
    if (entry.reserve === 'support' && faction) {
      if (gs.pacts?.some(p => p.faction === faction.id)) block('pact_exists');
      if ((gs.pacts?.length ?? 0) >= MAX_PACTS) block('pact_limit');
    }
    if (repayment && repayment.due > (term + 1) * TERM) block('repayment_after_term');
    if (entry.id === 'garrison') {
      const security = gs.factions.filter(f => f.bloc === 'security');
      const relation = security.length ? security.reduce((sum, f) => sum + f.relation, 0) / security.length : 0;
      if (relation <= -55) block('security_warning');
    }
    for (const key of RESOURCE_KEYS) if ((entry.res[key] ?? 0) < 0) {
      const after = gs.resources[key] + immediate[key]!;
      if (!blocked && after <= 4) blocked = { code: 'resource_floor', resource: key, after };
      if (!blocked && gs.resources[key] >= CRISIS_THRESHOLD && after < CRISIS_THRESHOLD) {
        blocked = { code: 'resource_threshold', resource: key, after };
      }
    }
    if (!immediate[entry.resource]) block('no_gain');
    return { id: entry.id, reserve: entry.reserve, resource: entry.resource, actor,
      faction: faction ? { id: faction.id, name: faction.name, bloc: faction.bloc } : null,
      immediate, factionChanges, signedTurn, term, reserveRemaining, repayment, pact, blocked };
  });
}

export function confirmInitiative(gs: GameState, id: InitiativeId): GameState {
  const option = initiativeOptions(gs).find(entry => entry.id === id);
  if (!option || option.blocked || !option.actor) throw new Error(option?.blocked?.code ?? 'unavailable_campaign');
  const receipt: InitiativeSignature = {
    id, reserve: option.reserve, term: option.term, turn: gs.turn, actor: { ...option.actor }, immediate: { ...option.immediate },
    ...(option.repayment ? { repaymentId: option.repayment.id } : {}),
  };
  const resources = { ...gs.resources };
  for (const key of RESOURCE_KEYS) resources[key] += option.immediate[key] ?? 0;
  const pending: Pending[] = option.repayment ? [...gs.pending, {
    ...option.repayment, from: gs.turn, label: `Возврат: ${definition(id)!.label}`, source: definition(id)!.label,
  }] : gs.pending;
  return {
    ...gs, resources, pending,
    initiatives: { version: 1, lastActionTurn: gs.turn, signed: [...signatures(gs), receipt] },
    ...(gs.world ? { world: { ...gs.world, lastActionTurn: gs.turn } } : {}),
    factions: gs.factions.map(f => ({ ...f, relation: f.relation + (option.factionChanges[f.id] ?? 0) })),
    ...(option.pact ? {
      pacts: [...(gs.pacts ?? []), option.pact],
      keyFigures: gs.keyFigures.map(f => f.id === option.actor!.id
        ? { ...f, relation: bounded(f.relation + PACT_SIGN.figure, -100), loyalty: loyalty(bounded(f.relation + PACT_SIGN.figure, -100)) } : f),
    } : {}),
  };
}
const loyalty = (n: number) => n >= 30 ? 'союзник' as const : n <= -30 ? 'враг' as const : 'нейтрал' as const;

// Долг инициативы не занимает один из прежних слотов: старые последствия и бюджетный заём не вытесняются из-за него.
export function retainInitiativeDebts(gs: GameState, pending: Pending[]): Pending[] {
  const protectedIds = new Set(signatures(gs).flatMap(s => s.repaymentId ? [s.repaymentId] : []));
  if (!protectedIds.size) return pending.slice(-MAX_PENDING);
  const normal = new Set(pending.filter(p => !protectedIds.has(p.id)).slice(-MAX_PENDING));
  return pending.filter(p => protectedIds.has(p.id) || normal.has(p));
}

export function initiativePactWaiting(gs: GameState, pact: Pact, nextTurn: number): boolean {
  return nextTurn <= pact.since && signatures(gs).some(s => s.reserve === 'support'
    && s.actor.kind === 'figure' && s.actor.id === pact.figure && s.turn + 1 === pact.since);
}

// В отчёт текущего квартала попадают уже исполненные подписи, без повторного применения их цены.
export function initiativeResourcesBefore(gs: GameState): Resources {
  const resources = { ...gs.resources };
  for (const s of signatures(gs).filter(s => s.turn === gs.turn)) {
    for (const key of RESOURCE_KEYS) resources[key] = bounded(resources[key] - (s.immediate[key] ?? 0));
  }
  return resources;
}
export function initiativeTurnSources(gs: GameState): { label: string; res: ResourceDelta }[] {
  return signatures(gs).filter(s => s.turn === gs.turn).map(s => ({ label: definition(s.id)!.label, res: s.immediate }));
}

// Не сбрасываем повреждённый учёт резервов: иначе reload позволил бы подписывать повторно.
export function validInitiatives(value: unknown, gs: GameState): boolean {
  if (!enabled(gs) || !isObj(value) || value.version !== 1 || !Array.isArray(value.signed)) return false;
  const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
  const used = new Set<string>(), turns = new Set<number>();
  let last: number | null = null;
  for (const row of value.signed) {
    if (!isObj(row) || typeof row.id !== 'string') return false;
    const entry = definition(row.id);
    if (!entry || row.reserve !== entry.reserve || !integer(row.turn, gs.turn) || Number(row.turn) < 1
      || row.term !== Math.floor(Number(row.turn) / TERM) || !isObj(row.actor)
      || !['figure', 'advisor'].includes(String(row.actor.kind))
      || typeof row.actor.id !== 'string' || !row.actor.id || typeof row.actor.name !== 'string' || !row.actor.name
      || typeof row.actor.role !== 'string' || !row.actor.role
      || !isObj(row.immediate) || Object.keys(row.immediate).some(key => !RESOURCE_KEYS.includes(key as ResourceKey))
      || Object.values(row.immediate).some(n => typeof n !== 'number' || !Number.isInteger(n) || n < -100 || n > 100)) return false;
    if (last !== null && Number(row.turn) <= last) return false;
    for (const key of RESOURCE_KEYS) {
      const actual = Number(row.immediate[key] ?? 0), nominal = entry.res[key] ?? 0;
      if (nominal < 0 ? actual !== nominal : actual < 0 || actual > nominal) return false;
    }
    const key = `${row.term}:${row.reserve}`;
    if (used.has(key) || turns.has(Number(row.turn))) return false;
    if (entry.reserve === 'advance') {
      if (row.repaymentId !== debtId(Number(row.term)) || Number(row.turn) + 4 > (Number(row.term) + 1) * TERM) return false;
      const due = Number(row.turn) + 4;
      const debts = gs.pending.filter(p => p.id === row.repaymentId);
      if (gs.turn < due && (debts.length !== 1 || debts[0].due !== due || debts[0].res.economy !== -10
        || Object.keys(debts[0].res).length !== 1)) return false;
      if (gs.turn >= due && debts.length) return false;
    } else if (row.repaymentId !== undefined) return false;
    used.add(key); turns.add(Number(row.turn)); last = Number(row.turn);
  }
  return value.lastActionTurn === last;
}
