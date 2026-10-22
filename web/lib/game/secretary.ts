// #245: secretary decisions are persistent, deterministic and separate from project capacity.
import * as copy from '../content/secretary.ts';
import { ALTERNATE_COUNTRY, ALTERNATE_NAMES } from './alternate-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { computePolls, hashSeed, isDisloyal, leakingAdvisors } from './engine.ts';
import { FIRST_TERM_CASES, replacedCases, scheduledFirstTerm, versionsOf } from './first-term-schedule.ts';
import { reserveShortage } from '../content/quarter-letters.ts';
import { electionKind, reignOf } from './terms.ts';
import { turnDate } from './calendar.ts';
import type { GameState, ResourceDelta, ResourceKey } from './types.ts';

export type FavorId = copy.FavorId;
export interface SecretaryFavor {
  id: FavorId;
  offered: number;
  answer: 'grant' | 'refuse' | null;
  answered: number | null;
  outcome: string | null;
}
export interface SecretaryGossip {
  turn: number;
  kind: copy.GossipKind;
  text: string;
  truthful: boolean;
  source: 'state' | 'mistake' | 'director';
  subject: string;
  name: string;
  checked: boolean | null;
  protected: boolean;
  exposed: boolean;
}
interface SecretaryConsequence {
  id: 'nepotism' | 'directorRemembers';
  due: number;
  text: string;
  res: ResourceDelta;
}
export interface SecretaryState {
  version: 1;
  name: string;
  joined: number;
  updated: number;
  trust: copy.SecretaryTrust;
  present: boolean;
  away: number | null;
  muteUntil: number | null;
  favors: SecretaryFavor[];
  nextFavor: number;
  lastGossipTurn: number | null;
  gossip: SecretaryGossip | null;
  planted: boolean;
  channelExposed: boolean;
  scene: { id: copy.SecretaryScene; turn: number; text: string } | null;
  nextScene: number;
  seenScenes: copy.SecretaryScene[];
  pending: SecretaryConsequence[];
  receipt: string | null;
  receiptTurn: number | null;
  finale: string | null;
  inventory?: string;
  lastGossipText?: string;
}
export interface SecretaryAction {
  id: string;
  title: string;
  detail: string;
  cost: ResourceDelta;
  blocked: string | null;
}
export const secretaryEnabled = (gs: GameState) => gs.country === ALTERNATE_COUNTRY && !gs.daily;
export const secretaryAvailable = (gs: GameState) => secretaryEnabled(gs) && !!gs.world?.secretary?.present
  && gs.world.secretary.away !== gs.turn && (gs.world.secretary.muteUntil ?? -1) < gs.turn;

// Normalize only this character's surname; shared name generation and archive rosters stay unchanged.
export const secretarySurname = (name: string) => name.trim().split(/\s+/).at(-1)!
  .replace(/(ов|ев|ин)а$/, '$1').replace(/(ск|цк)ая$/, '$1ий').replace(/ая$/, 'ой');
const roleSlot = (role: string) => role.charAt(0).toLowerCase() + role.slice(1);
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function secretaryName(gs: GameState): string {
  const people = [gs.leader.name, ...gs.advisors.map(p => p.name), ...gs.keyFigures.map(p => p.name),
    ...(gs.world?.people.map(p => p.name) ?? []), ...(gs.former ?? []), ...(gs.arc ? [gs.arc.target] : [])];
  const used = new Set(people.map(secretarySurname));
  const surnames = ALTERNATE_NAMES.last.filter(last => !used.has(last));
  // The cast has fewer surnames than the pool; a deterministic suffix also handles edited old saves.
  const last = surnames.length ? surnames[hashSeed(gs.seed, 'secretary-last') % surnames.length] : 'Залесский';
  const female = last.replace(/(ов|ев|ин)$/, '$1а').replace(/(ск|цк)ий$/, '$1ая').replace(/ой$/, 'ая');
  const first = ALTERNATE_NAMES.first.slice(8);
  return `${first[(hashSeed(gs.seed, 'secretary-first') >>> 8) % first.length]} ${female}`;
}

export function secretaryText(gs: GameState, text: string): string {
  return copy.fillSecretary(text, { secretary: gs.world?.secretary?.name ?? '', director: gs.arc?.target ?? '' });
}

export function pendingSecretaryFavor(gs: GameState): SecretaryFavor | undefined {
  return gs.world?.secretary?.favors.find(favor => favor.answer === null);
}

