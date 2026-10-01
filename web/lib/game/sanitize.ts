// Проверка и нормализация данных, пришедших извне: сохранённого состояния и авторских сценариев.
// Всё, что не проходит проверку, либо отбрасывается, либо приводится к безопасному значению.
import {
  ACTION_TAGS, ADVISOR_ROLES, BIOGRAPHIES, MAX_PENDING, COUNTRIES, CRISIS_LIFETIME, DIFFICULTIES, EVENT_SOURCES, FACTIONS_DATA, FIGURE_ROLES,
  IDEOLOGIES, LIMITS, MAX_TURNS, RESOURCE_KEYS, SAVE_VERSION, START_RES, TEXT,
} from "./data.ts";
import { ARCS } from "../content/arcs.ts";
import { loyaltyLabel } from "./engine.ts";
import type {
  ActionTag, Advisor, ArcChoice, ArcState, Choice, Deal, Pact, Pending, Election, Crisis, DifficultyId, EndType, Faction, Figure, GameEvent, GameState,
  HistoryEntry, IdeologyId, NewCrisis, RandomEvent, ResourceDelta, Resources, Severity,
} from "./types.ts";

type Obj = Record<string, unknown>;
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const END_TYPE_IDS: EndType[] = ["reelected", "mandate", "revolution", "collapse", "coup", "impeachment"];
const CHOICE_IDS = ["a", "b", "c", "d"];

export const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

export function str(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string" && typeof v !== "number") return fallback;
  const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s === "null" || s === "undefined") return fallback;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Карта изменений: только известные ключи, только целые, не больше limit по модулю, без нулей.
export function deltaMap(v: unknown, keys: readonly string[], limit: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const k of keys) {
    const d = num(v[k], -limit, limit, 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

const strList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.map(x => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

// ── Ответы модели ────────────────────────────────────────────────────────────

function sanitizeTags(v: unknown): ActionTag[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((t): t is ActionTag => typeof t === "string" && (ACTION_TAGS as string[]).includes(t)))].slice(0, 2);
}

function sanitizeArcChoice(v: unknown): ArcChoice | null {
  if (!isObj(v)) return null;
  const flag = str(v.flag, 20), ok = str(v.ok, TEXT.long);
  if (!flag || !ok) return null;
  return {
    flag, ok,
    ...(str(v.fail, TEXT.long) ? { fail: str(v.fail, TEXT.long) } : {}),
    effect: deltaMap(v.effect, RESOURCE_KEYS, 10),
    ...(str(v.epilogue, TEXT.medium) ? { epilogue: str(v.epilogue, TEXT.medium) } : {}),
  };
}

const tagList = (v: unknown): ActionTag[] => Array.isArray(v)
  ? [...new Set(v.filter((t): t is ActionTag => (ACTION_TAGS as string[]).includes(t as string)))].slice(0, 4) : [];

// Сделка особого дела: только известные ключи и умеренные величины.
function sanitizeDeal(v: unknown): Deal | null {
  if (!isObj(v)) return null;
  const id = (x: unknown) => str(x, 20).replace(/[^\w-]/g, "");
  const pact = isObj(v.pact) && id(v.pact.faction) ? {
    faction: id(v.pact.faction), turns: num(v.pact.turns, 2, 6, 4),
    ban: tagList(v.pact.ban),
    ...(id(v.pact.against) ? { against: id(v.pact.against) } : {}),
  } : null;
  const map = (x: unknown) => {
    if (!isObj(x)) return undefined;
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(x).slice(0, 4)) { const d = num(val, -30, 30, 0); if (d && id(k)) out[id(k)] = d; }
    return Object.keys(out).length ? out : undefined;
  };
  const deal: Deal = {
    ...(id(v.figure) ? { figure: id(v.figure) } : {}),
    ...(num(v.figureRel, -50, 50, 0) ? { figureRel: num(v.figureRel, -50, 50, 0) } : {}),
    ...(num(v.othersRel, -20, 20, 0) ? { othersRel: num(v.othersRel, -20, 20, 0) } : {}),
    ...(map(v.factionRel) ? { factionRel: map(v.factionRel) } : {}),
    ...(map(v.factionAppr) ? { factionAppr: map(v.factionAppr) } : {}),
    ...(str(v.replace, TEXT.name) ? { replace: str(v.replace, TEXT.name) } : {}),
    ...(isObj(v.res) ? { res: deltaMap(v.res, RESOURCE_KEYS, 10) } : {}),
    ...(v.pure === true ? { pure: true } : {}),
    ...(isObj(v.later) && str(v.later.label, TEXT.short) ? { later: {
      turns: num(v.later.turns, 1, 5, 2), label: str(v.later.label, TEXT.short), res: deltaMap(v.later.res, RESOURCE_KEYS, 8),
      ...(str(v.later.story, TEXT.long) ? { story: str(v.later.story, TEXT.long) } : {}),
    } } : {}),
    ...(pact && pact.ban.length ? { pact } : {}),
  };
  return Object.keys(deal).length ? deal : null;
}

