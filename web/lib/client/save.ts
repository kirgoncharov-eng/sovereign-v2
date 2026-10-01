// Автосохранение партии в localStorage с подпиской для useSyncExternalStore.
import { SAVE_VERSION } from "../game/data.ts";
import { isObj, validCountry } from "../game/sanitize.ts";
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

export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!isObj(d) || d.version !== SAVE_VERSION) return null;
    if (d.screen !== "intro" && d.screen !== "game" && d.screen !== "ending") return null;
    const s = d.state;
    if (!isObj(s) || !validCountry(s.country) || !isObj(s.leader) || !isObj(s.resources)) return null;
    if (!Array.isArray(s.factions) || !Array.isArray(s.keyFigures) || !Array.isArray(s.history)) return null;
    return d as unknown as SaveData;
  } catch {
    return null;
  }
}