function eligibleFavors(gs: GameState, secretary: SecretaryState): FavorId[] {
  const done = new Set(secretary.favors.map(f => f.id));
  const housing = gs.world!.government?.programs.find(p => p.id === 'housing');
  const first = gs.history.find(h => h.title === 'Завод ждёт зарплату');
  const health = gs.world!.health;
  const eligible: [FavorId, boolean][] = [
    ['nephew', !!first?.success],
    ['sister', !!housing && ['running', 'completed', 'partial'].includes(housing.status)],
    ['mother', !!health],
    ['leave', gs.turn >= 9],
    ['archiveKey', !!gs.arc && !gs.arc.epilogue && gs.history.some(h => h.title === 'Опись без номера')],
    ['herSeat', gs.turn >= 15],
  ];
  const available = eligible.filter(([id, ready]) => ready && !done.has(id)).map(([id]) => id);
  // Give the last personal decision a place before the first term ends.
  return available.includes('herSeat') && gs.turn >= 17 ? ['herSeat'] : available;
}

function occasion(gs: GameState): copy.InventoryOccasion {
  if (gs.history.at(-1)?.success === false) return 'afterFailure';
  if ([7, 8, 18, 19].includes(gs.turn % 20)) return 'election';
  if (gs.activeCrises.length) return 'crisis';
  if (gs.world?.project.status !== 'completed' && gs.resources.economy < 30) return 'blackout';
  if (turnDate(gs.seed, 1978, gs.turn).season === 'winter') return 'winter';
  if (computePolls(gs.country, gs.factions, gs.resources).leader < 30) return 'lowRating';
  return 'calm';
}

export function secretaryInventory(gs: GameState): string | null {
  const s = gs.world?.secretary;
  if (!secretaryEnabled(gs) || !s) return null;
  if (!s.present) return copy.WITHOUT_HER;
  if (!secretaryAvailable(gs)) return null;
  if (gs.turn === s.joined) return secretaryText(gs, copy.FIRST_DAY);
  return s.inventory ?? inventoryLine(gs, s);
}

function inventoryLine(gs: GameState, s: SecretaryState): string {
  const lines = copy.INVENTORY_LINES[occasion(gs)][s.trust].map(line => secretaryText(gs, line));
  const fresh = lines.filter(line => line !== s.inventory);
  const available = fresh.length ? fresh : lines;
  return available[hashSeed(gs.seed, 'secretary-inventory', gs.turn) % available.length];
}

// Forecast only unconditional, unused slots. Conditional versions may change after this quarter's decision.
function nextSecretaryCase(gs: GameState): string | undefined {
  if (!scheduledFirstTerm(gs)) return;
  const id = FIRST_TERM_CASES[gs.turn + 2];
  if (!id || gs.usedEvents.includes(id) || replacedCases(gs).includes(id) || versionsOf(id).length) return;
  const card = ALTERNATE_EVENTS.find(c => c.id === id);
  if (!card || Object.keys(card.when ?? {}).some(key => !['minTurn', 'maxTurn'].includes(key))) return;
  return id;
}

