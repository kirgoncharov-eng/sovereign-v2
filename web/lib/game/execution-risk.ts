// #337: авторский срыв первого заводского дела. Цифры описывают существующую сцену, а не общий штраф за неудачу.
// Нет нового состояния: профиль выбирается по уже сохранённым кампании, карточке и варианту решения.
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { Bloc, Choice, GameState, ResourceDelta } from './types.ts';

export type ExecutionContext = Partial<Pick<GameState, 'country' | 'currentEvent' | 'daily'>>;

interface ExecutionRisk {
  forPolicy: ResourceDelta; // профиль действует только для исходной редакции варианта, не для переделанного предложения
  reason: string;
  resources: ResourceDelta; // как policyEffect: до общего веса цены и качества советника
  stance: Partial<Record<Bloc, number>>;
}

const WAGES_RISKS: Readonly<Record<string, ExecutionRisk>> = {
  a: {
    forPolicy: { economy: -7, internalLegitimacy: 6, politicalCapital: 2, personalResource: -1 },
    reason: 'Банк может списать помощь в счёт старой ссуды раньше выплаты зарплаты. Казна потратит деньги, рабочие их не получат.',
    resources: { economy: -7, internalLegitimacy: -3, politicalCapital: -2, personalResource: -1 },
    stance: { business: -4, liberal: -3, regional: -6 },
  },
  b: {
    forPolicy: { economy: 2, internalLegitimacy: 2, personalResource: -2 },
    reason: 'Покупатель может задержать аванс, потребовав дополнительную гарантию. Завод уже откажется от другого заказа и останется без денег.',
    resources: { economy: -2, internalLegitimacy: -3, politicalCapital: -1, personalResource: -2 },
    stance: { business: -3, russia: -2, regional: -4 },
  },
  c: {
    forPolicy: { economy: -6, internalLegitimacy: 3, externalReputation: 3, personalResource: -2 },
    reason: 'Оборудование может задержаться на таможне после разборки старой линии. Пособия и переоборудование оплачены, выпуска нет.',
    resources: { economy: -6, internalLegitimacy: -3, personalResource: -2 },
    stance: { business: -4, regional: -6, liberal: -3, west: -3 },
  },
};

export function executionRisk(state: ExecutionContext, choice: Pick<Choice, 'id' | 'advisor' | 'deal' | 'policyEffect'>): ExecutionRisk | null {
  if (state.country !== ALTERNATE_COUNTRY || state.daily || state.currentEvent?.card !== 'alt_wages'
    || choice.advisor || choice.deal?.pure) return null;
  const risk = WAGES_RISKS[choice.id];
  const policy = choice.policyEffect;
  if (!risk || !policy || Object.keys(policy).length !== Object.keys(risk.forPolicy).length
    || Object.entries(risk.forPolicy).some(([key, value]) => policy[key as keyof ResourceDelta] !== value)) return null;
  return risk;
}