function sanitizePacts(v: unknown, factionIds: string[], turn: number): Pact[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).filter(p => factionIds.includes(p.faction as string)).slice(0, 3).map(p => ({
    faction: p.faction as string,
    figure: str(p.figure, 20) || null,
    since: num(p.since, 0, MAX_TURNS, turn),
    until: num(p.until, turn, MAX_TURNS + 6, turn + 1),
    ban: tagList(p.ban),
    against: factionIds.includes(p.against as string) ? p.against as string : null,
  }));
}

function sanitizeChoice(c: Obj, id: string, crisisIds: string[], allowArc = false): Choice | null {
  const text = str(c.text, TEXT.choice);
  const tags = sanitizeTags(c.tags);
  // без тега движок не знает цену решения — такой вариант отбрасываем
  if (!text || !tags.length) return null;
  const resolves = str(c.resolvesCrisis, 20);
  return {
    id, text, hint: str(c.hint, TEXT.hint), tags,
    resolvesCrisis: crisisIds.includes(resolves) ? resolves : null,
    ...(allowArc && isObj(c.arc) ? { arc: sanitizeArcChoice(c.arc) } : {}),
    ...(allowArc && str(c.scene, TEXT.long) ? { scene: str(c.scene, TEXT.long) } : {}),
    ...(allowArc && str(c.sceneFail, TEXT.long) ? { sceneFail: str(c.sceneFail, TEXT.long) } : {}),
    ...(allowArc && str(c.headline, TEXT.title) ? { headline: str(c.headline, TEXT.title) } : {}),
    ...(allowArc && str(c.headlineFail, TEXT.title) ? { headlineFail: str(c.headlineFail, TEXT.title) } : {}),
    ...(allowArc && sanitizeDeal(c.deal) ? { deal: sanitizeDeal(c.deal)! } : {}),
  };
}

// Предложения совета: по одному от советника, только из его области.
// Приходят от модели (advisor — id роли) или из сохранённого состояния (advisor — объект).
export function sanitizeProposals(v: unknown, advisors: Advisor[], crisisIds: string[], allowScenes = false): Choice[] {
  if (!Array.isArray(v)) return [];
  const out: Choice[] = [];
  for (const adv of advisors) {
    const raw = v.find(p => isObj(p) && (isObj(p.advisor) ? p.advisor.id : p.advisor) === adv.id);
    if (!isObj(raw)) continue;
    const domain = ADVISOR_ROLES.find(r => r.id === adv.id)?.domain ?? [];
    const tags = Array.isArray(raw.tags) ? raw.tags.filter(t => domain.includes(t as ActionTag)) : [];
    const choice = sanitizeChoice({ ...raw, tags }, `x${out.length + 1}`, crisisIds, allowScenes);
    if (choice) out.push({ ...choice, advisor: { id: adv.id, name: adv.name, role: adv.role, skill: adv.skill } });
  }
  return out;
}