function chooseGossip(gs: GameState, secretary: SecretaryState): SecretaryGossip | null {
  const candidates: Omit<SecretaryGossip, 'turn' | 'checked' | 'protected' | 'exposed'>[] = [];
  const addAdvisor = (id: string, kind: 'leak' | 'disloyal', truthful = true, source: SecretaryGossip['source'] = 'state') => {
    const advisor = gs.advisors.find(a => a.id === id)!;
    const lines = source === 'director' ? copy.PLANTED_GOSSIP : copy.GOSSIP[kind];
    const filled = lines.map(text => sentence(copy.fillSecretary(text, { advisor: advisor.name, advisorRole: roleSlot(advisor.role) })));
    const fresh = filled.filter(text => text !== secretary.lastGossipText);
    const available = fresh.length ? fresh : filled;
    const text = available[hashSeed(gs.seed, 'secretary-gossip-text', gs.turn, id) % available.length];
    candidates.push({ kind, truthful, source, subject: id, name: advisor.name,
      text });
  };
  if (secretary.planted && !secretary.channelExposed && hashSeed(gs.seed, 'secretary-director-channel', gs.turn) % 2 === 0) {
    const loyal = gs.advisors.filter(a => !isDisloyal(a));
    const target = loyal[hashSeed(gs.seed, 'secretary-planted', gs.turn) % loyal.length];
    if (target) addAdvisor(target.id, 'leak', false, 'director');
  }
  if (!candidates.length) {
    for (const advisor of leakingAdvisors(gs)) addAdvisor(advisor.id, 'leak');
    if (!candidates.length) for (const advisor of gs.advisors.filter(isDisloyal)) addAdvisor(advisor.id, 'disloyal');
    const base = nextSecretaryCase(gs);
    if (!candidates.length && base && copy.NEXT_CASE_GOSSIP[base]) candidates.push({ kind: 'nextCase', truthful: true,
      source: 'state', subject: base, name: ALTERNATE_EVENTS.find(card => card.id === base)!.title, text: copy.NEXT_CASE_GOSSIP[base] });
    if (!candidates.length) {
      const falling = gs.keyFigures.filter(f => gs.prevFigures?.some(p => p.id === f.id && p.name === f.name && f.relation < p.relation));
      for (const figure of falling) candidates.push({ kind: 'figure', truthful: true, source: 'state', subject: figure.id, name: figure.name,
        text: sentence(copy.fillSecretary(copy.GOSSIP.figure[hashSeed(gs.seed, 'secretary-figure', gs.turn) % copy.GOSSIP.figure.length],
          { figure: figure.name, figureRole: roleSlot(figure.role) })) });
    }
    if (!candidates.length && gs.arc && !gs.arc.epilogue) candidates.push({ kind: 'intrigue', truthful: true, source: 'state',
      subject: gs.arc.id, name: gs.arc.target,
      text: secretaryText(gs, copy.GOSSIP.intrigue[hashSeed(gs.seed, 'secretary-intrigue', gs.turn) % copy.GOSSIP.intrigue.length]) });
  }
  if (!candidates.length) return null;
  let chosen = candidates[hashSeed(gs.seed, 'secretary-gossip', gs.turn) % candidates.length];
  // Wrong names occur only where there is a concrete, independently checkable advisor fact.
  if (secretary.trust === 0 && chosen.source === 'state' && ['leak', 'disloyal'].includes(chosen.kind)
    && hashSeed(gs.seed, 'secretary-mistake', gs.turn) % 3 === 0) {
    const innocent = gs.advisors.find(a => !isDisloyal(a));
    if (innocent) {
      candidates.length = 0;
      addAdvisor(innocent.id, chosen.kind as 'leak' | 'disloyal', false, 'mistake');
      chosen = candidates[0];
    }
  }
  return { ...chosen, turn: gs.turn, checked: null, protected: false, exposed: false };
}

export function ensureSecretary(gs: GameState): GameState {
  if (!secretaryEnabled(gs) || !gs.world || gs.turn < 5 || gs.ended) return gs;
  let s = gs.world.secretary;
  if (!s) s = { version: 1, name: secretaryName(gs), joined: gs.turn, updated: gs.turn - 1, trust: 0, present: true,
    away: null, muteUntil: null, favors: [], nextFavor: Math.max(6, gs.turn + 1), lastGossipTurn: null, gossip: null,
    planted: false, channelExposed: false, scene: null, nextScene: gs.turn + 3, seenScenes: [], pending: [],
    receipt: null, receiptTurn: null, finale: null };
  if (!gs.currentEvent || s.updated >= gs.turn) return gs.world.secretary ? gs : { ...gs, world: { ...gs.world, secretary: s } };
  s = structuredClone(s);
  const next = { ...gs, world: { ...gs.world, secretary: s } };
  s.updated = gs.turn;
  if (s.gossip) s.lastGossipText = s.gossip.text;
  s.gossip = null;
  s.scene = null;
  if (!secretaryAvailable(next)) return next;
  s.inventory = inventoryLine(next, s);
  if (gs.turn < 20 && gs.turn >= s.nextFavor && !pendingSecretaryFavor(next)) {
    const available = eligibleFavors(gs, s);
    const id = available[hashSeed(gs.seed, 'secretary-favor', gs.turn) % available.length];
    if (id) s.favors.push({ id, offered: gs.turn, answer: null, answered: null, outcome: null });
  }
  const gap = s.trust === 2 ? 1 : s.trust === 1 ? 2 : 2 + hashSeed(gs.seed, 'secretary-frequency', gs.turn) % 2;
  if (s.lastGossipTurn === null || gs.turn - s.lastGossipTurn >= gap) {
    s.gossip = chooseGossip(next, s);
    if (s.gossip) s.lastGossipTurn = gs.turn;
  }
  const electionEve = !!electionKind(gs.turn + 2, gs.path, reignOf(gs).office);
  if (gs.turn >= s.nextScene || electionEve) {
    const winter = turnDate(gs.seed, 1978, gs.turn).season === 'winter';
    const health = gs.world.health;
    const scenes: [copy.SecretaryScene, boolean][] = [
      ['electionEve', electionEve],
      ['blackout', gs.resources.economy < 30 && gs.world.project.status !== 'completed'],
      ['coldWaitingRoom', winter && gs.resources.economy < 30],
      ['hospitalQueue', !!health && health.status === 'failed'],
    ];
    const id = scenes.find(([key, ready]) => ready && !s.seenScenes.includes(key))?.[0];
    if (id) {
      s.scene = { id, turn: gs.turn, text: secretaryText(next, copy.SCENES[id].text) };
      s.seenScenes.push(id);
      s.nextScene = gs.turn + 3 + hashSeed(gs.seed, 'secretary-scene-gap', gs.turn) % 2;
    }
  }
  return next;
}

