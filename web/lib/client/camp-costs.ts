// Цена решения по лагерям (#196): кого вариант злит и кого радует — до подписи, а не после предупреждения о перевороте.
// Опоры (казна, влияние…) варианты уже показывают; отношения лагерей раньше были видны только по итогам хода.
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import { choiceEffects } from "../game/engine.ts";
import type { Choice, GameState } from "../game/types.ts";

// Мелкие сдвиги не показываем: строка должна называть заметное, а не всех понемногу.
export const CAMP_COST_MIN = 4;
const MAX_CAMPS = 3;

export interface CampCost { id: string; name: string; delta: number }

// Только кампания 1978 года и не на первом ходу: первая сессия не тяжелеет, архив не меняется.
export function campCosts(gs: GameState, choice: Choice): CampCost[] {
  if (gs.country !== ALTERNATE_COUNTRY || gs.turn < 1) return [];
  const rel = choiceEffects(gs, choice).factionRel;
  return gs.factions
    .map(faction => ({ id: faction.id, name: faction.name, delta: Math.round(rel[faction.id] ?? 0) }))
    .filter(camp => Math.abs(camp.delta) >= CAMP_COST_MIN)
    // Сначала потери: от них зависит угроза; затем самые заметные выигрыши.
    .sort((left, right) => Number(left.delta > 0) - Number(right.delta > 0) || Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, MAX_CAMPS);
}
