// Автосохранение партии в localStorage с подпиской для useSyncExternalStore.
import { ACTION_TAGS, END_TYPES, RESOURCE_KEYS, SAVE_VERSION } from "../game/data.ts";
import { isObj, validCountry, validDiff, validIdeo } from "../game/sanitize.ts";
import { validAnalyticsRun } from "./run-context.ts";
import { validDailyMoves } from "../game/daily-run.ts";
import { managementDocument } from "../game/classic.ts";
import { validLivingWorld } from "../game/living-world.ts";
import type { GameState } from "../game/types.ts";

const KEY = "sovereign.save";
export type Screen = "setup" | "intro" | "game" | "ending";
export interface SaveData { version: number; screen: Exclude<Screen, "setup">; state: GameState }

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export function subscribeSave(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function readSaveRaw(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function writeSave(data: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* приватный режим или нет места */ }
  notify();
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* недоступно */ }
  notify();
}

// Проверяем сохранение, не пересобирая его: отчёт, законы и второй срок должны пережить загрузку без потерь.
type Obj = Record<string, unknown>;
const strings = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === "string");
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const fields = (v: unknown, names: string[]) => isObj(v) && names.every(k => typeof v[k] === "string");
const rows = (v: unknown, check: (row: Obj) => boolean) => Array.isArray(v) && v.every(row => isObj(row) && check(row));
const resources = (v: unknown) => isObj(v) && RESOURCE_KEYS.every(k => integer(v[k], 0, 100));
const deltas = (v: unknown) => isObj(v) && Object.values(v).every(n => typeof n === "number" && Number.isFinite(n));
const pending = (v: unknown) => rows(v, p => fields(p, ["id", "label", "source"]) && integer(p.due) && deltas(p.res));
const election = (v: unknown) => isObj(v) && integer(v.turn) && integer(v.leader, 0, 100)
  && ["parliament", "president"].includes(String(v.kind)) && ["won", "lost", "impeached"].includes(String(v.outcome))
  && isObj(v.top) && fields(v.top, ["id", "name"]) && integer(v.top.share, 0, 100);
const finiteJson = (v: unknown): boolean => typeof v === "number" ? Number.isFinite(v)
  : Array.isArray(v) ? v.every(finiteJson) : isObj(v) ? Object.values(v).every(finiteJson) : true;
const choices = (v: unknown) => rows(v, c => fields(c, ["id", "text", "hint"]) && Array.isArray(c.tags)
  && c.tags.every(t => ACTION_TAGS.includes(t)) && (c.resolvesCrisis === null || typeof c.resolvesCrisis === "string")
  && (c.politicalTags === undefined || Array.isArray(c.politicalTags) && c.politicalTags.every(t => ACTION_TAGS.includes(t)))
  && (c.pensionTransition === undefined || fields(c.pensionTransition, ['figure', 'name']))
  && (c.evidenceResponse === undefined || ['refer', 'port'].includes(String(c.evidenceResponse)))
  && (c.mandateResponse === undefined || ['check', 'defend', 'withdraw', 'publish'].includes(String(c.mandateResponse)))
  && (!c.projectReview || isObj(c.projectReview) && ['procurement', 'exports', 'housing', 'housing-next'].includes(String(c.projectReview.id)))
  && (!c.advisor || isObj(c.advisor) && fields(c.advisor, ["id", "name", "role"]) && integer(c.advisor.skill, 1, 3))
  && (!c.deal || isObj(c.deal)) && (!c.arc || isObj(c.arc)));
const event = (v: unknown) => isObj(v) && fields(v, ["title", "source", "description"])
  && typeof v.isCritical === "boolean" && strings(v.affectedFactions) && choices(v.choices)
  && (v.choices as unknown[]).length >= 2 && (!v.council || choices(v.council))
  && (!v.doc || isObj(v.doc) && strings(v.doc.facts) && strings(v.doc.lines) && typeof v.doc.author === "string")
  && (!v.press || isObj(v.press) && typeof v.press.outlet === "string" && rows(v.press.questions, q => fields(q, ["id", "who", "topic", "text"]) && rows(q.answers, a => fields(a, ["text", "tone"]) && isObj(a.res) && isObj(a.rel))))
  && (!v.call || fields(v.call, ["figure", "trait", "demand"]) && ((v.call as Obj).negotiation === undefined || (v.call as Obj).negotiation === "pension" && integer((v.call as Obj).lawSince))) && (!v.budget || isObj(v.budget) && integer(v.budget.total));
const validLawNews = (v: unknown) => isObj(v) && typeof v.id === 'string' && ['enact', 'repeal', 'amend'].includes(String(v.act)) && typeof v.passed === 'boolean';
const report = (v: unknown) => isObj(v) && fields(v, ["headline", "narrative", "historianNote", "choiceText"])
  && strings(v.reactions) && strings(v.tags) && isObj(v.resourceChanges) && isObj(v.factionRelChanges)
  && (v.law === undefined || v.law === null || validLawNews(v.law))
  && strings(v.expiredCrises) && pending(v.matured) && pending(v.scheduled)
  && (v.election === null || election(v.election))
  && (!v.document || isObj(v.document) && typeof v.document.title === "string" && strings(v.document.lines))
  && (!v.press || rows(v.press, p => fields(p, ["outlet", "headline"])))
  && (!v.letters || rows(v.letters, l => fields(l, ["kind", "from", "text", "story"])));