const FAVOR_COST: Record<FavorId, ResourceDelta> = {
  nephew: { politicalCapital: -1 }, sister: {}, mother: { personalResource: -1 }, leave: {}, archiveKey: {}, herSeat: { personalResource: -1 },
};
const DUBIOUS: FavorId[] = ['nephew', 'sister', 'archiveKey'];
export function secretaryActions(gs: GameState): SecretaryAction[] {
  if (!secretaryEnabled(gs) || !gs.world?.secretary) return [];
  const s = gs.world.secretary;
  const actions: Omit<SecretaryAction, 'blocked'>[] = [];
  const favor = pendingSecretaryFavor(gs);
  if (favor) for (const answer of ['grant', 'refuse'] as const) {
    const option = copy.FAVORS[favor.id][answer];
    actions.push({ id: `secretary:favor:${favor.id}:${answer}`, title: option.text,
      detail: `${option.hint}${answer === 'grant' && copy.FAVORS[favor.id].grant.costReason
        ? `. ${copy.FAVORS[favor.id].grant.costReason}` : ''}`, cost: answer === 'grant' ? FAVOR_COST[favor.id] : {} });
  }
  const gossip = s.gossip;
  if (gossip?.turn === gs.turn && secretaryAvailable(gs)) {
    if (gossip.checked === null) actions.push({ id: 'secretary:verify', title: 'Проверить сведения',
      detail: 'Личный разговор с источниками: личный ресурс −1. Проверка не меняет должности и не тратит квартал.', cost: { personalResource: -1 } });
    if (gossip.kind === 'leak' && !gossip.protected && gossip.checked !== false) actions.push({
      id: 'secretary:protect', title: 'Поручить силовикам предотвратить утечку',
      detail: 'Личный ресурс −1: согласовать доступ к черновику. Это предотвратит утечку названного советника в текущем квартале, если сведения верны.',
      cost: { personalResource: -1 } });
  }
  return actions.map(action => {
    const shortage = Object.entries(action.cost).map(([key, delta]) =>
      [key, gs.resources[key as ResourceKey] + delta!] as const).find(([, after]) => after < 5);
    return { ...action, blocked: gs.ended ? 'Правление завершено'
      : !gs.currentEvent ? 'Дождитесь нового дела' : !s.present ? 'Секретарь больше не в приёмной'
      : s.away === gs.turn ? 'Секретарь в отгуле'
      : shortage ? reserveShortage(...shortage) : null };
  });
}

export function gossipConfirmed(gs: GameState, gossip: SecretaryGossip): boolean {
  const advisor = gs.advisors.find(a => a.id === gossip.subject && a.name === gossip.name);
  if (gossip.kind === 'leak') return !!advisor && leakingAdvisors(gs).some(a => a.id === advisor.id);
  if (gossip.kind === 'disloyal') return !!advisor && isDisloyal(advisor);
  if (gossip.kind === 'intrigue') return gs.arc?.id === gossip.subject && gs.arc.target === gossip.name && !gs.arc.epilogue;
  if (gossip.kind === 'figure') return gs.keyFigures.some(f => f.id === gossip.subject && f.name === gossip.name
    && gs.prevFigures?.some(p => p.id === f.id && p.name === f.name && p.relation > f.relation));
  return nextSecretaryCase(gs) === gossip.subject;
}

