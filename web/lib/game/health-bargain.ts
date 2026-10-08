// Один конфликт полномочий внутри поручения о совместном графике врачей.
import type { ResourceDelta } from './types.ts';
import type { LivingWorld, WorldAction, WorldPerson } from './living-world.ts';

export type HealthBargainChoice = 'minister' | 'doctor' | 'joint';
export interface HealthBargain {
  phase: 'waiting' | 'open' | 'answered' | 'ignored';
  choice: HealthBargainChoice | null;
  ministerCondition: string;
  doctorCondition: string;
  reviewDue: number | null;
}
export const BARGAIN_PLANS: Record<HealthBargainChoice, { title: string; detail: string; cost: ResourceDelta }> = {
  minister: { title: 'Передать координацию министру', detail: 'Министр получает контроль над назначениями и становится исполнителем. Его отношение +12, врача −10. Полномочия помогают согласовать график, но министр укрепит собственную сеть: ещё −2 политкапитала через два квартала после итогового доклада.', cost: { politicalCapital: -1 } },
  doctor: { title: 'Защитить независимый мандат врача', detail: 'Главный врач остаётся исполнителем и получает право утверждать выездные дни. Его отношение +8, министра −12. Мандат помогает исполнению, но враждебное ведомство всё ещё может задержать согласования.', cost: { politicalCapital: -3 } },
  joint: { title: 'Связать обоих публичным соглашением', detail: 'Главный врач остаётся исполнителем; назначения согласуются совместно. Обоим отношение +3. Комиссия требует бюджета; при враждебных отношениях или слабой экономике совместная процедура затянется.', cost: { economy: -2, politicalCapital: -2 } },
};
export function newHealthBargain(people: WorldPerson[]): HealthBargain | undefined {
  const minister = people.find(p => p.id === 'healthMinister')!;
  if (minister.trait !== 'careerist' && minister.relation > -20) return undefined;
  return { phase: 'waiting', choice: null,
    ministerCondition: `${minister.name}: «График пройдёт через ведомство, только если назначения и координация останутся у меня». Министерство добивается контроля над кадрами, а не нового бюджета.`,
    doctorCondition: `${people.find(p => p.id === 'doctor')!.name}: «Я отвечу за приёмы, если ведомство не сможет отменять согласованные выездные дни». Главному врачу нужен защищённый мандат.`,
    reviewDue: null };
}
export function bargainActions(world: LivingWorld): Omit<WorldAction, 'blocked'>[] {
  if (world.health?.aftermath?.bargain?.phase !== 'open') return [];
  return (Object.keys(BARGAIN_PLANS) as HealthBargainChoice[]).map(choice => {
    const plan = BARGAIN_PLANS[choice];
    const actor = world.people.find(person => person.id === (choice === 'minister' ? 'healthMinister' : 'doctor'))!;
    return {
      id: `health:bargain:${choice}`,
      title: plan.title,
      detail: `${plan.detail} Исполнитель: ${actor.name}; компетенция ${actor.competence}/3. Полномочия помогают, но не заменяют компетенцию.`,
      cost: plan.cost,
    };
  });
}
export function decideHealthBargain(world: LivingWorld, choice: HealthBargainChoice): string {
  const story = world.health!.aftermath!;
  const bargain = story.bargain!;
  bargain.phase = 'answered';
  bargain.choice = choice;
  const shifts = choice === 'minister' ? { healthMinister: 12, doctor: -10 }
    : choice === 'doctor' ? { healthMinister: -12, doctor: 8 }
      : { healthMinister: 3, doctor: 3 };
  for (const person of world.people) {
    if (person.id === 'healthMinister' || person.id === 'doctor') {
      person.relation = Math.max(-100, Math.min(100, person.relation + shifts[person.id]));
    }
  }
  if (choice === 'minister') {
    story.executor = 'healthMinister';
    bargain.reviewDue = story.due + 2;
  }
  return `Вы подписали: «${BARGAIN_PLANS[choice].title}». ${BARGAIN_PLANS[choice].detail} Итоговый доклад придёт в прежний срок. Полномочия изменились; сами врачи ещё не вышли на новый график.`;
}
export function bargainFactors(bargain: HealthBargain | undefined, people: WorldPerson[], economy: number): { score: number; factors: string[] } {
  if (!bargain) return { score: 0, factors: [] };
  if (bargain.phase !== 'answered') return { score: -2, factors: ['Спор о полномочиях остался без ответа: министерство удержало согласование графика'] };
  if (bargain.choice === 'minister') return { score: 1, factors: ['Министр получил контроль над назначениями и проводит согласования через своё ведомство'] };
  if (bargain.choice === 'doctor') return { score: 1, factors: ['Независимый мандат защищает выездные дни от ведомственной отмены'] };
  const cooperates = people.filter(p => p.id === 'doctor' || p.id === 'healthMinister').every(p => p.relation > -20);
  return economy >= 25 && cooperates
    ? { score: 1, factors: ['Публичное соглашение связало обе стороны общим графиком'] }
    : { score: -1, factors: [economy < 25 ? 'Слабая экономика задержала работу совместной комиссии' : 'Враждебные отношения превратили совместную комиссию в спор о каждой подписи'] };
}
export function validHealthBargain(raw: unknown): raw is HealthBargain {
  if (!raw || typeof raw !== 'object') return false;
  const b = raw as HealthBargain;
  return ['waiting', 'open', 'answered', 'ignored'].includes(b.phase)
    && typeof b.ministerCondition === 'string' && !!b.ministerCondition && typeof b.doctorCondition === 'string' && !!b.doctorCondition
    && (b.reviewDue === null || Number.isInteger(b.reviewDue) && b.reviewDue >= 0)
    && (b.phase === 'answered' ? ['minister', 'doctor', 'joint'].includes(b.choice!) : b.choice === null)
    && (b.reviewDue === null || b.phase === 'answered' && b.choice === 'minister');
}
