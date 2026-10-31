import { RESOURCE_KEYS, SAVE_VERSION } from '../game/data.ts';
import { parseSave } from './save.ts';
import type { ChronicleLine, ChronicleStart, Step, memoir } from './chronicle.ts';
import type { PersonalMemory } from './chronicle-personal.ts';
import type { Stop, StopMemory } from './chronicle-stops.ts';
import type { Rival } from './chronicle-rivals.ts';
import type { GameState, ResourceKey } from '../game/types.ts';

export const CHRONICLE_SAVE_KEY = 'sovereign.chronicle.v1';
// v2 (#302): анкета ЦИК, остановка на обращении и память показанных остановок. Сохранение v1 читается с пустыми.
const CHRONICLE_VERSION = 2;

/** Анкета ЦИК в ленте: текущий шаг, сколько раз меняли имя и выбранные обещания программы. */
export interface ChronicleForm {
  field: 'name' | 'bio' | 'ideo' | 'program';
  nameStep: number;
  promises: string[];
}

export interface ChronicleSnapshot {
  start: ChronicleStart;
  game: GameState;
  shown: ChronicleLine[];
  queue: ChronicleLine[];
  step: Step | null;
  picks: number[];
  form: ChronicleForm | null;
  stop: Stop | null;
  stops: StopMemory;
  memory: PersonalMemory;
  visibleResources: Record<ResourceKey, number>;
  page: Awaited<ReturnType<typeof memoir>> | null;
  rivals: Rival[] | null;
  over: boolean;
}
export function encodeChronicle(snapshot: ChronicleSnapshot): string {
  return JSON.stringify({ version: CHRONICLE_VERSION, snapshot });
}
export function parseChronicle(raw: string | null): ChronicleSnapshot | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    const snapshot = saved?.snapshot;
    if (![1, CHRONICLE_VERSION].includes(saved?.version) || !snapshot || typeof snapshot !== 'object') return null;
    const form = snapshot.form ?? null, stop = snapshot.stop ?? null, stops = snapshot.stops ?? {};
    const fields = ['name', 'bio', 'ideo', 'program'];
    if ((form !== null && (!fields.includes(form.field) || !Number.isInteger(form.nameStep)
        || !Array.isArray(form.promises) || !form.promises.every((id: unknown) => typeof id === 'string')))
      || (stop !== null && (typeof stop.key !== 'string' || typeof stop.token !== 'string' || !['letter', 'proposal', 'story', 'staff'].includes(stop.kind)))
      || typeof stops !== 'object' || Array.isArray(stops)
      || !Object.values(stops).every((seen: unknown) => !!seen && typeof (seen as { token?: unknown }).token === 'string'
        && Number.isInteger((seen as { turn?: unknown }).turn))) return null;
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
    return { ...snapshot, form, stop, stops, game } as ChronicleSnapshot;
  } catch { return null; }
}
