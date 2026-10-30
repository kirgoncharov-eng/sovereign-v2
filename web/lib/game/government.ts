import {
  housingNextActions,
  housingNextReview,
  offerHousingNext,
  startHousingNext,
  stepHousingNext,
  validHousingNext,
  type HousingNext,
} from './housing-next.ts';
import { mandateHousing } from './minister-mandate.ts';
import type { GameEvent, GameState, ResourceDelta, Choice } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { programReport } from '../content/quarter-letters.ts';

export type GovernmentProjectId = 'energy' | 'health' | 'procurement' | 'exports' | 'housing';
export type ProgramId = Exclude<GovernmentProjectId, 'energy' | 'health'>;
export interface GovernmentProgram {
  id: ProgramId;
  status: 'proposed' | 'running' | 'completed' | 'partial' | 'failed';
  progress: number;
  started: number | null;
  due: number | null;
  coordinator: string | null;
  name: string | null;
  lastFactors: string[];
  reviewed: boolean; // Итог опубликован; чтение сообщения хранится отдельно в inboxRead.
  supported: boolean;
}
export interface GovernmentState {
  programs: GovernmentProgram[];
  priority: GovernmentProjectId | null;
  housingNext?: HousingNext;
}
export const PROJECTS = [
  {
    id: 'energy',
    title: 'Восстановление энергосети',
    benefit: 'Надёжный свет, работа заводов; результат зависит от приоритета подключения.',
    risk: 'Несовместимое оборудование, местные подрядчики и зависимость от спонсора.',
    politics: 'Показать способность восстановить регион; успех или провал станет вашим.',
    advisor: 'economist',
    cost: { economy: -4, politicalCapital: -2 },
  },
  {
    id: 'health',
    title: 'Районные больницы',
    benefit:
      'Укомплектовать отделения; постоянный набор даёт легитимность +5 и экономику +1 при полном результате.',
    risk: 'Согласование ставок, кадровый дефицит; временный перевод ослабляет областные центры.',
    politics: 'Закрепить поддержку провинции; отвечать за доступность лечения.',
    advisor: 'economist',
    cost: { economy: -4, politicalCapital: -2 },
  },
  {
    id: 'procurement',
    title: 'Проверка государственных закупок',
    benefit: 'При полном исполнении: экономика +3, легитимность +4.',
    risk: 'Аппарат и связанные с закупками группы сопротивляются. Их отношение ухудшится уже при запуске.',
    politics: 'Провести курс на прозрачность, вступив в конфликт с частью коалиции.',
    advisor: 'security',
    cost: { economy: -3, politicalCapital: -3 },
  },
  {
    id: 'exports',
    title: 'Экспортный коридор',
    benefit: 'При полном исполнении: экономика +6, внешняя репутация +3.',
    risk: 'Без международного доверия и поддержки бизнеса согласования затянутся; частичный результат не вернёт весь бюджет.',
    politics: 'Создать опору среди экспортёров и показать внешнеполитический результат.',
    advisor: 'diplomat',
    cost: { economy: -5, politicalCapital: -2 },
  },
  {
    id: 'housing',
    title: 'Жилищная программа',
    benefit: 'При полном исполнении: экономика +2, легитимность +6.',
    risk: 'Дорогой старт; слабая экономика и конфликт с региональными властями тормозят стройку.',
    politics: 'Получить видимый общественный результат; незавершённые дома станут вашим обещанием.',
    advisor: 'economist',
    cost: { economy: -6, politicalCapital: -2 },
  },
] as const;
export const projectDef = (id: GovernmentProjectId) => PROJECTS.find((program) => program.id === id)!;
export function ensureGovernment(state: GameState): GameState {
  if (!state.world || state.daily || state.ended || state.world.government) return state;
  const government: GovernmentState = {
    priority: null,
    programs: ['procurement', 'exports', 'housing'].map((id) => ({
      id: id as ProgramId,
      status: 'proposed',
      progress: 0,
      started: null,
      due: null,
      coordinator: null,
      name: null,
      lastFactors: [],
      reviewed: false,
      supported: false,
    })),
  };
  return { ...state, world: { ...state.world, government } };
}
export const cloneGovernment = (government: GovernmentState): GovernmentState => ({
  ...government,
  ...(government.housingNext
    ? { housingNext: { ...government.housingNext, factors: [...government.housingNext.factors] } }
    : {}),
  programs: government.programs.map((program) => ({ ...program, lastFactors: [...program.lastFactors] })),
});

