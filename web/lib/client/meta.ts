// Мета-прогрессия между партиями: архив правлений, коллекция концовок, достижения, открытие стран.
import { COUNTRIES } from "../game/data.ts";
import { ARCS } from "../content/arcs.ts";
import { isSurvival } from "../game/engine.ts";
import { fellTrying, wonToStay } from "../game/terms.ts";
import { isObj } from "../game/sanitize.ts";
import type { EndType, GameState } from "../game/types.ts";

const KEY = "sovereign.meta";
export const ALL_ENDINGS: EndType[] = [
  "reelected", "mandate", "retired", "zeroed", "premier", "leader_of_nation", "emergency_rule", "dictator",
  "revolution", "collapse", "coup", "impeachment", "betrayed", "died",
];
// Чем кончались сроки по ходу правления — второй срок, обнуление, указы — тоже открывают концовки коллекции.
const termOutcomes = (gs: GameState) => (gs.reign?.past ?? []).map(p => p.outcome);
const stayed = (gs: GameState, ...ends: EndType[]) => ends.includes(gs.endType as EndType) || termOutcomes(gs).some(o => ends.includes(o));
export const BASE_COUNTRIES = ["Беларусь", "Украина", "Грузия"];

export interface RunRecord {
  seed: number;
  country: string;
  diff: string;
  leader: string;
  title: string;
  endType: EndType;
  rating: string;
  turns: number;
  date: string;
  daily?: string;
}

export interface Meta {
  runs: RunRecord[];
  endings: Record<string, EndType[]>;
  achievements: string[];
  arcs?: string[]; // раскрытые интриги
  best?: number;   // личный рекорд: дольше всего у власти, в ходах
}
// Личный рекорд — не только из последних партий архива, который хранит не всё.
export const bestReign = (m: Meta) => Math.max(m.best ?? 0, ...m.runs.map(r => r.turns));

interface Achievement { id: string; title: string; desc: string; check: (gs: GameState, meta: Meta) => boolean }

export const ACHIEVEMENTS: Achievement[] = [
  { id:"first_term",  title:"Первый срок",       desc:"Дожить до конца мандата",                     check: gs => gs.turn >= 20 },
  { id:"second_term", title:"Второй срок",       desc:"Переизбраться на президентских выборах",       check: gs => stayed(gs, "reelected", "zeroed") },
  { id:"phoenix",     title:"Феникс",            desc:"Пережить мандат на сложности «Обломки»",       check: gs => gs.diff === "ruins" && gs.turn >= 20 },
  { id:"clean_hands", title:"Чистые руки",       desc:"Остаться у власти через выборы, ни разу не применив силу", check: gs => termOutcomes(gs).some(wonToStay) && !gs.history.some(h => h.tags?.includes("repress")) },
  { id:"crisis_mgr",  title:"Кризис-менеджер",   desc:"Преодолеть 3 кризиса за одну партию",           check: gs => (gs.stats?.crisesResolved ?? 0) >= 3 },
  { id:"lone_wolf",   title:"Одиночка",          desc:"Остаться у власти через выборы, ни разу не собрав совет", check: gs => termOutcomes(gs).some(wonToStay) && !(gs.stats?.councils ?? 0) },
  { id:"hundred_days",title:"Сто дней",          desc:"Потерять власть до 5-го хода",                  check: gs => !isSurvival(gs.endType) && gs.turn < 5 },
  { id:"epaulettes",  title:"Недооценил погоны", desc:"Пасть жертвой переворота",                      check: gs => gs.endType === "coup" },
  { id:"all_roads",   title:"Все дороги",        desc:`Открыть все ${ALL_ENDINGS.length} концовок`,          check: (_, m) => new Set(Object.values(m.endings).flat()).size >= ALL_ENDINGS.length },
  { id:"cincinnatus", title:"Цинциннат",         desc:"Уйти самому, когда мог остаться",               check: gs => gs.endType === "retired" && !gs.path?.from },
  { id:"kingmaker",   title:"Делатель королей",  desc:"Передать власть преемнику и сохранить влияние", check: gs => gs.endType === "leader_of_nation" },
  { id:"iron_fist",   title:"Железная рука",     desc:"Отменить выборы и удержаться у власти",         check: gs => stayed(gs, "dictator", "emergency_rule") },
  { id:"overreach",   title:"Свергнут при попытке", desc:"Потерять власть, пытаясь отменить выборы",   check: gs => fellTrying(gs.path, gs.endType, gs.reign) },
  { id:"decade",      title:"Десятилетие",       desc:"Продержаться у власти десять лет",               check: gs => gs.turn >= 40 },
  { id:"third_term",  title:"Третий срок",       desc:"Начать третий срок — любым способом",            check: gs => gs.turn > 40 },
  { id:"patriarch",   title:"Патриарх",          desc:"Править двадцать лет",                           check: gs => gs.turn >= 80 },
  { id:"in_office",   title:"До последнего дня", desc:"Умереть на посту",                               check: gs => gs.endType === "died" },
  { id:"all_secrets", title:"Все тайны",        desc:"Довести до развязки каждую интригу",            check: (_, m) => ARCS.every(a => m.arcs?.includes(a.id)) },
  { id:"traveler",    title:"Путешественник",    desc:"Сыграть за все страны",                          check: (_, m) => Object.keys(COUNTRIES).every(c => m.runs.some(r => r.country === c)) },
];

