// Мета-прогрессия между партиями: архив правлений, коллекция концовок, достижения, открытие стран.
import { COUNTRIES, IDEOLOGIES } from "../game/data.ts";
import { ARCS } from "../content/arcs.ts";
import { hashSeed, isSurvival, seededRandom } from "../game/engine.ts";
import { isObj } from "../game/sanitize.ts";
import type { DifficultyId, EndType, GameState, IdeologyId } from "../game/types.ts";

const KEY = "sovereign.meta";
export const ALL_ENDINGS: EndType[] = ["reelected", "mandate", "revolution", "collapse", "coup", "impeachment"];
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
}

interface Achievement { id: string; title: string; desc: string; check: (gs: GameState, meta: Meta) => boolean }

export const ACHIEVEMENTS: Achievement[] = [
  { id:"first_term",  title:"Первый срок",       desc:"Дожить до конца мандата",                     check: gs => isSurvival(gs.endType) },
  { id:"second_term", title:"Второй срок",       desc:"Переизбраться на президентских выборах",       check: gs => gs.endType === "reelected" },
  { id:"phoenix",     title:"Феникс",            desc:"Пережить мандат на сложности «Обломки»",       check: gs => gs.diff === "ruins" && isSurvival(gs.endType) },
  { id:"clean_hands", title:"Чистые руки",       desc:"Переизбраться, ни разу не применив силу",       check: gs => gs.endType === "reelected" && !gs.history.some(h => h.tags?.includes("repress")) },
  { id:"crisis_mgr",  title:"Кризис-менеджер",   desc:"Преодолеть 3 кризиса за одну партию",           check: gs => (gs.stats?.crisesResolved ?? 0) >= 3 },
  { id:"lone_wolf",   title:"Одиночка",          desc:"Переизбраться, ни разу не собрав совет",        check: gs => gs.endType === "reelected" && !(gs.stats?.councils ?? 0) },
  { id:"hundred_days",title:"Сто дней",          desc:"Потерять власть до 5-го хода",                  check: gs => !isSurvival(gs.endType) && gs.turn < 5 },
  { id:"epaulettes",  title:"Недооценил погоны", desc:"Пасть жертвой переворота",                      check: gs => gs.endType === "coup" },
  { id:"all_roads",   title:"Все дороги",        desc:"Открыть все 6 концовок",                         check: (_, m) => new Set(Object.values(m.endings).flat()).size >= ALL_ENDINGS.length },
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

// «Дело дня»: одна и та же партия у всех игроков в течение суток — можно сравнить итог с друзьями.
export function dailyCase(now = new Date()) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const seed = hashSeed("daily", date);
  const r = seededRandom(seed);
  const countries = Object.keys(COUNTRIES);
  const diffs: DifficultyId[] = ["coalition", "coalition", "crisis"];
  return {
    date, seed,
    country: countries[Math.floor(r() * countries.length)],
    diff: diffs[Math.floor(r() * diffs.length)],
    ideo: IDEOLOGIES[Math.floor(r() * IDEOLOGIES.length)].id as IdeologyId,
  };
}

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
  if (gs.arc?.epilogue && !meta.arcs?.includes(gs.arc.id)) meta.arcs = [...(meta.arcs ?? []), gs.arc.id];
  const got = meta.endings[gs.country] ?? [];
  if (!got.includes(gs.endType)) meta.endings[gs.country] = [...got, gs.endType];
  const unlocked = ACHIEVEMENTS.filter(a => !meta.achievements.includes(a.id) && a.check(gs, meta));
  meta.achievements.push(...unlocked.map(a => a.id));
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* недоступно */ }
  listeners.forEach(l => l());
  return { meta, unlocked };
}
