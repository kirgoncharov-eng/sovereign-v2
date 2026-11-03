// #347: сцена отставки объясняет рассчитанную причину, не подменяя истощение лидера пустой казной.
import { CRISIS_DESC } from '../content/narration.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { LIMITS, RESOURCE_KEYS } from './data.ts';
import type { GameState } from './types.ts';

export function collapseNarrative(state: Pick<GameState, 'country' | 'endType' | 'resources' | 'leader'>): string | null {
  if (state.country !== ALTERNATE_COUNTRY || state.endType !== 'collapse') return null;
  const causes = RESOURCE_KEYS.filter(key => state.resources[key] <= LIMITS.endResource);
  if (!causes.length) return null;
  return `${causes.map(key => CRISIS_DESC[key]).join(' ')} В пустом кабинете ${state.leader.name} `
    + 'подписывает последний указ — о собственной отставке.';
}