function sanitizeChoices(v: unknown, crisisIds: string[], allowArc = false): Choice[] {
  if (!Array.isArray(v)) return [];
  const out: Choice[] = [];
  for (const c of v) {
    if (out.length >= CHOICE_IDS.length) break;
    if (!isObj(c)) continue;
    // id выдаём сами: модели не доверяем уникальность
    const choice = sanitizeChoice(c, CHOICE_IDS[out.length], crisisIds, allowArc);
    if (choice) out.push(choice);
  }
  return out;
}

function sanitizeRandomEvent(v: unknown): RandomEvent | null {
  if (!isObj(v)) return null;
  const title = str(v.title, TEXT.title);
  if (!title) return null;
  return {
    title,
    description: str(v.description, TEXT.medium),
    resourceEffect: deltaMap(v.resourceEffect, RESOURCE_KEYS, LIMITS.randomEffect),
  };
}

export function sanitizeEvent(
  raw: unknown, factionIds: string[], opts: { isCritical: boolean; allowRandom: boolean; crisisIds: string[]; advisors?: Advisor[]; allowArc?: boolean },
): GameEvent | null {
  if (!isObj(raw)) return null;
  const title = str(raw.title, TEXT.title);
  const choices = sanitizeChoices(raw.choices, opts.crisisIds, opts.allowArc);
  if (!title || choices.length < 2) return null;
  const source = str(raw.source, 40);
  const affected = Array.isArray(raw.affectedFactions)
    ? [...new Set(raw.affectedFactions.filter((id): id is string => typeof id === "string" && factionIds.includes(id)))].slice(0, 4)
    : [];
  return {
    title,
    source: source || EVENT_SOURCES[2],
    description: str(raw.description, TEXT.long),
    isCritical: opts.isCritical,
    affectedFactions: affected,
    choices,
    randomEvent: opts.allowRandom ? sanitizeRandomEvent(raw.randomEvent) : null,
    council: opts.advisors ? sanitizeProposals(raw.council, opts.advisors, opts.crisisIds, opts.allowArc) : null,
    ...(opts.allowArc && str(raw.card, 40) ? { card: str(raw.card, 40) } : {}),
    ...(opts.allowArc && isObj(raw.special) && ["overture", "insider", "mole", "pact", "inspect", "press", "call"].includes(raw.special.kind as string) ? {
      special: { kind: raw.special.kind as "overture", figure: str(raw.special.figure, 20) || null, faction: str(raw.special.faction, 20) },
    } : {}),
    beat: opts.allowArc && isObj(raw.beat) ? {
      arcId: str(raw.beat.arcId, 20), arcTitle: str(raw.beat.arcTitle, TEXT.name),
      turn: num(raw.beat.turn, 1, MAX_TURNS, 1), episode: num(raw.beat.episode, 1, 9, 1), total: num(raw.beat.total, 1, 9, 4),
    } : null,
  };
}

function sanitizeDrain(v: unknown): ResourceDelta {
  const d = deltaMap(v, RESOURCE_KEYS, LIMITS.crisisDrain);
  const out: ResourceDelta = {};
  for (const [k, val] of Object.entries(d).slice(0, LIMITS.crisisDrainKeys)) {
    out[k as keyof ResourceDelta] = -Math.abs(val); // кризис только отнимает
  }
  return out;
}

const severity = (v: unknown): Severity =>
  SEVERITIES.includes(v as Severity) ? (v as Severity) : "medium";

function sanitizeNewCrisis(v: unknown): NewCrisis | null {
  if (!isObj(v)) return null;
  const title = str(v.title, TEXT.short);
  if (!title) return null;
  return {
    title,
    description: str(v.description, TEXT.medium),
    severity: severity(v.severity),
    resourceDrain: sanitizeDrain(v.resourceDrain),
  };
}

// ── Состояние от клиента ─────────────────────────────────────────────────────
// Клиент хранит партию у себя, поэтому сервер пересобирает состояние из справочников
// и берёт от клиента только числа и тексты в допустимых пределах.

