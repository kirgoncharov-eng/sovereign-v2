import { PROJECTS, governmentProject, type GovernmentProjectId } from '../game/government.ts';
import { housingNextTitle } from '../game/housing-next.ts';
import { livingActions, worldPerson } from '../game/living-world.ts';
import type { GameState, ResourceDelta } from '../game/types.ts';

const RESOURCE_NAMES: Record<string, string> = {
  economy: 'экономика', politicalCapital: 'политкапитал', personalResource: 'личный ресурс',
  internalLegitimacy: 'легитимность', externalReputation: 'внешняя репутация',
};
export const governmentPrice = (cost: ResourceDelta) => Object.entries(cost)
  .map(([resource, value]) => `${RESOURCE_NAMES[resource] ?? resource} ${value! > 0 ? '+' : '−'}${Math.abs(value!)}`)
  .join(' · ') || 'Без списания ресурсов';

const GOALS: Record<GovernmentProjectId, string> = {
  energy: 'Восстановить электроснабжение: вернуть свет в дома и дать заводам работать.',
  health: 'Открыть районные отделения: заполнить врачебные ставки, чтобы лечиться можно было рядом с домом.',
  procurement: 'Проверить государственные закупки и вернуть контроль над расходами казны.',
  exports: 'Открыть экспортный коридор, чтобы предприятия могли продавать товары за рубеж.',
  housing: 'Построить район. Подключение домов к сетям и заселение потребуют отдельного поручения.',
};
const STATUS_NAMES = {
  unassigned: 'Ждёт исполнителя', proposed: 'Предложение', running: 'Исполняется',
  completed: 'Выполнено', partial: 'Частично выполнено', failed: 'Программа провалена',
};