export function actSecretary(gs: GameState, id: string): GameState {
  const action = secretaryActions(gs).find(a => a.id === id);
  if (!action || action.blocked) throw new Error(action?.blocked ?? 'Ответ уже подписан или сведения устарели');
  const s = structuredClone(gs.world!.secretary!);
  const next = { ...gs, resources: { ...gs.resources }, world: { ...gs.world!, secretary: s } };
  for (const [key, value] of Object.entries(action.cost)) next.resources[key as ResourceKey] += value!;
  s.receiptTurn = gs.turn;
  if (id.startsWith('secretary:favor:')) {
    const favor = s.favors.find(f => f.answer === null)!;
    const grant = id.endsWith(':grant');
    favor.answer = grant ? 'grant' : 'refuse';
    favor.answered = gs.turn;
    const oldTrust = s.trust;
    s.trust = Math.max(0, Math.min(2, s.trust + (grant ? 1 : DUBIOUS.includes(favor.id) ? 0 : -1))) as copy.SecretaryTrust;
    s.nextFavor = gs.turn + 3 + hashSeed(gs.seed, 'secretary-favor-gap', favor.id) % 2;
    s.receipt = secretaryText(next, grant ? copy.FAVORS[favor.id].granted : copy.FAVORS[favor.id].refused);
    favor.outcome = s.receipt;
    if (s.trust !== oldTrust && !(favor.id === 'herSeat' && !grant)) s.receipt += ` ${secretaryText(next, copy.TRUST_CHANGE[s.trust > oldTrust ? 'up' : 'down'])}`;
    if (!grant && DUBIOUS.includes(favor.id)) s.receipt += ` ${secretaryText(next, copy.TRUST_CHANGE.refusedDubious)}`;
    if (grant && favor.id === 'leave') s.away = gs.turn + 1;
    if (!grant && favor.id === 'herSeat') { s.present = false; s.gossip = null; s.scene = null; }
    if (grant && favor.id === 'archiveKey') s.planted = true;
    if (grant && favor.id === 'nephew') s.pending.push({ id: 'directorRemembers', due: gs.turn + 2,
      text: secretaryText(next, copy.FAVORS.nephew.later!.directorRemembers), res: {} });
    if (grant && favor.id === 'sister' && hashSeed(gs.seed, 'secretary-nepotism', favor.offered) % 4 === 0)
      s.pending.push({ id: 'nepotism', due: gs.turn + 1, text: copy.FAVORS.sister.later!.exposed, res: { internalLegitimacy: -2 } });
  } else if (id === 'secretary:verify') {
    s.gossip!.checked = gossipConfirmed(gs, s.gossip!);
    s.receipt = s.gossip!.checked ? 'Канцелярия: сведения подтвердились.' : 'Канцелярия: проверка не подтвердила сведения.';
    if (!s.gossip!.checked && s.gossip!.source === 'director') {
      s.planted = false;
      s.channelExposed = true;
      s.receipt += ` ${secretaryText(next, copy.FAVORS.archiveKey.later!.uncovered)}`;
    }
  } else {
    s.gossip!.protected = true;
    s.receipt = 'Канцелярия: доступ к черновику ограничен на текущий квартал. Это не гарантирует, что утечка действительно готовится.';
  }
  return next;
}

export function secretaryPreventsLeak(gs: GameState, advisor: { id: string; name: string }): boolean {
  const gossip = secretaryEnabled(gs) && gs.world?.secretary?.gossip;
  return !!gossip && gossip.turn === gs.turn && gossip.protected && gossip.truthful && gossip.kind === 'leak'
    && gossip.subject === advisor.id && gossip.name === advisor.name && gossipConfirmed(gs, gossip);
}

export function secretaryDueEffects(gs: GameState, turn: number): { label: string; res: ResourceDelta }[] {
  if (!secretaryEnabled(gs)) return [];
  return (gs.world?.secretary?.pending ?? []).filter(p => p.due <= turn && Object.values(p.res).some(delta => delta !== 0))
    .map(p => ({ label: 'просьба секретаря: кумовство', res: p.res }));
}

export function secretaryStaffingChange(before: GameState, after: GameState, name: string | undefined): GameState {
  const old = before.world?.secretary;
  if (!secretaryEnabled(before) || !old?.gossip || old.gossip.turn !== before.turn || old.gossip.name !== name || old.gossip.exposed) return after;
  const s = structuredClone(old);
  s.trust = Math.max(0, s.trust - 1) as copy.SecretaryTrust;
  s.muteUntil = before.turn + 1;
  s.gossip!.exposed = true;
  s.receipt = secretaryText(before, copy.EXPOSED);
  s.receiptTurn = before.turn;
  return { ...after, world: { ...after.world!, secretary: s } };
}