// Старые результаты уже начислены. Переносим только публикацию и доступ к продолжению.
export function publishSavedGovernmentReports(state: GameState): GameState {
  const government = state.world?.government;
  if (!government || state.daily || state.ended) return state;
  const pendingReport =
    state.currentEvent?.card?.startsWith('government-review:') ||
    state.currentEvent?.card === 'housing-next:review';
  const unpublished =
    government.programs.some(
      (program) => ['completed', 'partial', 'failed'].includes(program.status) && !program.reviewed
    ) ||
    (government.housingNext &&
      ['completed', 'partial', 'failed'].includes(government.housingNext.status) &&
      !government.housingNext.reviewed);
  const housing = government.programs.find((program) => program.id === 'housing')!;
  const needsProposal = !government.housingNext && ['completed', 'partial'].includes(housing.status);
  if (!pendingReport && !unpublished && !needsProposal) return state;
  const world = {
    ...state.world!,
    government: cloneGovernment(government),
    dispatches: [...state.world!.dispatches],
  };
  for (const program of world.government.programs) {
    if (!['completed', 'partial', 'failed'].includes(program.status)) continue;
    program.reviewed = true;
    if (
      !world.dispatches.some(
        (dispatch) =>
          dispatch.project === program.id &&
          dispatch.kind === 'news' &&
          !dispatch.id.includes(':housing-next:')
      )
    ) {
      world.dispatches.push({
        project: program.id,
        id: `${state.turn}:government:${program.id}:published`,
        turn: state.turn,
        kind: 'news',
        title: projectDef(program.id).title,
        text:
          `${program.name}: «${projectDef(program.id).title}» — ${program.progress}%. ` +
          `${program.lastFactors.join('. ')}. Результат и расходы уже учтены. Доклад опубликован; ` +
          'отдельная резолюция не требуется.',
      });
    }
  }
  const next = world.government.housingNext;
  if (next && ['completed', 'partial', 'failed'].includes(next.status)) next.reviewed = true;
  offerHousingNext(world, state.turn, state.country === ALTERNATE_COUNTRY);
  world.dispatches = world.dispatches.slice(-24);
  return { ...state, world, ...(pendingReport ? { currentEvent: null } : {}) };
}
export function governmentProject(world: LivingWorld, id: GovernmentProjectId) {
  return id === 'energy'
    ? world.project
    : id === 'health'
      ? world.health!
      : world.government!.programs.find((program) => program.id === id)!;
}
export function governmentLoad(world: LivingWorld): number {
  return [
    world.project,
    ...(world.health ? [world.health] : []),
    ...(world.government?.programs ?? []),
    ...(world.government?.housingNext ? [world.government.housingNext] : []),
  ].filter((program) => program.status === 'running').length;
}
export function governmentActions(state: GameState): Omit<WorldAction, 'blocked'>[] {
  const world = state.world;
  if (!world?.government) return [];
  const actions: Omit<WorldAction, 'blocked'>[] = [];
  for (const definition of PROJECTS) {
    const program = governmentProject(world, definition.id);
    if (!program) continue;
    if (program.status === 'proposed')
      actions.push({
        id: `government:start:${definition.id}`,
        title: `Делегировать: ${definition.title}`,
        cost: { ...definition.cost },
        detail:
          'Кабинет получает бюджет на четыре квартала. Исполнение идёт между решениями; личное ' +
          'вмешательство нужно для запуска, а не для каждого доклада.',
      });
    if (program.status === 'running' && 'supported' in program && !program.supported) {
      const help =
        definition.id === 'procurement'
          ? {
              title: 'Дать проверяющим прямой доступ к документам',
              detail:
                'Мандат резиденции уберёт задержку документов со стороны аппарата. Саму проверку продолжает кабинет.',
              cost: { politicalCapital: -2, personalResource: -1 },
            }
          : definition.id === 'exports'
            ? {
                title: 'Согласовать гарантии и доступ к экспортному коридору',
                detail:
                  'Переговоры снимут текущую задержку внешних согласований и сопротивление бизнеса именно по этой программе.',
                cost: { politicalCapital: -3, personalResource: -2 },
              }
            : {
                title: 'Обеспечить строительный резерв и доступ к участкам',
                detail:
                  'Дополнительные бригады дают +6 пунктов работы в квартал; согласование снимает задержку ' +
                  'выделения участков. Другие программы не получают этот резерв.',
                cost: { economy: -3, politicalCapital: -1 },
              };
      actions.push({ id: `government:support:${definition.id}`, ...help });
    }
    if (program.status === 'running' && world.government.priority !== definition.id)
      actions.push({
        id: `government:priority:${definition.id}`,
        title: `Объявить личным приоритетом: ${definition.title}`,
        cost: {
          politicalCapital: -2,
          personalResource: -2,
          ...(world.government.priority ? { internalLegitimacy: -2 } : {}),
        },
        detail:
          'Один личный приоритет. Работы получают +5 пунктов в квартал, пока личный ресурс выше 4; ' +
          'контроль стоит личного ресурса −1 за квартал. Полный успех: легитимность +3; неполный ' +
          'результат: −4. Запуск и деньги на проект оплачиваются отдельно.',
      });
  }
  if (world.government.priority)
    actions.push({
      id: 'government:release',
      title: 'Вернуть личный приоритет под обычный контроль кабинета',
      cost: { politicalCapital: -2, internalLegitimacy: -2 },
      detail:
        'Проект продолжит работу без ускорения и затрат вашего времени. Отказ от публичного приоритета ' +
        'стоит легитимности −2; подпись и уже понесённые расходы остаются в истории.',
    });
  return [...actions, ...housingNextActions(state)];
}
export function governmentDecision(
  state: GameState,
  world: LivingWorld,
  id: string
): { text: string; factions: Record<string, number> } {
  const government = world.government!;
  const [, act, projectId] = id.split(':');
  if (act === 'start' && ['settle', 'expand'].includes(projectId))
    return { text: startHousingNext(state, world, projectId as 'settle' | 'expand'), factions: {} };
  if (act === 'release') {
    const title = projectDef(government.priority!).title;
    government.priority = null;
    return {
      text:
        `Вы возвращаете «${title}» под обычный контроль кабинета. ` +
        'Подписанное поручение не отменено, бюджет не возвращается. ' +
        'Публичное отступление: легитимность −2.',
      factions: {},
    };
  }
  const target = projectId as GovernmentProjectId,
    definition = projectDef(target);
  if (act === 'priority') {
    const previous = government.priority;
    government.priority = target;
    return {
      text:
        `Вы объявляете «${definition.title}» своим политическим приоритетом. ` +
        `${
          previous
            ? `Предыдущий приоритет «${projectDef(previous).title}» переходит под обычный контроль; ` +
              'публичная смена курса стоит легитимности −2. '
            : ''
        }` +
        'Бригады и аппарат получают прямой доступ в резиденцию; результат не наступает сразу. Контроль ' +
        'расходует личный ресурс, а финал будет отнесён к вашему обещанию.',
      factions: {},
    };
  }
  const program = government.programs.find((program) => program.id === target)!;
  if (act === 'support') {
    program.supported = true;
    const detail =
      target === 'procurement'
        ? 'Вы даёте проверяющим прямой доступ к документам. Связанные с закупками группы больше не могут ' +
          'задерживать эту программу удержанием бумаг; политическое несогласие остаётся.'
        : target === 'exports'
          ? 'Вы согласуете гарантии доступа к коридору. Текущая задержка внешних согласований и блокирование ' +
            'бизнесом сняты именно по этому договору; общий рейтинг страны за рубежом не становится высоким ' +
            'автоматически.'
          : 'Вы обеспечиваете дополнительный строительный резерв и согласуете доступ к участкам. Бригады ' +
            'получают +6 пунктов работы за квартал; задержка участков снята. Эти деньги уже нельзя направить ' +
            'в другую программу.';
    return { text: detail, factions: {} };
  }
  const advisor = state.advisors.find((advisor) => advisor.id === definition.advisor) ?? state.advisors[0];
  program.status = 'running';
  program.started = state.turn;
  program.due = state.turn + 4;
  program.coordinator = advisor.id;
  program.name = advisor.name;
  program.lastFactors = ['Поручение подписано; первый доклад после решения в кабинете'];
  const factions =
    target === 'procurement'
      ? Object.fromEntries(
          state.factions
            .filter((faction) => ['business', 'ruling'].includes(faction.bloc))
            .map((faction) => [faction.id, -5])
        )
      : {};
  return {
    text:
      `${advisor.name} координирует исполнение «${definition.title}» через совет министров. ` +
      `Финансирование утверждено на четыре квартала; срок — конец квартала ${program.due}. ` +
      `${definition.risk} ` +
      `${target === 'procurement' ? 'Группы бизнеса и правящей коалиции: отношение −5.' : ''}` +
      ' Дальнейшее исполнение не требует повторять подпись каждый квартал.',
    factions,
  };
}
export function priorityWork(state: GameState, world: LivingWorld, id: GovernmentProjectId): number {
  return world.government?.priority === id && state.resources.personalResource > 4 ? 5 : 0;
}
export function stepGovernment(
  state: GameState,
  world: LivingWorld,
  turn: number,
  review?: Choice['projectReview']
): { story: string | null; effects: { label: string; res: ResourceDelta }[] } {
  if (!world.government) return { story: null, effects: [] };
  const government = cloneGovernment(world.government);
  world.government = government;
  if (review) {
    const program = government.programs.find((program) => program.id === review.id);
    if (program && ['completed', 'partial', 'failed'].includes(program.status)) program.reviewed = true;
  }
  const stories: string[] = [],
    effects: { label: string; res: ResourceDelta }[] = [];
  for (const program of government.programs) {
    if (program.status !== 'running') continue;
    const definition = projectDef(program.id),
      advisor = state.advisors.find(
        (advisor) => advisor.id === program.coordinator && advisor.name === program.name
      );
    let gain = advisor ? 12 + advisor.skill * 5 : 0;
    const factors = [
      advisor
        ? `Координатор ${advisor.name}: качество работы ${advisor.skill}/3`
        : 'Прежний координатор ушёл; согласования остановились',
    ];
    if (advisor && state.resources.economy < 25) {
      gain -= 6;
      factors.push('Слабая экономика тормозит исполнение');
    }
    if (
      advisor &&
      (government.programs.some(
        (other) =>
          other.id !== program.id && other.status === 'running' && other.coordinator === program.coordinator
      ) ||
        (government.housingNext?.status === 'running' &&
          government.housingNext.coordinator === program.coordinator))
    ) {
      gain -= 5;
      factors.push('Координатор делит время между программами');
    }
    if (
      advisor &&
      !program.supported &&
      program.id === 'procurement' &&
      state.factions.some((faction) => ['business', 'ruling'].includes(faction.bloc) && faction.relation < 10)
    ) {
      gain -= 5;
      factors.push('Связанные с закупками группы затягивают передачу документов');
    }
    if (
      advisor &&
      !program.supported &&
      program.id === 'exports' &&
      state.resources.externalReputation < 40
    ) {
      gain -= 6;
      factors.push('Низкое внешнее доверие затягивает согласования');
    }
    if (
      advisor &&
      !program.supported &&
      program.id === 'exports' &&
      state.factions.some((faction) => faction.bloc === 'business' && faction.relation < 0)
    ) {
      gain -= 5;
      factors.push('Бизнес не поддерживает совместную работу');
    }
    if (
      advisor &&
      !program.supported &&
      program.id === 'housing' &&
      state.factions.some((faction) => faction.bloc === 'regional' && faction.relation < 0)
    ) {
      gain -= 5;
      factors.push('Регионы затягивают выделение участков');
    }
    if (advisor && program.supported) {
      if (program.id === 'housing') gain += 6;
      factors.push(
        program.id === 'housing'
          ? 'Строительный резерв и согласованные участки: +6'
          : 'Президентское поручение сняло препятствие этой программы'
      );
    }
    if (advisor && mandateHousing(world)) {
      if (program.id === 'housing') {
        gain += 5;
        factors.push(`Подрядчики ${world.mandate!.name}: +5 работы, экономика −1`);
        effects.push({ label: `закупочный мандат ${world.mandate!.name}`, res: { economy: -1 } });
      }
      if (program.id === 'procurement' && !program.supported) {
        gain -= 5;
        factors.push(`Министр ${world.mandate!.name} удерживает строительные документы: −5`);
      }
    }
    if (
      advisor &&
      program.id === 'housing' &&
      world.mandate?.phase === 'withdrawn' &&
      world.mandate.handover &&
      world.mandate.changed === turn - 1
    ) {
      gain -= 5;
      factors.push('Передача закупок после отзыва мандата: −5 на один квартал');
    }
    const boost = advisor ? priorityWork(state, world, program.id) : 0;
    if (boost) {
      gain += boost;
      factors.push('Личный приоритет президента ускоряет согласования: +5');
    }
    program.progress = Math.min(100, program.progress + Math.max(0, gain));
    program.lastFactors = factors;
    const terminal = program.progress === 100 || turn >= program.due!;
    if (terminal) {
      program.status = program.progress === 100 ? 'completed' : program.progress >= 60 ? 'partial' : 'failed';
      program.reviewed = true;
      const res: ResourceDelta =
        program.status === 'completed'
          ? program.id === 'procurement'
            ? { economy: 3, internalLegitimacy: 4 }
            : program.id === 'exports'
              ? { economy: 6, externalReputation: 3 }
              : { economy: 2, internalLegitimacy: 6 }
          : program.status === 'partial'
            ? { internalLegitimacy: 1 }
            : { internalLegitimacy: -2 };
      effects.push({ label: `программа «${definition.title}»`, res });
    }
    const text =
      state.country === ALTERNATE_COUNTRY
        ? programReport(
            program.name,
            program.progress,
            factors,
            terminal ? (program.status as 'completed' | 'partial' | 'failed') : 'running'
          )
        : `${program.name ?? 'Кабинет'}: «${definition.title}» — ${program.progress}%. ${factors.join('. ')}. ` +
          (terminal
            ? 'Срок закончен: ' +
              `${program.status === 'completed' ? 'программа исполнена' : program.status === 'partial' ? 'частичный результат' : 'срок сорван'}` +
              '. ' +
              'Итог опубликован в сообщениях и правительстве. Результат уже учтён; отдельная резолюция не требуется.'
            : 'Подписанное поручение продолжает исполняться.');
    world.dispatches = [
      ...world.dispatches,
      {
        project: program.id,
        id: `${turn}:government:${program.id}`,
        turn,
        kind: terminal ? ('news' as const) : ('report' as const),
        title: definition.title,
        text,
      },
    ].slice(-24);
    stories.push(text);
  }
  const priority = government.priority;
  if (priority) {
    const previous = governmentProject(state.world!, priority),
      current = governmentProject(world, priority);
    if (previous?.status === 'running') {
      if (state.resources.personalResource > 4)
        effects.push({
          label: `личный контроль: ${projectDef(priority).title}`,
          res: { personalResource: -1 },
        });
      if (current.status !== 'running') {
        effects.push({
          label: `публичный итог приоритета: ${projectDef(priority).title}`,
          res: { internalLegitimacy: current.status === 'completed' ? 3 : -4 },
        });
        stories.push(
          `Ваш личный приоритет «${projectDef(priority).title}»: ` +
            `${
              current.status === 'completed'
                ? 'обещание выполнено, легитимность +3'
                : 'полного результата нет; публичная ответственность, легитимность −4'
            }` +
            '.'
        );
        government.priority = null;
      }
    }
  }
  const next = stepHousingNext(state, world, turn, review);
  if (next.story) stories.push(next.story);
  effects.push(...next.effects);
  return { story: stories.join('\n\n') || null, effects };
}
export function governmentReviewEvent(state: GameState): (GameEvent & { cardId: string }) | null {
  // Совместимость с уже открытыми докладами старой версии; новые дела их не создают.
  if (state.daily || state.ended || state.activeCrises.length) return null;
  const program = state.world?.government?.programs.find(
    (program) => ['completed', 'partial', 'failed'].includes(program.status) && !program.reviewed
  );
  if (!program) return housingNextReview(state);
  const definition = projectDef(program.id),
    complete = program.status === 'completed';
  return {
    cardId: `government-review:${program.id}`,
    title: `Кому принадлежит результат: ${definition.title}`,
    source: 'Совет министров',
    isCritical: false,
    affectedFactions: [],
    randomEvent: null,
    description:
      'Советник приносит итоговый доклад по программе, которую вы сами запустили. ' +
      `${program.name} координировал работу кабинета.\n\nВыполнено ${program.progress}% за четыре квартала. ` +
      `${program.lastFactors.join('. ')}. ` +
      `${
        complete
          ? 'Работа дала заявленный результат; расходы и выгоды уже отражены в докладе.'
          : 'Полного результата нет. Уже выделенные деньги не вернутся от удачного выступления.'
      }` +
      '\n\nПресс-служба просит определить, кто выступит с итогами. Вы можете сделать этот результат ' +
      'частью собственного курса или оставить отчёт кабинету. Это решение завершает текущий квартал; ' +
      'остальные процессы продолжатся.',
    choices: [
      {
        id: 'a',
        text: complete
          ? 'Лично представить результат как часть своего курса'
          : 'Лично признать неполный результат',
        hint: complete
          ? 'Легитимность +2; результат связывают с вашим курсом'
          : 'Политкапитал −1; вы берёте публичную ответственность',
        tags: ['dialogue'],
        resolvesCrisis: null,
        deal: { pure: true, res: complete ? { internalLegitimacy: 2 } : { politicalCapital: -1 } },
        projectReview: { id: program.id },
        scene: complete
          ? 'Вы выступаете с цифрами выполненной программы. Работа кабинета становится видимым результатом вашего курса.'
          : 'Вы называете выполненный объём и причины отставания. Пресс-служба не может объявить частичное исполнение полной победой.',
      },
      {
        id: 'b',
        text: 'Поручить кабинету представить фактический отчёт',
        hint: 'Без дополнительной цены; результат и расходы сохраняются',
        tags: ['delay'],
        resolvesCrisis: null,
        deal: { pure: true },
        projectReview: { id: program.id },
        scene:
          `${program.name} представляет фактический объём работы. ` +
          'Кабинет отвечает за объяснение результата; вы ' +
          'продолжаете другие государственные дела.',
      },
    ],
  };
}
export function validGovernment(value: unknown, turn: number): value is GovernmentState {
  if (!value || typeof value !== 'object') return false;
  const government = value as GovernmentState;
  if (government.priority !== null && !PROJECTS.some((program) => program.id === government.priority))
    return false;
  if (
    !Array.isArray(government.programs) ||
    government.programs.length !== 3 ||
    new Set(government.programs.map((program) => program?.id)).size !== 3
  )
    return false;
  if (
    government.housingNext !== undefined &&
    (!validHousingNext(government.housingNext, turn) ||
      government.programs?.find((program) => program.id === 'housing')?.progress !==
        government.housingNext.originProgress ||
      !government.programs?.find((program) => program.id === 'housing')?.reviewed)
  )
    return false;
  const startedBefore = (startedTurn: unknown) =>
    Number.isSafeInteger(startedTurn) && Number(startedTurn) >= 0 && Number(startedTurn) <= turn;
  return government.programs.every((program) => {
    if (
      !program ||
      !['procurement', 'exports', 'housing'].includes(program.id) ||
      !['proposed', 'running', 'completed', 'partial', 'failed'].includes(program.status) ||
      !Number.isSafeInteger(program.progress) ||
      program.progress < 0 ||
      program.progress > 100 ||
      typeof program.supported !== 'boolean' ||
      typeof program.reviewed !== 'boolean' ||
      !Array.isArray(program.lastFactors) ||
      !program.lastFactors.every((factor) => typeof factor === 'string')
    )
      return false;
    if (program.status === 'proposed')
      return (
        program.started === null &&
        program.due === null &&
        program.coordinator === null &&
        program.name === null &&
        program.progress === 0 &&
        !program.reviewed
      );
    if (
      !startedBefore(program.started) ||
      !Number.isSafeInteger(program.due) ||
      program.due !== program.started! + 4 ||
      typeof program.coordinator !== 'string' ||
      !program.coordinator ||
      typeof program.name !== 'string' ||
      !program.name
    )
      return false;
    if (program.status === 'running')
      return program.due > turn && !program.reviewed && program.progress < 100;
    if (program.status === 'completed') return program.progress === 100;
    return (
      program.due <= turn &&
      (program.status === 'partial'
        ? program.progress >= 60 && program.progress < 100
        : program.progress < 60)
    );
  });
}
