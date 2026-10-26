import { ACTIONS, COUNTRIES, RES_CONFIG } from '../game/data.ts';
import { initiativeOptions } from '../game/initiatives.ts';
import { livingActions } from '../game/living-world.ts';
import { pactIncome, PACT_BROKEN, PACT_SIGN } from '../game/people.ts';
import type { InitiativeBlock, InitiativeOption } from '../game/initiatives.ts';
import type { GameState, ResourceDelta, ResourceKey } from '../game/types.ts';

export const INITIATIVE_TITLES: Record<string, string> = {
  'advance:domestic': 'Аванс казначейства',
  'advance:russia': 'Аванс Российской делегации',
  'advance:west': 'Аванс Торгового союза',
  'support:regional': 'Поддержка областей',
  garrison: 'Снабжение гарнизонов',
  settlement: 'Урегулирование внешних претензий',
  payments: 'Резерв срочных выплат',
  delegate: 'Делегирование согласований',
};

const BLOCK_REASONS: Record<InitiativeBlock, string> = {
  unavailable_campaign: 'Эта мера недоступна в данной партии.',
  first_decision: 'Сначала примите первое решение в кабинете.',
  ended: 'Правление завершено. Новые распоряжения не принимаются.',
  intervention_used: 'Личное распоряжение в этом квартале уже подписано. Новое — в следующем квартале.',
  reserve_used: 'Этот резерв уже использован в нынешнем сроке. Повторная подпись невозможна.',
  actor_missing: 'Нет участника, который может исполнить это поручение.',
  partner_refuses:
    'Партнёр не согласен: отношение его лагеря должно быть не ниже −20, а его личное — не ниже 0.',
  pact_exists: 'Договор с этим лагерем уже действует.',
  pact_limit: 'Достигнут предел действующих договоров. Нужно дождаться окончания одного из них.',
  repayment_after_term: 'Вернуть аванс до конца нынешнего срока уже не успеть.',
  resource_floor: 'Цена распоряжения оставляет одну из опор у порога падения власти.',
  resource_threshold: 'Цена распоряжения переведёт другую опору в зону кризиса.',
  security_warning:
    'Силовой лагерь настроен против вас (отношение −55 или ниже). Усиление гарнизонов слишком опасно.',
  no_gain: 'Запас этой опоры уже полон: немедленной прибавки не будет.',
};

export const signedNumber = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');
export const resourceName = (key: ResourceKey) => RES_CONFIG.find((resource) => resource.key === key)!.prompt;

export function deltaLines(delta: ResourceDelta): string[] {
  return RES_CONFIG.flatMap((resource) =>
    delta[resource.key] ? [`${resource.prompt}: ${signedNumber(delta[resource.key]!)}`] : []
  );
}

// due — конец пронумерованного квартала; начальный год зависит от кампании.
export function quarterDeadline(state: GameState, due: number, genitive = false): string {
  const quarterIndex = due - 1;
  const year = COUNTRIES[state.country].startYear + Math.floor(quarterIndex / 4);
  return `${genitive ? 'конца' : 'конец'} ${['I', 'II', 'III', 'IV'][quarterIndex % 4]} квартала ${year} года`;
}

export function initiativeBlockReason(state: GameState, option: InitiativeOption): string | null {
  if (!option.blocked) return null;
  const { code, resource, after } = option.blocked;
  let reason = BLOCK_REASONS[code];
  if (resource) reason += ` ${resourceName(resource)}: ${state.resources[resource]} → ${after}.`;
  if (code === 'partner_refuses' && option.faction && option.actor) {
    const faction = state.factions.find((entry) => entry.id === option.faction!.id);
    const figure = state.keyFigures.find((entry) => entry.id === option.actor!.id);
    reason += ` Сейчас: лагерь ${signedNumber(faction?.relation ?? 0)}, лично ${signedNumber(figure?.relation ?? 0)}.`;
  }
  return reason;
}

export function initiativeNote(state: GameState, option: InitiativeOption) {
  const relations = Object.entries(option.factionChanges).flatMap(([id, delta]) => {
    const faction = state.factions.find((entry) => entry.id === id);
    return faction && delta ? [`${faction.name}: отношение к вам ${signedNumber(delta)}`] : [];
  });
  const commitments: string[] = [];
  if (option.repayment)
    commitments.push(
      `Возврат аванса — ${quarterDeadline(state, option.repayment.due)}: ${deltaLines(option.repayment.res).join('; ')}.`
    );
  if (option.pact) {
    const figure = state.keyFigures.find((entry) => entry.id === option.pact!.figure);
    if (figure)
      relations.push(
        `${figure.name}: личное отношение ${signedNumber(Math.min(100, figure.relation + PACT_SIGN.figure) - figure.relation)}`
      );
    commitments.push(
      `При соблюдении договора: влияние +${pactIncome(option.pact)} за квартал, начиная с ` +
        `${quarterDeadline(state, option.pact.since + 1, true)}; всего 3 выплаты.`
    );
    commitments.push(
      `Договор до ${quarterDeadline(state, option.pact.until, true)}. Не проводить: ` +
        `${option.pact.ban.map((tag) => ACTIONS[tag].label).join(', ')}. Нарушение разорвёт договор.`
    );
    commitments.push(
      `Цена нарушения: отношение лагеря ${PACT_BROKEN.faction}, личное отношение ${PACT_BROKEN.figure}, ` +
        `отношение остальных лагерей ${PACT_BROKEN.others}.`
    );
  }
  return {
    title: INITIATIVE_TITLES[option.id],
    actor: option.actor ? `${option.actor.name} · ${option.actor.role}` : 'Исполнитель не найден',
    immediate: deltaLines(option.immediate),
    relations,
    commitments,
    blocked: initiativeBlockReason(state, option),
  };
}

// Сначала реальные способы снять источник потерь; их цену и доступность даёт существующий движок.
export function existingResourceResponses(state: GameState, resource: ResourceKey) {
  const health = state.world?.health;
  return livingActions(state).filter((action) => {
    if (action.id === 'government:release') return resource === 'personalResource';
    if (action.id === 'minister:withdraw') return resource === 'economy' || resource === 'politicalCapital';
    return (
      (action.id.startsWith('health:response:') || action.id.startsWith('health:bargain:')) &&
      !!health?.aftermath &&
      ['economy', 'internalLegitimacy', 'politicalCapital'].includes(resource)
    );
  });
}

export function resourceInitiatives(state: GameState, resource: ResourceKey) {
  // До первого решения сохраняется прежняя справка без дополнительных блоков.
  return state.turn > 0 && !state.ended ? initiativeOptions(state, resource) : [];
}