export function governmentBrief(gs: GameState, id: GovernmentProjectId) {
  if (gs.daily || !gs.world?.government) return null;
  const definition = PROJECTS.find(project => project.id === id)!;
  const original = governmentProject(gs.world, id);
  if (!original) return null;
  const next = id === 'housing' ? gs.world.government.housingNext : undefined;
  const project = next ?? original;
  const inherited = id === 'energy' || id === 'health';
  const terminal = ['completed', 'partial', 'failed'].includes(project.status);
  const deadline = 'deadline' in project ? project.deadline : project.due;
  const paid = !['proposed', 'unassigned'].includes(project.status)
    && (!('executor' in project) || !!project.executor);
  const actions = livingActions(gs);
  const starts = actions.filter(action => next
    ? ['government:start:settle', 'government:start:expand'].includes(action.id)
    : id === 'energy' ? action.id.startsWith('appoint:')
      : id === 'health' ? action.id.startsWith('health:appoint:')
        : action.id === `government:start:${id}`);
  const options = [...starts, ...actions.filter(action => [
    `government:priority:${id}`, `government:support:${id}`,
    ...(gs.world!.government!.priority === id ? ['government:release'] : []),
  ].includes(action.id))];
  const executor = 'executor' in project && project.executor ? worldPerson(gs, project.executor) : null;
  const coordinatorId = 'coordinator' in project ? project.coordinator : null;
  const advisor = gs.advisors.find(person => person.id === coordinatorId
    && (!('name' in project) || person.name === project.name))
    ?? (!inherited && !paid ? gs.advisors.find(person => next && person.name === next.previousName)
      ?? gs.advisors.find(person => person.id === definition.advisor) ?? gs.advisors[0] : undefined);
  const coordinatorName = 'name' in project ? project.name : null;
  const price = next?.mode ? next.mode === 'settle' ? { economy: -4, politicalCapital: -2 }
    : { economy: -6, politicalCapital: -3 } : starts[0]?.cost ?? definition.cost;
  const latestReport = [...gs.world.dispatches].reverse().find(report => report.project === id
    && ['news', 'report'].includes(report.kind)
    && (next ? report.id.includes(':housing-next:') : !report.id.includes(':housing-next:')));
  const factors = 'lastFactors' in project ? project.lastFactors : project.factors;
  let timing = deadline === null ? 'Четыре квартала после подписи. До запуска срок не идёт.'
    : terminal ? `Срок программы — конец квартала ${deadline}.`
      : `До конца квартала ${deadline}; осталось ${Math.max(0, deadline - gs.turn)} кв.`;
  if (inherited && !terminal) timing += ' Назначение исполнителя не продлевает срок.';
  let nextStep = terminal ? 'Результат уже учтён. Чтение доклада не списывает ресурсы и не начисляет его повторно.'
    : paid ? 'Работа идёт после главных решений. Новая подпись для очередного доклада не нужна.'
      : inherited ? 'Выберите исполнителя ниже. Без назначения программа провалится к сроку и ударит по экономике и легитимности.'
        : 'Выберите поручение ниже. Запуск необязателен; чтение не тратит ресурсы.';
  if (terminal && id === 'health' && actions.some(action => /^health:(response|bargain):/.test(action.id))) {
    nextStep += ' Продолжение истории больниц ждёт ответа: откройте поручения и доклады.';
  }
  const aftermath = id === 'health' ? gs.world.health?.aftermath : undefined;
  const replyDeadline = aftermath?.bargain?.phase === 'open' ? aftermath.due : aftermath?.deadline;
  const followup = !aftermath ? null
    : aftermath.phase === 'open' || aftermath.bargain?.phase === 'open'
      ? `Нужен ответ до конца квартала ${replyDeadline}; осталось ${Math.max(0, replyDeadline! - gs.turn)} кв.`
      : aftermath.phase === 'working' ? `Подписанный ответ исполняется. Доклад — в квартале ${aftermath.due}.`
        : aftermath.phase === 'scheduled' ? `Следующее обращение — в квартале ${aftermath.due}.` : null;
  return {
    id, title: next ? next.status === 'proposed' ? 'Район после стройки' : housingNextTitle(next) : definition.title,
    status: project.status, statusLabel: STATUS_NAMES[project.status], progress: project.progress,
    goal: next ? next.mode === 'expand' ? 'Построить следующий район; сети и заселение первого остаются отдельным делом.'
      : 'Довести построенный район до жизни: завершить дома, подключить сети и подготовить заселение.' : GOALS[id],
    paid, price: next?.status === 'proposed' ? null : governmentPrice(price), timing, deadline,
    executor: executor ? `${executor.name} · ${executor.role}` : coordinatorName ?? (advisor ? `${advisor.name} · ${advisor.role}` : null),
    executorLabel: paid || terminal ? 'Исполнитель' : inherited ? 'Исполнитель не назначен' : 'Кому поручите',
    interest: executor?.goal ?? advisor?.bio ?? null,
    competence: executor?.competence ?? advisor?.skill ?? null,
    report: latestReport?.text ?? (factors.length ? factors.join('. ') : null),
    previousReport: next ? [...gs.world.dispatches].reverse().find(report => report.project === 'housing'
      && report.kind === 'news' && !report.id.includes(':housing-next:'))?.text ?? null : null,
    nextStep, options, terminal, followup,
    benefit: next ? next.mode === 'expand' ? 'При полном исполнении: экономика +7, легитимность +2.'
      : next.mode === 'settle' ? 'При полном исполнении: экономика +2, легитимность +5.'
        : 'Первый строительный результат сохраняется. Цель и результат каждого нового поручения описаны в вариантах ниже.'
      : id === 'health' && gs.world.health?.approach === 'rotation'
        ? 'При полном исполнении: легитимность +3. Временный перевод врачей потребует решения для областных больниц.'
        : definition.benefit,
    politics: definition.politics,
    risk: next ? 'Слабая экономика, конфликт с регионами и занятость координатора тормозят новое поручение.' : definition.risk,
  };
}

export function governmentBriefs(gs: GameState) {
  return PROJECTS.map(project => governmentBrief(gs, project.id)).filter(brief => brief !== null);
}
