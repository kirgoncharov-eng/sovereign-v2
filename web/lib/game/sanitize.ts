// Проверка и нормализация данных, пришедших извне: ответов модели и состояния от клиента.
// Всё, что не проходит проверку, либо отбрасывается, либо приводится к безопасному значению.
import {
  ACTION_TAGS, COUNTRIES, CUSTOM_CHOICE_ID, CRISIS_LIFETIME, DIFFICULTIES, EVENT_SOURCES, FACTIONS_DATA, FIGURE_ROLES,
  IDEOLOGIES, LIMITS, MAX_TURNS, RATINGS, RESOURCE_KEYS, SAVE_VERSION, START_RES, TEXT,
} from "./data.ts";
import { loyaltyLabel } from "./engine.ts";
import type {
  ActionTag, Assessment, Choice, Election, Narration, Crisis, DifficultyId, EndType, Faction, Figure, GameEvent, GameState,
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
  return {
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

function sanitizeChoice(c: Obj, id: string, crisisIds: string[]): Choice | null {
  const text = str(c.text, TEXT.choice);
  const tags = sanitizeTags(c.tags);
  // без тега движок не знает цену решения — такой вариант отбрасываем
  if (!text || !tags.length) return null;
  const resolves = str(c.resolvesCrisis, 20);
  return {
    id, text, hint: str(c.hint, TEXT.hint), tags,
    resolvesCrisis: crisisIds.includes(resolves) ? resolves : null,
  };
}

// Ответ советника на решение игрока. Текст решения — всегда слова самого игрока.
export function sanitizeAssessment(raw: unknown, playerText: string, crisisIds: string[]): Assessment | null {
  if (!isObj(raw)) return null;
  const advisor = str(raw.advisor, TEXT.hint);
  if (raw.feasible === false) {
    return { feasible: false, reason: str(raw.reason, TEXT.hint, "Это не решение, которое лидер может принять."), choice: null, advisor };
  }
  const choice = sanitizeChoice({ ...raw, text: playerText }, CUSTOM_CHOICE_ID, crisisIds);
  if (!choice) return null;
  return { feasible: true, reason: "", choice, advisor };
}

function sanitizeChoices(v: unknown, crisisIds: string[]): Choice[] {
  if (!Array.isArray(v)) return [];
  const out: Choice[] = [];
  for (const c of v) {
    if (out.length >= CHOICE_IDS.length) break;
    if (!isObj(c)) continue;
    // id выдаём сами: модели не доверяем уникальность
    const choice = sanitizeChoice(c, CHOICE_IDS[out.length], crisisIds);
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
  raw: unknown, factionIds: string[], opts: { isCritical: boolean; allowRandom: boolean; crisisIds: string[]; allowCustom?: boolean },
): GameEvent | null {
  if (!isObj(raw)) return null;
  const title = str(raw.title, TEXT.title);
  const choices = sanitizeChoices(raw.choices, opts.crisisIds);
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
    custom: opts.allowCustom && isObj(raw.custom) ? sanitizeChoice(raw.custom, CUSTOM_CHOICE_ID, opts.crisisIds) : null,
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
    currentEvent: isObj(raw.currentEvent)
      ? sanitizeEvent(raw.currentEvent, factionIds, { isCritical: raw.currentEvent.isCritical === true, allowRandom: true, allowCustom: true, crisisIds: activeCrises.map(c => c.id) })
      : null,
    lastTurn: null,
    ended: raw.ended === true,
    endType,
    powerLoss: str(raw.powerLoss, TEXT.long) || null,
    verdict: null,
  };
}
