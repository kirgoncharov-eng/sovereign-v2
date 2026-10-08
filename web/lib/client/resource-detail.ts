import { CRISIS_THRESHOLD, LIMITS, RECOVERY_BELOW, RECOVERY_RATE } from '../game/data.ts';
import { computePolls } from '../game/engine.ts';
import { PACT_INCOME, pactIncome } from '../game/people.ts';
import { lawDef } from '../game/laws.ts';
import type { GameState, ResourceKey } from '../game/types.ts';

export const RESOURCE_ABOUT: Record<ResourceKey, string> = {
  politicalCapital: 'Влияние в парламенте и аппарате. Помогает проводить решения, договариваться и удерживать поддержку элит.',
  economy: 'Общий запас прочности экономики: бюджет, производство, цены и зарплаты. Это шкала состояния страны, а не сумма денег. Финансирование проектов уменьшает этот общий запас.',
  military: 'Сила армии и спецслужб. Их отношение к вам учитывается отдельно: сильные, но враждебные силовики могут устроить переворот.',
  externalReputation: 'Доверие за границей. Влияет на положение страны в отношениях с внешними партнёрами: кредиты, санкции и союзники.',
  internalLegitimacy: 'Признаёт ли общество ваше право управлять страной. Рейтинг показывает готовность голосовать за вас, легитимность — признание самой власти. Высокий рейтинг при низкой легитимности возможен: союзные группы поддерживают вас, но доверие к власти ослабло.',
  personalResource: 'Ваш запас сил, здоровья, личных денег и связей. Личные поездки и вмешательство его расходуют; это отдельная опора власти.',
};
export const RATING_ABOUT = 'Доля избирателей, готовых голосовать за вашу партию. Она зависит от поддержки групп общества, легитимности и экономики. Внешние силы не голосуют. Рейтинг и легитимность связаны, но могут различаться: поддержка союзных групп и сильная экономика могут удерживать рейтинг при слабом признании власти.';
export const RESOURCE_LIMITS = `Переход ниже ${CRISIS_THRESHOLD} может вызвать кризис. На ${LIMITS.endResource} и ниже — падение власти. Ниже ${RECOVERY_BELOW} институты возвращают +${RECOVERY_RATE} за квартал, но другие потери могут перевесить восстановление.`;

export function resourceDetail(gs: GameState, key: ResourceKey) {
  const changes = (gs.lastTurn?.sources?.[key] ?? []).filter(([, delta]) => delta !== 0);
  const upcoming: { delta: number; text: string }[] = [];
  for (const pending of gs.pending ?? []) if (pending.res[key]) upcoming.push({ delta: pending.res[key]!, text: `После ${Math.max(1, pending.due - gs.turn)} кв.: ${pending.label}` });
  for (const crisis of gs.activeCrises ?? []) if (crisis.resourceDrain[key]) upcoming.push({ delta: crisis.resourceDrain[key]!, text: `Каждый квартал: кризис «${crisis.title}»` });
  for (const pact of gs.pacts ?? []) {
    const faction = gs.factions.find(f => f.id === pact.faction);
    if (faction && PACT_INCOME[faction.bloc] === key) upcoming.push({ delta: pactIncome(pact), text: `Пока действует договор с «${faction.name}»` });
  }
  for (const law of gs.laws ?? []) {
    const def = lawDef(law.id);
    if (def?.perTurn[key]) upcoming.push({ delta: def.perTurn[key]!, text: `Каждый квартал: закон «${def.title}»` });
  }
  const health = gs.world?.health;
  const continuation = health?.aftermath;
  if (key === 'politicalCapital' && continuation?.bargain?.reviewDue != null) upcoming.push({ delta: -2, text: `После ${Math.max(1, continuation.bargain.reviewDue - gs.turn)} кв.: контроль над назначениями укрепит сеть министра` });
  if (continuation?.phase === 'open') {
    const costs = continuation.branch === 'permanent' ? { economy: 1, internalLegitimacy: -4 } : continuation.branch === 'rotation' ? { economy: -2, internalLegitimacy: -3 } : { internalLegitimacy: -4, politicalCapital: -2 };
    const delta = (costs as Partial<Record<ResourceKey, number>>)[key];
    if (delta) upcoming.push({ delta, text: `Если не ответить на доклад по больницам за ${Math.max(1, continuation.deadline - gs.turn)} кв.` });
  }
  if (!continuation && health?.followupTurn !== null && health?.followupTurn !== undefined) {
    const delta = key === 'economy' ? health.approach === 'rotation' ? -2 : -1 : key === 'internalLegitimacy' && health.approach === 'rotation' ? -2 : 0;
    if (delta) upcoming.push({ delta, text: `После ${Math.max(1, health.followupTurn - gs.turn)} кв.: ${health.approach === 'rotation' ? 'замена врачей в областных больницах' : 'содержание постоянных ставок в районах'}` });
  }
  return { value: gs.resources[key], changes, upcoming, delta: gs.prevResources ? gs.resources[key] - gs.prevResources[key] : null };
}

export function ratingDetail(gs: GameState) {
  const polls = computePolls(gs.country, gs.factions, gs.resources);
  const previous = gs.prevFactions && gs.prevResources ? computePolls(gs.country, gs.prevFactions, gs.prevResources).leader : null;
  return { value: polls.leader, delta: previous === null ? null : polls.leader - previous };
}
