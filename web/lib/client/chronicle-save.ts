import { RESOURCE_KEYS, SAVE_VERSION } from '../game/data.ts';
import { parseSave } from './save.ts';
import type { ChronicleLine, ChronicleStart, Step, memoir } from './chronicle.ts';
import type { PersonalMemory } from './chronicle-personal.ts';
import type { Rival } from './chronicle-rivals.ts';
import type { GameState, ResourceKey } from '../game/types.ts';

export const CHRONICLE_SAVE_KEY = 'sovereign.chronicle.v1';
export interface ChronicleSnapshot {
  start: ChronicleStart;
  game: GameState;
  shown: ChronicleLine[];
  queue: ChronicleLine[];
  step: Step | null;
  picks: number[];
  memory: PersonalMemory;
  visibleResources: Record<ResourceKey, number>;
  page: Awaited<ReturnType<typeof memoir>> | null;
  rivals: Rival[] | null;
  over: boolean;
}
export function encodeChronicle(snapshot: ChronicleSnapshot): string {
  return JSON.stringify({ version: 1, snapshot });
}
export function parseChronicle(raw: string | null): ChronicleSnapshot | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    const snapshot = saved?.snapshot;
    if (saved?.version !== 1 || !snapshot || typeof snapshot !== 'object') return null;
    const game = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: snapshot.game }))?.state;
    if (!game || !snapshot.start || !Number.isInteger(snapshot.start.seed) || game.diff !== snapshot.start.diff) return null;
    const isLine = (line: ChronicleLine) => line && typeof line.id === 'string' && typeof line.text === 'string'
      && typeof line.kind === 'string' && line.date && Number.isInteger(line.date.year)
      && Number.isInteger(line.date.month) && line.date.month >= 0 && line.date.month < 12 && Number.isInteger(line.date.day);
    if (!Array.isArray(snapshot.shown) || !snapshot.shown.every(isLine)
      || !Array.isArray(snapshot.queue) || !snapshot.queue.every(isLine)
      || !Array.isArray(snapshot.picks) || !snapshot.picks.every(Number.isInteger)
      || !snapshot.memory || !Array.isArray(snapshot.memory.used)
      || !snapshot.memory.used.every((id: unknown) => typeof id === 'string')
      || !(snapshot.memory.lastTurn === null || Number.isInteger(snapshot.memory.lastTurn))
      || !snapshot.visibleResources || !RESOURCE_KEYS.every(key => Number.isFinite(snapshot.visibleResources[key]))
      || typeof snapshot.over !== 'boolean'
      || (snapshot.step !== null && (!snapshot.step || !Array.isArray(snapshot.step.options)
        || !snapshot.step.options.every((option: { key: unknown; text: unknown }) =>
          option && typeof option.key === 'string' && typeof option.text === 'string')))
      || (snapshot.rivals !== null && !Array.isArray(snapshot.rivals))) return null;
    return { ...snapshot, game } as ChronicleSnapshot;
  } catch { return null; }
}