const empty = (): Meta => ({ runs: [], endings: {}, achievements: [] });

const listeners = new Set<() => void>();
export function subscribeMeta(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
export function readMetaRaw(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function parseMeta(raw: string | null): Meta {
  if (!raw) return empty();
  try {
    const m = JSON.parse(raw);
    if (!isObj(m) || !Array.isArray(m.runs) || !isObj(m.endings) || !Array.isArray(m.achievements)) return empty();
    return m as unknown as Meta;
  } catch {
    return empty();
  }
}

export { dailyCase } from "../game/daily.ts";

export const unlockedCountries = (meta: Meta) =>
  meta.runs.length ? Object.keys(COUNTRIES) : BASE_COUNTRIES;

// Записывает итог партии (повторный вызов для той же партии ничего не меняет).
export function recordRun(gs: GameState): { meta: Meta; unlocked: Achievement[] } {
  const meta = parseMeta(readMetaRaw());
  if (!gs.endType || !gs.verdict || meta.runs.some(r => r.seed === gs.seed)) return { meta, unlocked: [] };
  meta.runs = [{
    seed: gs.seed, country: gs.country, diff: gs.diff, leader: gs.leader.name, title: gs.verdict.title,
    endType: gs.endType, rating: gs.verdict.rating, turns: gs.turn, date: new Date().toISOString().slice(0, 10),
    ...(gs.daily ? { daily: gs.daily } : {}),
  }, ...meta.runs].slice(0, 50);
  meta.best = Math.max(bestReign(meta), gs.turn);
  if (gs.arc?.epilogue && !meta.arcs?.includes(gs.arc.id)) meta.arcs = [...(meta.arcs ?? []), gs.arc.id];
  meta.endings[gs.country] = [...new Set([...(meta.endings[gs.country] ?? []), gs.endType, ...termOutcomes(gs)])];
  const unlocked = ACHIEVEMENTS.filter(a => !meta.achievements.includes(a.id) && a.check(gs, meta));
  meta.achievements.push(...unlocked.map(a => a.id));
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* недоступно */ }
  listeners.forEach(l => l());
  return { meta, unlocked };
}

// ── Синхронизация через облако Telegram (до 4 КБ) ──────────────────────────
export const compactMeta = (meta: Meta) => JSON.stringify({ ...meta, runs: meta.runs.slice(0, 12) });

// Объединяет облачную копию с локальной: достижения, концовки и интриги — объединением, партии — по seed.
export function importMeta(raw: string | null) {
  if (!raw) return;
  const cloud = parseMeta(raw), local = parseMeta(readMetaRaw());
  const merged: Meta = {
    runs: [...local.runs, ...cloud.runs.filter(c => !local.runs.some(l => l.seed === c.seed))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50),
    endings: Object.fromEntries([...new Set([...Object.keys(local.endings), ...Object.keys(cloud.endings)])]
      .map(c => [c, [...new Set([...(local.endings[c] ?? []), ...(cloud.endings[c] ?? [])])]])),
    achievements: [...new Set([...local.achievements, ...cloud.achievements])],
    arcs: [...new Set([...(local.arcs ?? []), ...(cloud.arcs ?? [])])],
    best: Math.max(bestReign(local), bestReign(cloud)),
  };
  if (JSON.stringify(merged) === JSON.stringify(local)) return;
  try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* недоступно */ }
  listeners.forEach(l => l());
}