const validDiff = (v: unknown): v is DifficultyId => typeof v === "string" && v in DIFFICULTIES;
const validIdeo = (v: unknown): v is IdeologyId => IDEOLOGIES.some(i => i.id === v);
export const validCountry = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(COUNTRIES, v);
export { validDiff, validIdeo };

function sanitizeResources(v: unknown, fallback: Resources): Resources {
  const src = isObj(v) ? v : {};
  const out = { ...fallback };
  for (const k of RESOURCE_KEYS) out[k] = num(src[k], 0, 100, fallback[k]);
  return out;
}

function sanitizeFactions(v: unknown, country: string): Faction[] {
  const src = Array.isArray(v) ? v.filter(isObj) : [];
  return FACTIONS_DATA[country].map(info => {
    const f = src.find(x => x.id === info.id) ?? {};
    return {
      ...info,
      approval: num(f.approval, 0, 100, info.baseApproval),
      relation: num(f.relation, -100, 100, 0),
    };
  });
}

function sanitizeFigures(v: unknown, country: string): Figure[] {
  const src = Array.isArray(v) ? v.filter(isObj) : [];
  return FIGURE_ROLES[country].map(role => {
    const f = src.find(x => x.id === role.id) ?? {};
    const relation = num(f.relation, -100, 100, 0);
    return {
      id: role.id, role: role.role, faction: role.faction,
      name: str(f.name, TEXT.name, role.role),
      relation, loyalty: loyaltyLabel(relation),
    };
  });
}

function sanitizeCrises(v: unknown): Crisis[] {
  if (!Array.isArray(v)) return [];
  const out: Crisis[] = [];
  for (const c of v) {
    if (out.length >= LIMITS.maxActiveCrises) break;
    if (!isObj(c)) continue;
    const base = sanitizeNewCrisis(c);
    const id = str(c.id, 20);
    if (!base || !id || out.some(x => x.id === id)) continue;
    out.push({ ...base, id, turnsActive: num(c.turnsActive, 0, CRISIS_LIFETIME.critical, 0) });
  }
  return out;
}

function sanitizePending(v: unknown, turn: number): Pending[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).slice(-MAX_PENDING).map((p, i) => ({
    id: str(p.id, 20, `p${i}`),
    due: num(p.due, turn + 1, turn + 6, turn + 1),
    label: str(p.label, TEXT.short, "Последствия"),
    res: deltaMap(p.res, RESOURCE_KEYS, 8),
    source: str(p.source, TEXT.choice),
    ...(typeof p.event === "string" ? { event: str(p.event, TEXT.choice) } : {}),
    ...(typeof p.story === "string" && p.story ? { story: str(p.story, TEXT.long) } : {}),
  }));
}

function sanitizeArc(v: unknown): ArcState | null {
  if (!isObj(v) || !ARCS.some(a => a.id === v.id)) return null;
  return {
    id: v.id as string,
    target: str(v.target, TEXT.name, "неизвестный"),
    targetRole: str(v.targetRole, TEXT.name),
    flags: strList(v.flags, 10, 20),
    done: Array.isArray(v.done) ? v.done.map(t => num(t, 1, MAX_TURNS, 1)).slice(0, 10) : [],
    epilogue: str(v.epilogue, TEXT.medium) || null,
  };
}

function sanitizeAdvisors(v: unknown): Advisor[] {
  const src = Array.isArray(v) ? v.filter(isObj) : [];
  return ADVISOR_ROLES.map(r => {
    const a = src.find(x => x.id === r.id) ?? {};
    return { id: r.id, role: r.role, emoji: r.emoji, name: str(a.name, TEXT.name, r.role), skill: num(a.skill, 1, 3, 2) as 1 | 2 | 3 };
  });
}

