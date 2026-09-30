// Проверка и нормализация данных, пришедших извне: ответов модели и состояния от клиента.
// Всё, что не проходит проверку, либо отбрасывается, либо приводится к безопасному значению.
import {
  ACTION_TAGS, ADVISOR_ROLES, MAX_PENDING, COUNTRIES, CRISIS_LIFETIME, DIFFICULTIES, EVENT_SOURCES, FACTIONS_DATA, FIGURE_ROLES,
  IDEOLOGIES, LIMITS, MAX_TURNS, RATINGS, RESOURCE_KEYS, SAVE_VERSION, START_RES, TEXT,
} from "./data.ts";
import { ARCS } from "../content/arcs.ts";
import { loyaltyLabel } from "./engine.ts";
import type {
  ActionTag, Advisor, ArcChoice, ArcState, Choice, Pending, Election, Narration, Crisis, DifficultyId, EndType, Faction, Figure, GameEvent, GameState,
  HistoryEntry, IdeologyId, Intro, NewCrisis, RandomEvent, ResourceDelta, Resources, Severity, Verdict,
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

export function sanitizeIntro(raw: unknown, playerCount: number): Intro | null {
  if (!isObj(raw) || !isObj(raw.leader)) return null;
  const name = str(raw.leader.name, TEXT.name);
  if (!name) return null;
  const players = Array.isArray(raw.players)
    ? raw.players.slice(0, playerCount).map(p => str(isObj(p) ? p.name : p, TEXT.name))
    : [];
  const advisors = Array.isArray(raw.advisors)
    ? raw.advisors.slice(0, ADVISOR_ROLES.length).map(p => str(isObj(p) ? p.name : p, TEXT.name))
    : [];
  return {
    advisors,
    leader: {
      name,
      party: str(raw.leader.party, TEXT.name, "Беспартийный"),
      bio: str(raw.leader.bio, TEXT.medium),
    },
    speech: str(raw.speech, TEXT.long),
    situation: str(raw.situation, TEXT.long),
    players,
  };
}

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
  };
}

// Предложения совета: по одному от советника, только из его области.
// Приходят от модели (advisor — id роли) или из сохранённого состояния (advisor — объект).
export function sanitizeProposals(v: unknown, advisors: Advisor[], crisisIds: string[]): Choice[] {
  if (!Array.isArray(v)) return [];
  const out: Choice[] = [];
  for (const adv of advisors) {
    const raw = v.find(p => isObj(p) && (isObj(p.advisor) ? p.advisor.id : p.advisor) === adv.id);
    if (!isObj(raw)) continue;
    const domain = ADVISOR_ROLES.find(r => r.id === adv.id)?.domain ?? [];
    const tags = Array.isArray(raw.tags) ? raw.tags.filter(t => domain.includes(t as ActionTag)) : [];
    const choice = sanitizeChoice({ ...raw, tags }, `x${out.length + 1}`, crisisIds);
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
    council: opts.advisors ? sanitizeProposals(raw.council, opts.advisors, opts.crisisIds) : null,
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

export function sanitizeNarration(raw: unknown): Narration | null {
  if (!isObj(raw)) return null;
  const headline = str(raw.headline, TEXT.title);
  const narrative = str(raw.narrative, TEXT.narrative);
  if (!headline || !narrative) return null;
  return {
    headline,
    narrative,
    reactions: strList(raw.reactions, 4, TEXT.medium),
    historianNote: str(raw.historianNote, TEXT.title),
    crisisTitle: str(raw.crisisTitle, TEXT.short) || null,
    crisisDescription: str(raw.crisisDescription, TEXT.medium) || null,
    powerLoss: str(raw.powerLoss, TEXT.long) || null,
  };
}

export function sanitizeVerdict(raw: unknown): Verdict | null {
  if (!isObj(raw)) return null;
  const verdict = str(raw.verdict, TEXT.long);
  if (!verdict) return null;
  const rating = str(raw.rating, 60);
  return {
    verdict,
    title: str(raw.title, TEXT.name),
    epitaph: str(raw.epitaph, TEXT.title),
    rating: RATINGS.find(r => r.toLowerCase() === rating.toLowerCase()) ?? RATINGS[2],
    fallNarrative: str(raw.fallNarrative, TEXT.long) || null,
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
    mode: raw.mode === "ai" ? "ai" : "classic",
    seed: num(raw.seed, 0, 4294967295, 0),
    daily: typeof raw.daily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily) ? raw.daily : null,
    usedEvents: [],
    stats: {
      crisesResolved: num(isObj(raw.stats) ? raw.stats.crisesResolved : 0, 0, 99, 0),
      councils: num(isObj(raw.stats) ? raw.stats.councils : 0, 0, 99, 0),
      failures: num(isObj(raw.stats) ? raw.stats.failures : 0, 0, 99, 0),
    },
    pending: sanitizePending(raw.pending, turn),
    arc: sanitizeArc(raw.arc),
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
