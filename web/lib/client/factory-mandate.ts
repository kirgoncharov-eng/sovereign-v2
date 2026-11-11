import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { RESOURCE_NAME } from '../content/resource-names.ts';
import type { FactoryMandate } from '../game/factory-mandate.ts';
import type { GameState, ResourceDelta, ResourceKey } from '../game/types.ts';
import { quarterDeadline } from './initiative-note.ts';

const GOAL: Record<FactoryMandate['route'], string> = {
  a: 'Выплатить задолженность рабочим и открыть проверку договоров.',
  b: 'Вернуть завод к работе через аванс под трёхлетний заказ.',
  c: 'Перевести завод на новую продукцию с пособиями и обучением работников.',
};
const OUTCOME: Record<FactoryMandate['route'], [string, string]> = {
  a: ['Зарплата выплачена', 'Помощь удержал банк'],
  b: ['Контракт действует', 'Аванс задержан'],
  c: ['Переход начат', 'Переоборудование остановлено'],
};
const FAILURE: Record<FactoryMandate['route'], string> = {
  a: 'Перечисленные деньги ушли в погашение ссуды. Долг перед рабочими остался.',
  b: 'Покупатель требует дополнительную гарантию; зарплатных денег завод не получил.',
  c: 'Старая линия разобрана, новое оборудование задержано. Расходы на переход уже понесены.',
};
// Единственный последующий исход, где деньги по сорванному авансу действительно пришли (alternate-history.ts, «Приложение к российскому заказу»).
const LATE_ADVANCE = { title: 'Приложение к российскому заказу', choice: 'Отправить делегации копию без закрытой страницы' };
const deltaList = (delta: ResourceDelta) => Object.entries(delta).filter(([, value]) => value)
  .map(([key, value]) => `${RESOURCE_NAME[key as ResourceKey]} ${value! < 0 ? '−' : '+'}${Math.abs(value!)}`).join(', ');

export function factoryMandateBrief(state: GameState) {
  if (state.country !== ALTERNATE_COUNTRY || state.daily) return null;
  const index = state.history.findLastIndex(entry => entry.factoryMandate);
  const mandate = state.history[index]?.factoryMandate;
  if (!mandate) return null;
  // Исходное success не переписываем: первый срыв остаётся датированным исходом, а поздний факт показываем отдельно.
  const lateAdvance = mandate.route === 'b' && !mandate.success && state.history.slice(index + 1).some(entry =>
    entry.title === LATE_ADVANCE.title && entry.choice === LATE_ADVANCE.choice && entry.success === true);
  const prepared = mandate.coordinators.map(person => `${person.name}, ${person.role.toLowerCase()}`).join('; ');
  const active = mandate.followUp && state.pending.some(effect => effect.id === mandate.followUp!.id
    && effect.due === mandate.followUp!.due && effect.label === mandate.followUp!.label);
  const status = mandate.settled ? 'Контрольный расчёт получен'
    : mandate.followUp && !active ? 'Требуется сверка исполнения' : lateAdvance ? 'Аванс получен после задержки' : OUTCOME[mandate.route][mandate.success ? 0 : 1];
  const lines = [
    `Цель: ${GOAL[mandate.route]}`,
    mandate.responsibility,
    `Координация при подписи: ${prepared || 'имена не зафиксированы'}.`,
    `При подписи списано: ${mandate.spent === null ? 'отдельная разбивка недоступна'
      : deltaList(mandate.spent) || 'списаний по самой резолюции нет'}.`,
  ];
  if (mandate.settled && mandate.followUp) {
    lines.push(`Контрольный расчёт «${mandate.followUp.label}»: ${mandate.settled.actual === null
      ? 'отдельная разбивка недоступна; сумма отражена в общей ведомости'
      : deltaList(mandate.settled.actual) || 'опоры не изменились'}.`);
    if (mandate.route === 'b') lines.push('Это расчёт за первый год. Трёхлетний контракт продолжает действовать.');
  } else if (mandate.followUp) {
    lines.push(`Контрольный срок: ${quarterDeadline(state, mandate.followUp.due)}.`);
    lines.push(active ? 'Условие подписи действует до контрольного расчёта.' : 'Нет подтверждения контрольного расчёта; канцелярии нужна сверка.');
  } else if (lateAdvance) {
    lines.push('При подписи аванс задержали: покупатель требовал гарантию. Позднее делегация перечислила аванс; неполный комплект остался в описи.');
  } else if (!mandate.success) {
    lines.push(`Цель не достигнута. ${FAILURE[mandate.route]}`);
  } else if (mandate.route === 'a') {
    lines.push('Разовая выплата закрыта. Проверка договоров продолжается отдельными делами; будущие зарплаты этим решением не оплачены.');
  }
  return { mandate, title: 'Контроль заводской подписи', status, lines };
}

/** Доклад — строка хроники, а не новая остановка или повторная подпись. */
export function factoryQuarterReports(before: GameState, after: GameState) {
  const brief = factoryMandateBrief(after);
  if (!brief) return [];
  const { mandate } = brief;
  const issued = mandate.issued > before.turn && mandate.issued <= after.turn;
  const settled = mandate.settled && mandate.settled.turn > before.turn && mandate.settled.turn <= after.turn;
  if (!issued && !settled) return [];
  if (issued) {
    const accounting = brief.lines.filter(line => line.startsWith('При подписи списано:') || line.startsWith('Контрольный срок:'));
    const details = brief.lines.filter(line => !accounting.includes(line));
    return [{ title: brief.title, text: [accounting.join(' '), ...details].join('\n\n') }];
  }
  return [{ title: `${brief.title} · ${brief.status}`, text: brief.lines.join('\n\n') }];
}