function sanitizeElections(v: unknown): Election[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).slice(0, 2).map(e => ({
    turn: num(e.turn, 1, MAX_TURNS, 10),
    kind: e.kind === "president" ? "president" as const : "parliament" as const,
    leader: num(e.leader, 0, 100, 0),
    top: { id: str(isObj(e.top) ? e.top.id : "", 20), name: str(isObj(e.top) ? e.top.name : "", TEXT.name), share: num(isObj(e.top) ? e.top.share : 0, 0, 100, 0) },
    outcome: e.outcome === "won" ? "won" as const : e.outcome === "impeached" ? "impeached" as const : "lost" as const,
  }));
}

function sanitizeHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).slice(-MAX_TURNS).map(h => ({
    year: num(h.year, 1900, 2200, 2025),
    title: str(h.title, TEXT.title),
    choice: str(h.choice, TEXT.choice),
    headline: str(h.headline, TEXT.title),
    historianNote: str(h.historianNote, TEXT.title),
  }));
}

export function sanitizeState(raw: unknown): GameState | null {
  if (!isObj(raw)) return null;
  const { country, diff, ideo } = raw;
  if (!validCountry(country) || !validDiff(diff) || !validIdeo(ideo)) return null;
  const leader = isObj(raw.leader) ? raw.leader : {};
  const name = str(leader.name, TEXT.name);
  if (!name) return null;

  const factions = sanitizeFactions(raw.factions, country);
  const factionIds = factions.map(f => f.id);
  const activeCrises = sanitizeCrises(raw.activeCrises);
  const advisors = sanitizeAdvisors(raw.advisors);
  const turn = num(raw.turn, 0, MAX_TURNS, 0);
  const endType = END_TYPE_IDS.includes(raw.endType as EndType) ? (raw.endType as EndType) : null;
  const startYear = COUNTRIES[country].startYear;

  return {
    version: SAVE_VERSION,
    country, diff, ideo,
    leader: { name, party: str(leader.party, TEXT.name), bio: str(leader.bio, TEXT.medium) },
    speech: str(raw.speech, TEXT.long),
    situation: str(raw.situation, TEXT.long),
    resources: sanitizeResources(raw.resources, START_RES[diff]),
    prevResources: null,
    factions,
    prevFactions: null,
    keyFigures: sanitizeFigures(raw.keyFigures, country),
    prevFigures: null,
    activeCrises,
    year: num(raw.year, startYear, startYear + MAX_TURNS, startYear),
    turn,
    history: sanitizeHistory(raw.history),
    elections: sanitizeElections(raw.elections),
    advisors,
    councilCharges: num(raw.councilCharges, 0, 10, 0),
    mode: "classic",
    seed: num(raw.seed, 0, 4294967295, 0),
    ...(BIOGRAPHIES.some(b => b.id === raw.bio) ? { bio: raw.bio as string } : {}),
    daily: typeof raw.daily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily) ? raw.daily : null,
    usedEvents: strList(raw.usedEvents, 40, 60),
    stats: {
      crisesResolved: num(isObj(raw.stats) ? raw.stats.crisesResolved : 0, 0, 99, 0),
      councils: num(isObj(raw.stats) ? raw.stats.councils : 0, 0, 99, 0),
      failures: num(isObj(raw.stats) ? raw.stats.failures : 0, 0, 99, 0),
    },
    pending: sanitizePending(raw.pending, turn),
    arc: sanitizeArc(raw.arc),
    pacts: sanitizePacts(raw.pacts, factionIds, turn),
    betrayals: num(raw.betrayals, 0, 9, 0),
    echoes: isObj(raw.echoes) ? Object.fromEntries(Object.entries(raw.echoes).slice(0, 20).map(([k, v]) => [str(k, TEXT.short), num(v, 0, 20, 0)])) : {},
    currentEvent: isObj(raw.currentEvent)
      ? sanitizeEvent(raw.currentEvent, factionIds, { isCritical: raw.currentEvent.isCritical === true, allowRandom: true, advisors, allowArc: true, crisisIds: activeCrises.map(c => c.id) })
      : null,
    lastTurn: null,
    ended: raw.ended === true,
    endType,
    powerLoss: str(raw.powerLoss, TEXT.long) || null,
    verdict: null,
  };
}
