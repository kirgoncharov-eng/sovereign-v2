import { COUNTRIES } from '../game/data.ts';
import { monthYear, turnDate } from '../game/calendar.ts';
import type { GameState } from '../game/types.ts';
import { squareStateOf } from './square-state.ts';
import type { SquareState } from './square.ts';

export interface QuarterTransition {
  kind: 'country' | 'hospital';
  duration: number;
  from: string;
  to: string;
  title: string;
  detail: string;
  before: SquareState;
  after: SquareState;
  staffing: number;
}
// Только представление уже разрешённого хода. Никаких тиков, запросов или скрытых факторов.
export function quarterTransition(before: GameState, after: GameState): QuarterTransition | null {
  if (before.daily || after.daily || after.ended || after.lastTurn?.election || !after.lastTurn || after.turn !== before.turn + 1) return null;
  const date = (turn: number) => turnDate(after.seed, COUNTRIES[after.country].startYear, turn);
  const previous = before.world?.health, health = after.world?.health;
  const hospital = previous?.status === 'running' && !!health && after.world?.dispatches.some(item => item.project === 'health' && item.turn === after.turn && ['report','news'].includes(item.kind));
  const beforeScene = { ...squareStateOf(before, 1), season: date(before.turn).season };
  const afterScene = { ...squareStateOf(after, 2), season: date(after.turn).season };
  return {
    kind: hospital ? 'hospital' : 'country', duration: hospital ? 1600 : 1000,
    from: monthYear(date(before.turn)), to: monthYear(date(after.turn)),
    title: hospital ? 'Квартал в районных больницах' : 'Страна проживает квартал',
    detail: hospital
      ? `Укомплектованность ставок: ${previous!.progress}% → ${health!.progress}%. Причины — в докладе.`
      : 'Ваше решение принято. Вечерняя газета сообщит, что произошло за это время.',
    before: beforeScene, after: afterScene, staffing: hospital ? health!.progress : 0,
  };
}
