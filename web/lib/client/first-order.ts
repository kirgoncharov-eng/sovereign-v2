import { livingActions } from '../game/living-world.ts';
import type { GameState } from '../game/types.ts';

export interface FirstOrderLesson {
  phase: 'assign' | 'signed' | 'report' | 'wait' | 'blocked';
}
// Обучение опирается на настоящие решения и доклады, без отдельной копии игрового состояния.
export function firstOrderLesson(gs: GameState): FirstOrderLesson | null {
  const world = gs.world, health = world?.health;
  if (gs.daily || gs.ended || !world || !health || health.openedTurn !== 0 || gs.turn > 3) return null;
  if (health.status === 'unassigned') {
    if (gs.turn === 0) return null;
    if (world.lastActionTurn === gs.turn) return { phase: 'wait' };
    const available = livingActions(gs).some(action => action.id.startsWith('health:appoint:') && !action.blocked);
    return { phase: available ? 'assign' : 'blocked' };
  }
  if (health.status !== 'running') return null;
  const decisions = world.dispatches.filter(report => report.project === 'health' && report.kind === 'decision');
  if (decisions.length !== 1) return null;
  if (decisions[0].turn === gs.turn) return { phase: 'signed' };
  if (decisions[0].turn + 1 === gs.turn) return { phase: 'report' };
  return null;
}
