// Кадровый указ 1978 года: сначала должность, затем человек. Старый резерв и архив не меняются.
import { ALTERNATE_COUNTRY, campaignText } from './alternate-world.ts';
import { ADVISOR_ROLES, RESOURCE_KEYS } from './data.ts';
import { hashSeed } from './engine.ts';
import { candidatePool, dismissalOf, type Candidate } from './staffing.ts';
import { CHANNELS, DISMISSAL, type Channel } from '../content/staffing.ts';
import { secretaryStaffingChange } from './secretary.ts';
import { beatEvent } from './classic.ts';
import type { Advisor, GameState, ResourceDelta } from './types.ts';

export interface CabinetState {
  year: number;
  roster: Candidate[];
  changedTurn: number;
  changes: number;
  departed: Advisor[];
  backedChannels?: Channel[];
  entries?: { turn: number; label: string; res: ResourceDelta }[];
}
export type CabinetAction = { kind: 'hire'; candidate: string } | { kind: 'dismiss'; seat: string; name: string };
export const cabinetEnabled = (state: Pick<GameState, 'country' | 'daily'>) => state.country === ALTERNATE_COUNTRY && !state.daily;
const yearOf = (state: GameState) => Math.floor(state.turn / 4);
const bounded = (n: number, min = 0) => Math.max(min, Math.min(100, n));
const seats = new Set(ADVISOR_ROLES.map(role => role.id));

/** Предложения не меняются от открытия окна; новый кандидат появляется только после подписанного найма. */
function nextCandidate(state: GameState, seat: string, ordinal: number, roster: Candidate[]): Candidate {
  const year = yearOf(state), others = roster.filter(person => person.seat === seat);
  const occupied = new Set([state.leader.name, ...state.advisors.map(person => person.name),
    ...state.keyFigures.map(person => person.name), ...(state.world?.people.map(person => person.name) ?? []),
    ...(state.former ?? []), ...roster.map(person => person.name), state.arc?.target, state.world?.secretary?.name]);
  for (let attempt = 0; attempt < 200; attempt++) {
    const pool = candidatePool({ ...state, seed: hashSeed(state.seed, 'cabinet', year, seat, ordinal, attempt),
      staffing: undefined, former: [...(state.former ?? []), ...roster.map(person => person.name)] });
    const candidate = pool.find(person => person.seat === seat
      && !occupied.has(person.name)
      && !others.some(other => other.channel === person.channel)
      && (others.some(other => !CHANNELS[other.channel].absurd) || !CHANNELS[person.channel].absurd));
    if (candidate) return { ...candidate, id: `cabinet:${year}:${seat}:${ordinal}` };
  }
  throw new Error('Не удалось подготовить кандидатов на должность');
}

function rosterFor(state: GameState): Candidate[] {
  if (state.cabinet?.year === yearOf(state)) return state.cabinet.roster;
  const roster: Candidate[] = [];
  for (const role of ADVISOR_ROLES) for (let ordinal = 0; ordinal < 2; ordinal++) {
    roster.push(nextCandidate(state, role.id, ordinal, roster));
  }
  return roster;
}

/** Резерв закрепляется вместе с игровым состоянием, а не при чтении окна. */
export function prepareCabinet(state: GameState): GameState {
  if (!cabinetEnabled(state) || state.cabinet?.year === yearOf(state)) return state;
  return { ...state, cabinet: {
    year: yearOf(state), roster: rosterFor(state),
    changedTurn: state.cabinet?.changedTurn ?? state.turn, changes: state.cabinet?.changes ?? 0,
    departed: state.cabinet?.departed ?? [], backedChannels: backedChannels(state), entries: state.cabinet?.entries ?? [],
  } };
}

function backedChannels(state: GameState): Channel[] {
  if (state.cabinet?.year === yearOf(state) && state.cabinet.backedChannels) return state.cabinet.backedChannels;
  // Совместимость с указами, сохранёнными до появления годового учёта поддержки.
  return [...new Set([...state.advisors, ...(state.cabinet?.departed ?? [])]
    .filter(person => person.since !== undefined && Math.floor(person.since / 4) === yearOf(state) && person.origin)
    .map(person => person.origin!).filter((origin): origin is Channel => Object.hasOwn(CHANNELS, origin)))];
}

export function cabinetTurnSources(state: GameState) {
  return cabinetEnabled(state) ? (state.cabinet?.entries ?? []).filter(entry => entry.turn === state.turn) : [];
}

