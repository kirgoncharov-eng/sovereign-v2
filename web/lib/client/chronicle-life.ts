// Хроника (#310, E05): жизнь за воротами резиденции — три постоянных места, которые меняются вслед за опорами.
// Только представление: строка выбирается по уже рассчитанному состоянию квартала и по тому, что лента печатала
// раньше. Случайности, цены, исходы и сохранение партии не затронуты; память — в снимке ленты, как у личных строк.
import { TERM } from '../game/data.ts';
import { LIFE_1978, type LifeBand, type LifePlace } from '../content/life-1978.ts';
import type { GameState } from '../game/types.ts';
import type { PersonalMemory } from './chronicle-personal.ts';

const band = (place: LifePlace, value: number): LifeBand => value < place.low ? 'low' : value > place.high ? 'high' : 'mid';
const ORDER: LifeBand[] = ['low', 'mid', 'high'];

/** Что лента уже рассказала о месте: уровни по порядку и использованные строки. */
function told(place: LifePlace, memory: PersonalMemory) {
  const entries = (memory.life ?? []).filter(id => id.startsWith(`${place.id}:`)).map(id => id.split(':'));
  return { bands: entries.map(parts => parts[1] as LifeBand), variants: new Set(entries.map(parts => parts.slice(2).join(':'))) };
}

function pick(place: LifePlace, now: LifeBand, past: LifeBand[]): { variant: string; text: string } | null {
  const last = past.at(-1);
  if (!last) return { variant: 'first', text: place.first[now] };
  if (last === now) {
    // Уровень держится второй раз подряд — нового факта нет, место молчит.
    return past.at(-2) === now ? null : { variant: 'same', text: place.same[now] };
  }
  const better = ORDER.indexOf(now) > ORDER.indexOf(last);
  return better ? { variant: 'up', text: place.up[now as 'mid' | 'high'] } : { variant: 'down', text: place.down[now as 'mid' | 'low'] };
}

export interface LifeBeat {
  text: string | null;
  memory: PersonalMemory;
}

/**
 * Строка о жизни страны в этом квартале — не чаще одной и только в свои кварталы срока.
 * `quiet` — в квартале уже есть фон страны или выборы: место подождёт следующего своего квартала.
 */
export function lifeBeat(after: GameState, memory: PersonalMemory, quiet: boolean): LifeBeat {
  if (quiet || after.ended) return { text: null, memory };
  const quarter = ((after.turn - 1) % TERM) + 1;
  const place = LIFE_1978.find(entry => entry.turns.includes(quarter));
  if (!place) return { text: null, memory };
  const now = band(place, after.resources[place.resource]);
  const past = told(place, memory);
  const chosen = pick(place, now, past.bands);
  const key = chosen ? `${chosen.variant}:${now}` : '';
  // Одна и та же строка дважды за партию не звучит: место промолчит, но уровень запомнит.
  const fresh = chosen && !past.variants.has(key) ? chosen : null;
  const entry = `${place.id}:${now}:${fresh ? key : 'quiet'}`;
  return { text: fresh?.text ?? null, memory: { ...memory, life: [...(memory.life ?? []), entry] } };
}