function validState(s: Obj): boolean {
  if (!finiteJson(s) || !validCountry(s.country) || !validDiff(s.diff) || !validIdeo(s.ideo)) return false;
  if (!fields(s.leader, ["name", "party", "bio"]) || !(s.leader as Obj).name || !resources(s.resources)) return false;
  if (!integer(s.turn) || !integer(s.year) || !integer(s.seed, 0, 4294967295) || s.mode !== "classic") return false;
  if (!fields(s, ["speech", "situation"]) || typeof s.ended !== "boolean" || !integer(s.councilCharges)) return false;
  if (s.endType !== null && (typeof s.endType !== "string" || !Object.hasOwn(END_TYPES, s.endType))) return false;
  if (s.ended && !s.endType || !s.ended && s.endType) return false;
  if (s.prevResources !== null && !resources(s.prevResources)) return false;
  if (!rows(s.factions, f => fields(f, ["id", "name", "desc", "emoji", "bloc"]) && integer(f.approval, 0, 100) && integer(f.relation, -100, 100)) || !(s.factions as unknown[]).length) return false;
  if (!rows(s.keyFigures, f => fields(f, ["id", "role", "faction", "name", "loyalty"]) && integer(f.relation, -100, 100))) return false;
  if (!rows(s.advisors, a => fields(a, ["id", "name", "role", "emoji"]) && integer(a.skill, 1, 3))) return false;
  if (!rows(s.history, h => fields(h, ["title", "choice", "headline", "historianNote"]) && integer(h.year) && (h.law === undefined || h.law === null || validLawNews(h.law)))) return false;
  if (!rows(s.activeCrises, c => fields(c, ["id", "title", "description", "severity"]) && isObj(c.resourceDrain) && integer(c.turnsActive))) return false;
  if (!pending(s.pending)) return false;
  if (!Array.isArray(s.elections) || !s.elections.every(election) || !strings(s.usedEvents) || !isObj(s.stats) || !["councils", "failures", "crisesResolved"].every(k => integer((s.stats as Obj)[k]))) return false;
  if (s.currentEvent !== null && !event(s.currentEvent) || s.lastTurn !== null && !report(s.lastTurn)) return false;
  if (s.arc && (!fields(s.arc, ["id", "target", "targetRole"]) || !strings((s.arc as Obj).flags) || !Array.isArray((s.arc as Obj).done))) return false;
  if (s.reign && (!isObj(s.reign) || !integer(s.reign.term) || !integer(s.reign.counted) || !integer(s.reign.ruled) || !["president", "premier", "ruler"].includes(String(s.reign.office)) || !strings(s.reign.arcs) || !strings(s.reign.epilogues) || !Array.isArray(s.reign.past))) return false;
  if (s.promises !== undefined && !rows(s.promises, p => typeof p.id === "string" && integer(p.progress) && ["open", "kept", "broken"].includes(String(p.status)))) return false;
  if (s.laws !== undefined && !rows(s.laws, l => typeof l.id === "string" && integer(l.since) && (l.transition === undefined || l.id === "pension_reform" && fields(l.transition, ["figure", "name"]) && integer((l.transition as Obj).since) && Number((l.transition as Obj).since) >= Number(l.since) && Number((l.transition as Obj).since) <= Number(s.turn)))) return false;
  if (s.pacts !== undefined && !rows(s.pacts, p => typeof p.faction === "string" && integer(p.since) && integer(p.until) && strings(p.ban))) return false;
  if (s.former !== undefined && !strings(s.former) || s.echoes !== undefined && !isObj(s.echoes)) return false;
  if (s.world !== undefined && !validLivingWorld(s.world)) return false;
  if (s.dailyMoves !== undefined && (!validDailyMoves(s.dailyMoves) || s.dailyMoves.length !== s.turn)) return false;
  return !s.verdict || fields(s.verdict, ["verdict", "title", "epitaph", "rating"]);
}

export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!isObj(d) || d.version !== SAVE_VERSION) return null;
    if (d.screen !== "intro" && d.screen !== "game" && d.screen !== "ending") return null;
    const s = d.state;
    if (!isObj(s) || !validState(s)) return null;
    if (d.screen === "ending" && !s.ended) return null;
    const saved=d as unknown as SaveData;
    // Повреждение необязательной аналитики не лишает игрока сохранения.
    if (saved.state.analyticsRun !== undefined && !validAnalyticsRun(saved.state.analyticsRun)) delete saved.state.analyticsRun;
    if(saved.state.currentEvent?.doc&&saved.state.currentEvent.choices.some(c=>c.id==='d'))saved.state={...saved.state,currentEvent:managementDocument(saved.state.currentEvent)};
    return saved;
  } catch {
    return null;
  }
}