export function cabinetResourcesBefore(state: GameState, other: { res: ResourceDelta }[] = []) {
  const before = { ...state.resources };
  for (const entry of [...other, ...cabinetTurnSources(state)]) for (const key of RESOURCE_KEYS) before[key] -= entry.res[key] ?? 0;
  return before;
}

export function cabinetCandidates(state: GameState, seat?: string): Candidate[] {
  if (!cabinetEnabled(state)) return [];
  const taken = new Set(state.staffing?.taken ?? []);
  return rosterFor(state).filter(person => !taken.has(person.id) && (!seat || person.seat === seat));
}

const addCosts = (...costs: ResourceDelta[]): ResourceDelta => {
  const total: ResourceDelta = {};
  for (const key of RESOURCE_KEYS) {
    const value = costs.reduce((sum, cost) => sum + (cost[key] ?? 0), 0);
    if (value) total[key] = value;
  }
  return total;
};

/** Один указ может передать уже начатые программы. Деньги, прогресс и срок принадлежат государству. */
export function cabinetAssignments(state: GameState, seat: string) {
  const government = state.world?.government;
  return [
    ...(government?.programs ?? []).filter(program => program.status === 'running' && program.coordinator === seat),
    ...(government?.housingNext?.status === 'running' && government.housingNext.coordinator === seat ? [government.housingNext] : []),
  ];
}

export function cabinetPreview(state: GameState, action: CabinetAction, context: 'ordinary' | 'formation' = 'ordinary') {
  const formation = context === 'formation';
  const candidate = action.kind === 'hire' ? cabinetCandidates(state).find(person => person.id === action.candidate) : undefined;
  const seat = action.kind === 'dismiss' ? action.seat : candidate?.seat;
  const current = formation ? undefined : state.advisors.find(person => person.id === seat);
  const leaving = current ? dismissalOf(state, current) : null;
  const changes = state.cabinet?.changedTurn === state.turn ? state.cabinet.changes : 0;
  // Повторные перестановки расходуют влияние: нет календарного запрета и бесплатной кадровой карусели.
  const administration: ResourceDelta = { politicalCapital: -(2 + (formation ? 0 : changes * 2)) };
  const supported = !!candidate && backedChannels(state).includes(candidate.channel);
  const appointmentCost = Object.fromEntries(Object.entries(candidate?.cost ?? {})
    .map(([key, value]) => [key, supported && value > 0 ? 0 : value]));
  const supportNote = candidate && (Object.values(candidate.cost).some(value => value > 0)
    || Object.values(candidate.relation).some(value => value > 0))
    ? supported ? 'Поддержка этого круга уже получена в этом году. Новое назначение не добавит ресурсов и расположения.'
      : 'Поддержка этого круга при назначении — один раз в год.' : null;
  const quoted = addCosts(administration, appointmentCost, leaving?.cost ?? {});
  const cost: ResourceDelta = {};
  for (const key of RESOURCE_KEYS) {
    const delta = (quoted[key] ?? 0) > 0 ? Math.min(quoted[key]!, 100 - state.resources[key]) : quoted[key] ?? 0;
    if (delta) cost[key] = delta;
  }
  const reactions = state.factions.map(faction => ({
    id: faction.id, name: faction.name,
    delta: bounded(faction.relation + (supported ? Math.min(0, candidate?.relation[faction.bloc] ?? 0) : candidate?.relation[faction.bloc] ?? 0)
      + (leaving?.camp?.id === faction.id ? DISMISSAL.campRelation : 0), -100) - faction.relation,
  })).filter(item => item.delta);
  const unavailable = !cabinetEnabled(state) ? 'Свободные назначения доступны в обычной партии 1978 года.'
    : state.ended ? 'Правление завершено.'
    : formation && (state.cabinetFormation?.status !== 'pending' || state.turn !== 0 || state.currentEvent || state.history.length)
      ? 'Первоначальный состав уже утверждён.'
    : !formation && state.cabinetFormation?.status === 'pending' ? 'Сначала утвердите первоначальный состав.'
    : !seat || !seats.has(seat) ? 'Должность не найдена.'
    : action.kind === 'hire' && !candidate ? 'Кандидат уже назначен или предложение устарело.'
    : action.kind === 'dismiss' && (!current || current.name !== action.name) ? 'Состав команды изменился. Откройте решение заново.'
    : RESOURCE_KEYS.some(key => (cost[key] ?? 0) < 0 && state.resources[key] + (cost[key] ?? 0) <= 4) ? 'Не хватает запаса ресурсов для этого указа.'
    : null;
  return { candidate, current, seat, leaving, cost, reactions, supportNote, unavailable, assignments: seat ? cabinetAssignments(state, seat) : [] };
}

