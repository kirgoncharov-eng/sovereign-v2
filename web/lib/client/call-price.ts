// Звонок по защищённой линии (#310, C09): чем кончится разговор, игрок видит до последнего нажатия.
// Собеседник уже ответил на выбранный тон, поэтому цена каждого окончания известна: её считает тот же `callChoice`,
// что и подпись. Здесь только представление — расчёт, случайность и исход не меняются.
import { CALL_ENDINGS, type Approach } from '../content/calls.ts';
import { historicalCallTopic } from '../content/historical-calls.ts';
import { RESOURCE_TITLE } from '../content/resource-names.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { callChoice } from '../game/classic.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import type { GameState, ResourceDelta } from '../game/types.ts';

export type CallEndingId = (typeof CALL_ENDINGS)[number]['id'];

export interface CallEnding {
  id: CallEndingId;
  /** Подпись варианта: у предметного разговора соглашение названо по существу. */
  text: string;
  /** Что изменится сразу: опоры, отношение собеседника и его лагеря. */
  price: string[];
  /** Что придёт позже, если взять время. */
  later: string | null;
}

const signed = (value: number) => `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))}`;
const resources = (delta: ResourceDelta | undefined) => RESOURCE_KEYS
  .filter(key => Math.round(delta?.[key] ?? 0) !== 0).map(key => `${RESOURCE_TITLE[key]} ${signed(delta![key]!)}`);

/** Три окончания разговора после выбранного тона — с ценой каждого. */
export function callEndings(state: GameState, approach: Approach): CallEnding[] {
  const call = state.currentEvent?.call;
  if (!call || call.negotiation) return [];
  const figure = state.keyFigures.find(person => person.id === call.figure);
  const camp = figure && state.factions.find(group => group.id === figure.faction);
  // Предмет разговора есть только у авторского звонка первого срока; иначе подписи прежние.
  const topic = camp && state.country === ALTERNATE_COUNTRY && !state.daily && state.turn === 16
    ? historicalCallTopic(camp.bloc, call.demand) : null;
  return CALL_ENDINGS.map(ending => {
    const deal = callChoice(state, approach, ending.id).deal!;
    const campShift = camp ? deal.factionRel?.[camp.id] ?? 0 : 0;
    const price = [
      ...resources(deal.res),
      ...(figure && deal.figureRel ? [`${figure.name}: отношение ${signed(deal.figureRel)}`] : []),
      ...(camp && campShift ? [`«${camp.name}» ${signed(campShift)}`] : []),
    ];
    const later = deal.later ? `Через ${deal.later.turns} квартала обещание напомнит о себе: ${resources(deal.later.res).join(', ')}` : null;
    return {
      id: ending.id,
      text: topic && ending.id === 'deal' ? `Согласовать ${topic.subject}` : ending.text,
      price: price.length ? price : ['Сейчас ничего не изменится'],
      later,
    };
  });
}
