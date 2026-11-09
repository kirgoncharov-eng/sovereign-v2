// #337: авторский срыв первого заводского дела. Цифры описывают существующую сцену, а не общий штраф за неудачу.
// Нет нового состояния: профиль выбирается по уже сохранённым кампании, карточке и варианту решения.
// Тот же механизм даёт авторский срыв делам без собственного профиля исполнения (alt_standards, #365).
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { Bloc, Choice, GameState, ResourceDelta } from './types.ts';

export type ExecutionContext = Partial<Pick<GameState, 'country' | 'currentEvent' | 'daily'>>;

export interface ExecutionProfile {
  coordinators: readonly string[];
  blocs: readonly Bloc[];
  responsibility: string;
}

interface ExecutionRisk {
  forPolicy: ResourceDelta; // профиль действует только для исходной редакции варианта, не для переделанного предложения
  legacyPolicy?: ResourceDelta; // #403: прежняя редакция — дело, начатое до удешевления, сохраняет авторский срыв
  reason: string;
  resources: ResourceDelta; // как policyEffect: до общего веса цены и качества советника
  stance: Partial<Record<Bloc, number>>;
  execution: ExecutionProfile;
  keepsOpposedPenalty?: true; // решение против курса стоит президенту и при срыве: срыв не должен быть дешевле исполнения
}

// Авторский срыв без отдельного профиля исполнения: шанс, координаторы и прогноз причины остаются общими.
type AuthoredFailure = Omit<ExecutionRisk, 'execution' | 'reason'>;
type CardRisks = Readonly<Record<string, ExecutionRisk | AuthoredFailure>>;

const WAGES_RISKS: Readonly<Record<string, ExecutionRisk>> = {
  a: {
    forPolicy: { economy: -3, internalLegitimacy: 6, politicalCapital: 2, personalResource: -1 },
    legacyPolicy: { economy: -7, internalLegitimacy: 6, politicalCapital: 2, personalResource: -1 },
    reason: 'Банк может списать помощь в счёт старой ссуды раньше выплаты зарплаты. Казна потратит деньги, рабочие их не получат.',
    resources: { economy: -3, internalLegitimacy: -3, politicalCapital: -2, personalResource: -1 },
    stance: { business: -4, liberal: -3, regional: -6 },
    execution: {
      coordinators: ['economist'], blocs: ['business'],
      responsibility: 'Казначейство, банк и дирекция проводят выплату; координация — у экономического советника.',
    },
  },
  b: {
    forPolicy: { economy: 2, internalLegitimacy: 2, personalResource: -2 },
    reason: 'Покупатель может задержать аванс, потребовав дополнительную гарантию. Завод уже откажется от другого заказа и останется без денег.',
    resources: { economy: -2, internalLegitimacy: -3, politicalCapital: -1, personalResource: -2 },
    stance: { business: -3, russia: -2, regional: -4 },
    keepsOpposedPenalty: true,
    execution: {
      coordinators: ['economist', 'diplomat'], blocs: ['business', 'russia'],
      responsibility: 'Дирекция и Российская делегация согласуют аванс; координация — у экономического и внешнеполитического советников.',
    },
  },
  c: {
    forPolicy: { economy: -3, internalLegitimacy: 3, externalReputation: 3, personalResource: -2 },
    legacyPolicy: { economy: -6, internalLegitimacy: 3, externalReputation: 3, personalResource: -2 },
    reason: 'Оборудование может задержаться на таможне после разборки старой линии. Пособия и переоборудование оплачены, выпуска нет.',
    resources: { economy: -3, internalLegitimacy: -3, personalResource: -2 },
    stance: { business: -4, regional: -6, liberal: -3, west: -3 },
    keepsOpposedPenalty: true,
    execution: {
      coordinators: ['economist', 'diplomat'], blocs: ['business', 'west'],
      responsibility: 'Дирекция и Торговый союз согласуют оборудование; координация — у экономического и внешнеполитического советников.',
    },
  },
};

// #365: базовое «Чужой рынок, другие станки». Общий срыв оставлял пользу исполнения: репутацию после провала
// испытаний и выручку станков, работающих на склад. Срыв описывает сцену `fail` варианта; конкурс заводов не трогаем.
const STANDARDS_FAILURES: CardRisks = {
  // «Образцы не прошли испытания. Деньги потрачены…»: казна заплатила, Торговый союз увидел брак, спор проигран.
  a: {
    forPolicy: { economy: -2, externalReputation: 3, politicalCapital: -1 },
    legacyPolicy: { economy: -5, externalReputation: 3, politicalCapital: -1 },
    resources: { economy: -2, externalReputation: -1, politicalCapital: -2 },
    stance: { west: 2, business: -3, russia: -4 },
    keepsOpposedPenalty: true,
  },
  // «Покупатель сократил заказ… Старые станки работают на склад»: выручки нет, зависимость и закрытый Запад остаются.
  b: {
    forPolicy: { economy: 2, externalReputation: -3 },
    resources: { economy: -3, externalReputation: -3, politicalCapital: -1 },
    stance: { russia: 2, nationalist: 3, business: -4, west: -6 },
    keepsOpposedPenalty: true,
  },
};

const CARD_RISKS: Readonly<Record<string, CardRisks>> = { alt_wages: WAGES_RISKS, alt_standards: STANDARDS_FAILURES };

type ExecutionChoice = Pick<Choice, 'id' | 'advisor' | 'deal' | 'policyEffect'>;

function originalRisk(state: ExecutionContext, choice: ExecutionChoice): ExecutionRisk | AuthoredFailure | null {
  const card = state.currentEvent?.card;
  if (state.country !== ALTERNATE_COUNTRY || state.daily || !card || !Object.hasOwn(CARD_RISKS, card)
    || choice.advisor || choice.deal?.pure) return null;
  const risks = CARD_RISKS[card];
  const risk = Object.hasOwn(risks, choice.id) ? risks[choice.id] : undefined;
  const policy = choice.policyEffect;
  const same = (edition: ResourceDelta | undefined) => !!edition && !!policy && Object.keys(policy).length === Object.keys(edition).length
    && Object.entries(edition).every(([key, value]) => policy[key as keyof ResourceDelta] === value);
  return risk && (same(risk.forPolicy) || same(risk.legacyPolicy)) ? risk : null;
}

const hasExecution = (risk: ExecutionRisk | AuthoredFailure | null): risk is ExecutionRisk => !!risk && 'execution' in risk;

// Профиль исходной подписи восстанавливается и для старых сохранений. Другие дела и Daily идут прежним путём.
export const executionProfile = (state: ExecutionContext, choice: ExecutionChoice): ExecutionProfile | null => {
  const risk = originalRisk(state, choice);
  return hasExecution(risk) ? risk.execution : null;
};

// Причина показывается в прогнозе только там, где у дела есть свой профиль исполнения.
export function executionRisk(state: ExecutionContext, choice: ExecutionChoice): (AuthoredFailure & { reason?: string }) | null {
  const risk = originalRisk(state, choice);
  if (!risk) return null;
  return hasExecution(risk) ? { ...risk, reason: `${risk.execution.responsibility} ${risk.reason}` } : risk;
}