function transferAssignments(state: GameState, seat: string, incoming?: Advisor): GameState {
  if (!state.world?.government) return state;
  const update = <T extends { status: string; coordinator: string | null; name: string | null }>(program: T): T => {
    if (program.status !== 'running' || program.coordinator !== seat) return program;
    const factors = [incoming ? `${incoming.name} принимает незавершённые дела; срок и бюджет прежние.`
      : 'Кресло координатора вакантно. Назначение советника передаст ему незавершённые дела; срок прежний.'];
    return { ...program, ...(incoming ? { name: incoming.name, handoverTurn: state.turn } : {}),
      ...('factors' in program ? { factors } : { lastFactors: factors }) };
  };
  const government = state.world.government;
  // Старые сохранения не содержат автора: закрепляем его до изменения имени координатора.
  const dispatches = state.world.dispatches.map(dispatch => {
    if (dispatch.author !== undefined) return dispatch;
    if (dispatch.id.includes(':housing-next:')) {
      const next = government.housingNext;
      return next ? { ...dispatch, author: next.name ?? next.previousName } : dispatch;
    }
    const program = government.programs.find(program => program.id === dispatch.project);
    return program && ['report', 'news'].includes(dispatch.kind) ? { ...dispatch, author: program.name } : dispatch;
  });
  return { ...state, world: { ...state.world, dispatches, government: { ...government,
    programs: government.programs.map(update),
    ...(government.housingNext ? { housingNext: update(government.housingNext) } : {}),
  } } };
}

export function applyCabinetAction(state: GameState, action: CabinetAction, context: 'ordinary' | 'formation' = 'ordinary'): GameState {
  const preview = cabinetPreview(state, action, context);
  if (preview.unavailable || !preview.seat) throw new Error(preview.unavailable ?? 'Должность не найдена.');
  const { candidate, current, seat, leaving, cost } = preview;
  const role = ADVISOR_ROLES.find(role => role.id === seat)!;
  const incoming: Advisor | undefined = candidate ? {
    id: seat, role: role.role, emoji: role.emoji, name: candidate.name,
    skill: candidate.skill, loyalty: candidate.loyalty, record: { right: 0, wrong: 0 },
    origin: candidate.channel, title: candidate.title, bio: candidate.bio, camp: candidate.camp, since: state.turn,
  } : undefined;
  const receipt = campaignText([
    candidate ? CHANNELS[candidate.channel].receipt.replace('{name}', candidate.name).replace('{title}', candidate.title) : '',
    leaving?.text ?? '',
    preview.supportNote ?? '',
    !incoming ? `Должность «${role.role}» вакантна. Профильной оценки пока нет.` : '',
    preview.assignments.length ? incoming ? 'Незавершённые программы переданы преемнику. Ближайший квартал: передача дел −5 работы.'
      : 'Программы ждут координатора; прежние сроки продолжают идти.' : '',
  ].filter(Boolean).join(' '), state.country);
  const cabinet: CabinetState = {
    year: yearOf(state), roster: rosterFor(state), changedTurn: state.turn,
    changes: (state.cabinet?.changedTurn === state.turn ? state.cabinet.changes : 0) + 1,
    departed: [...(state.cabinet?.departed ?? []), ...(current ? [structuredClone(current)] : [])],
    backedChannels: [...new Set([...backedChannels(state), ...(candidate ? [candidate.channel] : [])])],
    entries: [...cabinetTurnSources(state), { turn: state.turn,
      label: incoming ? `назначение: ${incoming.name}` : `отставка: ${current!.name}`, res: { ...cost } }],
  };
  const resources = { ...state.resources };
  for (const key of RESOURCE_KEYS) resources[key] = bounded(resources[key] + (cost[key] ?? 0));
  const refreshChoice = (choice: NonNullable<GameState['currentEvent']>['choices'][number]) => choice.advisor?.id === seat
    ? { ...choice, advisor: incoming ? { id: seat, name: incoming.name, role: incoming.role, skill: incoming.skill } : null } : choice;
  let next: GameState = {
    ...state, resources, cabinet,
    advisors: ADVISOR_ROLES.flatMap(role => role.id === seat ? incoming ? [incoming] : [] : state.advisors.filter(person => person.id === role.id)),
    factions: state.factions.map(faction => ({ ...faction,
      relation: faction.relation + (preview.reactions.find(reaction => reaction.id === faction.id)?.delta ?? 0),
    })),
    former: current ? [...(state.former ?? []), current.name] : state.former,
    staffing: { lastTurn: state.turn, taken: [...(state.staffing?.taken ?? []), ...(candidate ? [candidate.id] : [])], receipt },
    currentEvent: state.currentEvent ? { ...state.currentEvent, choices: state.currentEvent.choices.map(refreshChoice),
      // Предложения прежнего советника нельзя выдавать за работу преемника.
      council: state.currentEvent.council?.filter(choice => choice.advisor?.id !== seat) ?? null,
    } : null,
    arc: current && state.arc?.target === current.name && !state.arc.epilogue
      ? { ...state.arc, targetRole: `Бывший ${current.role.toLowerCase()}` } : state.arc,
  };
  if (candidate) {
    const remaining = cabinet.roster.filter(person => person.id !== candidate.id);
    const ordinal = 1 + Math.max(...cabinet.roster.filter(person => person.seat === seat).map(person => Number(person.id.split(':').at(-1))));
    cabinet.roster = [...remaining, nextCandidate(next, seat, ordinal, remaining)];
  }
  next = transferAssignments(next, seat, incoming);
  if (next.currentEvent?.beat?.arcId === 'mole' && current?.name === next.arc?.target) {
    next = { ...next, currentEvent: beatEvent(next) ?? next.currentEvent };
  }
  return secretaryStaffingChange(state, next, current?.name);
}