export function finishSecretaryTurn(before: GameState, after: GameState): GameState {
  if (!secretaryEnabled(before) || !before.world?.secretary) return after;
  const s = structuredClone(before.world.secretary);
  const due = s.pending.filter(p => p.due <= after.turn);
  s.pending = s.pending.filter(p => p.due > after.turn);
  const notes = due.map(p => p.text);
  if (leakingAdvisors(before).some(advisor => secretaryPreventsLeak(before, advisor))) notes.push(secretaryText(before, copy.LEAK_DEFUSED));
  if (after.turn >= 20 && !s.finale) { s.finale = copy.TERM_FINALE[s.present ? s.trust : 'left']; notes.push(s.finale); }
  if (due.length) { s.receipt = notes.join('\n\n'); s.receiptTurn = after.turn; }
  return { ...after, world: { ...after.world!, secretary: s },
    lastTurn: after.lastTurn && notes.length ? { ...after.lastTurn, narrative: [after.lastTurn.narrative, ...notes].join('\n\n') } : after.lastTurn };
}

// Optional saved state is validated before it can award discounts or spend resources.
export function validSecretary(value: unknown, turn: number): value is SecretaryState {
  if (!value || typeof value !== 'object') return false;
  const s = value as SecretaryState;
  const n = (x: unknown, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && Number(x) >= 0 && Number(x) <= max;
  const text = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length < 6000;
  const nullableTurn = (x: unknown) => x === null || n(x);
  const favorIds = Object.keys(copy.FAVORS);
  if (s.version !== 1 || !text(s.name) || !n(s.joined, turn) || s.joined < 5 || !n(s.updated, turn) || s.updated < s.joined - 1
    || ![0, 1, 2].includes(s.trust) || typeof s.present !== 'boolean' || !nullableTurn(s.away) || !nullableTurn(s.muteUntil)
    || !n(s.nextFavor) || !nullableTurn(s.lastGossipTurn) || !n(s.nextScene) || typeof s.planted !== 'boolean'
    || typeof s.channelExposed !== 'boolean' || !(s.receipt === null || text(s.receipt)) || !nullableTurn(s.receiptTurn)
    || !(s.finale === null || text(s.finale)) || !(s.inventory === undefined || text(s.inventory))
    || !(s.lastGossipText === undefined || text(s.lastGossipText))) return false;
  if (!Array.isArray(s.favors) || s.favors.length > 6 || new Set(s.favors.map(f => f?.id)).size !== s.favors.length
    || !s.favors.every(f => f && favorIds.includes(f.id) && n(f.offered, turn) && f.offered >= s.joined
      && (f.answer === null ? f.answered === null && f.outcome === null
        : ['grant', 'refuse'].includes(f.answer) && n(f.answered, turn) && f.answered! >= f.offered && text(f.outcome)))
    || s.favors.filter(f => f.answer === null).length > 1) return false;
  if (!Array.isArray(s.seenScenes) || !s.seenScenes.every(id => Object.hasOwn(copy.SCENES, id))) return false;
  if (s.scene !== null && (!s.scene || !Object.hasOwn(copy.SCENES, s.scene.id) || !n(s.scene.turn, turn) || !text(s.scene.text))) return false;
  if (!Array.isArray(s.pending) || s.pending.length > 6 || !s.pending.every(p => p && ['nepotism', 'directorRemembers'].includes(p.id)
    && n(p.due) && text(p.text) && p.res && typeof p.res === 'object' && !Array.isArray(p.res) && Object.entries(p.res).every(([k, v]) =>
      ['economy', 'internalLegitimacy', 'politicalCapital', 'personalResource', 'externalReputation', 'military'].includes(k)
      && typeof v === 'number' && Number.isFinite(v) && v >= -100 && v <= 100))) return false;
  const g = s.gossip;
  return g === null || !!g && n(g.turn, turn) && ['leak', 'disloyal', 'nextCase', 'intrigue', 'figure'].includes(g.kind)
    && text(g.text) && typeof g.truthful === 'boolean' && ['state', 'mistake', 'director'].includes(g.source)
    && text(g.subject) && text(g.name) && (g.checked === null || typeof g.checked === 'boolean')
    && typeof g.protected === 'boolean' && typeof g.exposed === 'boolean';
}
