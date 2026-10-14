import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import type { GameState } from '../game/types.ts';

export function isFactoryOpening(state: GameState): boolean {
  return state.country === ALTERNATE_COUNTRY && !state.daily && state.turn === 0
    && state.currentEvent?.card === 'alt_wages';
}

export interface FactoryOutcome {
  path: 'a' | 'b' | 'c';
  success: boolean;
  headline: string;
  detail: string;
}

/** Presentation of the already resolved policy, never a second roll or a new reward. */
export function factoryOutcome(before: GameState, after: GameState): FactoryOutcome | null {
  if (!isFactoryOpening(before) || after.daily || after.turn !== before.turn + 1 || !after.lastTurn) return null;
  const choice = before.currentEvent!.choices.find(item => item.text === after.lastTurn!.choiceText);
  if (!choice || !['a', 'b', 'c'].includes(choice.id)) return null;
  const detail = after.lastTurn.success ? choice.scene : choice.sceneFail;
  if (!detail) return null;
  const headline = after.lastTurn.success ? choice.headline : choice.headlineFail;
  return { path: choice.id as FactoryOutcome['path'], success: after.lastTurn.success,
    headline: headline ?? after.lastTurn.headline, detail };
}

export const FACTORY_CALL = [
  { speaker: 'Представитель рабочих', text: 'Два месяца без зарплаты. У директора ответ один: покупатель не заплатил. Нам что семьям говорить?' },
  { speaker: 'Представитель рабочих', text: 'Мы готовы вас выслушать. Но забастовочный комитет уже собран. Передайте решение людям, а не только директору.' },
] as const;