/** Кадровые записи обязательны только после первого нового указа; прежние сохранения не мигрируем. */
export function validCabinet(value: unknown, turn: number): value is CabinetState {
  if (!value || typeof value !== 'object') return false;
  const cabinet = value as CabinetState;
  const integer = (n: unknown, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  const person = (p: unknown): p is Advisor => !!p && typeof p === 'object'
    && seats.has((p as Advisor).id) && ['name', 'role', 'emoji'].every(key => typeof (p as Record<string, unknown>)[key] === 'string')
    && [1, 2, 3].includes((p as Advisor).skill)
    && ((p as Advisor).loyalty === undefined || integer((p as Advisor).loyalty, 100));
  const delta = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.entries(v).every(([key, n]) => RESOURCE_KEYS.includes(key as typeof RESOURCE_KEYS[number])
      && typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100);
  if (!integer(cabinet.year, Math.floor(turn / 4)) || !integer(cabinet.changedTurn, turn)
    || !integer(cabinet.changes, 100) || !Array.isArray(cabinet.roster) || cabinet.roster.length !== 8
    || !Array.isArray(cabinet.departed) || !cabinet.departed.every(person)) return false;
  if (cabinet.backedChannels !== undefined && (!Array.isArray(cabinet.backedChannels)
    || new Set(cabinet.backedChannels).size !== cabinet.backedChannels.length
    || cabinet.backedChannels.some(channel => typeof channel !== 'string' || !Object.hasOwn(CHANNELS, channel)))) return false;
  if (cabinet.entries !== undefined && (!Array.isArray(cabinet.entries) || cabinet.entries.length > 100
    || cabinet.entries.some(entry => !entry || !integer(entry.turn, turn) || typeof entry.label !== 'string' || !delta(entry.res)))) return false;
  const ids = new Set<string>(), names = new Set<string>();
  for (const candidate of cabinet.roster) {
    if (!candidate || !seats.has(candidate.seat) || typeof candidate.id !== 'string'
      || !candidate.id.startsWith(`cabinet:${cabinet.year}:${candidate.seat}:`)
      || !/^(0|[1-9][0-9]*)$/.test(candidate.id.split(':').at(-1) ?? '')
      || ids.has(candidate.id) || names.has(candidate.name) || typeof candidate.name !== 'string'
      || !Object.hasOwn(CHANNELS, candidate.channel) || ![1, 2, 3].includes(candidate.skill) || !integer(candidate.loyalty, 100)
      || !['title', 'bio'].every(key => typeof candidate[key as 'title' | 'bio'] === 'string')
      || !delta(candidate.cost) || !candidate.relation || typeof candidate.relation !== 'object'
      || Object.values(candidate.relation).some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 100)
      || !(candidate.camp === null || typeof candidate.camp === 'string')) return false;
    ids.add(candidate.id); names.add(candidate.name);
  }
  return ADVISOR_ROLES.every(role => cabinet.roster.filter(person => person.seat === role.id).length === 2);
}
