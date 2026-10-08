import { aftermathActions, decideHealthAftermath, scheduleHealthAftermath, stepHealthAftermath, validHealthAftermath, type HealthAftermath, type HealthResponse } from './health-aftermath.ts';
import type { GameState, ResourceDelta } from './types.ts';
import type { LivingWorld, WorldAction, WorldPerson, WorldPersonId } from './living-world.ts';

export type ProjectStatus = 'unassigned' | 'running' | 'completed' | 'partial' | 'failed';
export interface HealthProject {
  status: ProjectStatus;
  openedTurn: number;
  deadline: number;
  executor: WorldPersonId | null;
  progress: number;
  funds: number;
  secured: boolean;
  cover: boolean;
  approach: 'permanent' | 'rotation';
  lastFactors: string[];
  followupTurn: number | null;
  aftermath?: HealthAftermath;
}
export const HEALTH_PEOPLE: WorldPersonId[] = ['healthMinister', 'doctor', 'governor'];
export const projectFinished = (project: { status: ProjectStatus }) =>
  ['completed', 'partial', 'failed'].includes(project.status);

export function newHealthProject(turn: number): HealthProject {
  return {
    status: 'unassigned', openedTurn: turn, deadline: turn + 4, executor: null,
    progress: 0, funds: 0, secured: false, cover: false, approach: 'permanent',
    lastFactors: [], followupTurn: null,
  };
}

export function healthActions(world: LivingWorld, people: WorldPerson[]): Omit<WorldAction, 'blocked'>[] {
  const project = world.health;
  if (!project) return [];
  if (projectFinished(project)) return aftermathActions(world, people);
  const candidates = people.filter(person => HEALTH_PEOPLE.includes(person.id));
  const candidateAction = (person: WorldPerson, replace: boolean) => ({
    id: `health:${replace ? 'replace' : 'appoint'}:${person.id}`,
    title: `${replace ? 'Сменить руководителя' : 'Поручить больницы'}: ${person.name}`,
    detail: `${person.role}. Компетенция ${person.competence}/3, отношение ${person.relation > 0 ? '+' : ''}${person.relation}. ${person.goal}. ${replace ? 'Передача дел задержит следующий квартал.' : 'Стартовый бюджет — на четыре квартала.'}${world.project.status === 'running' && world.project.executor === person.id ? ' Уже руководит энергосетью: оба проекта будут идти медленнее.' : ''}`,
    cost: replace ? { politicalCapital: -3 } : { economy: -4, politicalCapital: -2 },
  });
  if (project.status === 'unassigned') return candidates.map(person => candidateAction(person, false));
  const actions: Omit<WorldAction, 'blocked'>[] = [{
    id: 'health:visit', title: 'Провести совещание в районной больнице',
    detail: 'Согласовать назначения с местной властью. Даст исполнителю политическую поддержку; кадровый бюджет останется отдельным вопросом.',
    cost: { personalResource: -2, politicalCapital: -1 },
  }];
  if (!project.secured) actions.push({
    id: 'health:fund', title: 'Оплатить жильё и кадровый резерв',
    detail: 'Ускорит набор и закрепит специалистов в районах. Потребует дополнительных расходов бюджета.',
    cost: { economy: -4 },
  });
  actions.push({
    id: `health:approach:${project.approach === 'permanent' ? 'rotation' : 'permanent'}`,
    title: project.approach === 'permanent' ? 'Временно перевести врачей из областных центров' : 'Вернуться к постоянному набору врачей',
    detail: project.approach === 'permanent'
      ? 'Временно ускорит комплектование районов. Позднее областным больницам придётся компенсировать потерю специалистов.'
      : 'Устойчивый результат потребует больше времени. Временный перевод больше не будет основой программы.',
    cost: { politicalCapital: -2 },
  });
  return [...actions, ...candidates.filter(person => person.id !== project.executor).map(person => candidateAction(person, true))];
}

export function healthDecision(world: LivingWorld, id: string, person: (id: WorldPersonId) => WorldPerson, turn: number): string {
  const project = world.health!;
  if (id.startsWith('health:response:')) return decideHealthAftermath(world, id.slice(16) as HealthResponse, turn, person);
  if (id.startsWith('health:appoint:') || id.startsWith('health:replace:')) {
    const replace = id.startsWith('health:replace:');
    project.executor = id.split(':')[2] as WorldPersonId;
    if (replace) project.lastFactors = ['Передача дел'];
    else { project.status = 'running'; project.funds = 4; }
    return `${person(project.executor).name} принимает ответственность за районные больницы. ${replace ? 'Набранные специалисты остаются, но передача дел займёт часть следующего квартала.' : 'Первый доклад — после заседания в кабинете. Бюджет выделен на четыре квартала; постоянный набор остаётся основным способом комплектования.'}`;
  }
  if (id === 'health:fund') {
    project.secured = true;
    project.funds = Math.min(8, project.funds + 4);
    return 'К программе добавляют жильё и кадровый резерв. Районные администрации получают средства на квартиры для специалистов. Министр финансов просит учесть постоянные расходы в следующем бюджете.';
  }
  if (id === 'health:visit') {
    project.cover = true;
    const doctor = world.people.find(person => person.id === 'doctor')!;
    doctor.relation = Math.min(100, doctor.relation + 10);
    return `${person('doctor').name} показывает закрытые кабинеты и незаполненные ставки. При вас администрация согласует порядок назначения специалистов. Руководитель программы получает доступ в резиденцию; деньги на жильё придётся выделять отдельным решением.`;
  }
  project.approach = id.endsWith('rotation') ? 'rotation' : 'permanent';
  return project.approach === 'rotation'
    ? 'В районные больницы временно переводят специалистов из областных центров. Отделения смогут открыть раньше; руководители областных больниц просят записать, когда получат замену.'
    : 'Основой программы снова становится постоянный набор. Районные больницы будут комплектовать медленнее, зато новые ставки не придётся закрывать переводами из других учреждений.';
}

export function stepHealthProject(state: GameState, world: LivingWorld, turn: number, executor?: WorldPerson): { res: ResourceDelta; story: string | null } {
  const project = world.health;
  if (!project) return { res: {}, story: null };
  if (project.aftermath) return stepHealthAftermath(state, world, turn, world.people.map(p => {
    const figure = p.figure && state.keyFigures.find(f => f.id === p.figure);
    return figure ? { ...p, name: figure.name, relation: figure.relation } : p;
  }));
  if (projectFinished(project)) {
    if (project.followupTurn === null || turn < project.followupTurn) return { res: {}, story: null };
    project.followupTurn = null;
    return project.approach === 'rotation'
      ? { res: { economy: -2, internalLegitimacy: -2 }, story: 'Из областных больниц приходят жалобы: временно переведённых специалистов не заменили. Районы удержали врачей, но нагрузка переместилась в областные центры. На замену выделяют дополнительные средства. Экономика −2, легитимность −2.' }
      : { res: { economy: -1 }, story: 'Районные больницы сохранили набранных специалистов. Программа закончилась, но жильё и постоянные ставки остаются обязательствами бюджета. Экономика −1.' };
  }
  const factors: string[] = [];
  let gain = 0;
  if (project.status === 'running' && executor) {
    gain = 10 + executor.competence * 8;
    factors.push(`Компетенция ${executor.name}: ${executor.competence}/3`);
    if (executor.relation >= 30) { gain += 4; factors.push('Руководитель поддерживает ваше поручение'); }
    if (executor.relation <= -20) { gain -= 8; factors.push('Руководитель затягивает согласования'); }
    if (project.funds > 0) project.funds--;
    else { gain -= 14; factors.push('Кадровый бюджет исчерпан'); }
    if (project.secured) { gain += 8; factors.push('Жильё и кадровый резерв ускоряют набор'); }
    if (state.resources.economy < 25) { gain -= 6; factors.push('Слабая экономика ограничивает кадровые расходы'); }
    if (project.executor === 'doctor' && !project.cover) { gain -= 6; factors.push('Врачу не хватает полномочий для согласования ставок'); }
    if (state.factions.some(faction => faction.bloc === 'regional' && faction.relation < 0) && project.executor !== 'governor' && !project.cover) {
      gain -= 5; factors.push('Местная администрация тормозит назначения');
    }
    if (state.world!.project.status === 'running' && state.world!.project.executor === project.executor) {
      gain -= 10; factors.push('Руководитель делит время с энергосетью');
    }
    if (project.approach === 'rotation') { gain += 10; factors.push('Временный перевод ускоряет заполнение ставок'); }
    if (executor.trait === 'careerist' && project.secured) { gain += 2; factors.push('Министр использует резерв ради быстрого результата'); }
    if (executor.trait === 'idealist' && project.approach === 'permanent' && project.secured) { gain += 4; factors.push('Врач усиливает постоянный набор при обеспеченном жилье'); }
    if (project.lastFactors.includes('Передача дел')) { gain -= 8; factors.push('Передача дел новому руководителю'); }
  } else factors.push('Нет руководителя и кадрового бюджета');
  project.progress = Math.min(100, project.progress + Math.max(0, gain));
  project.lastFactors = factors;
  let story = executor && project.status === 'running'
    ? `${executor.name} сообщает: программа укомплектована на ${project.progress}%. ${project.approach === 'rotation' ? 'Врачи приезжают по временным переводам; областные центры ждут замены.' : 'Идёт набор на постоянные ставки; без специалиста отделение остаётся закрытым.'} ${factors.slice(1).join('. ')}.`
    : 'Районные больницы ждут решения резиденции. Койки есть, но кабинеты без специалистов закрыты; пациентов направляют в областной центр.';
  let res: ResourceDelta = {};
  if (project.progress >= 100 || turn >= project.deadline) {
    project.status = project.progress >= 100 ? 'completed' : project.progress >= 60 ? 'partial' : 'failed';
    if (project.status === 'completed') res = project.approach === 'rotation' ? { internalLegitimacy: 3 } : { economy: 1, internalLegitimacy: 5 };
    else if (project.status === 'partial') res = { internalLegitimacy: 2, economy: -1 };
    else res = { internalLegitimacy: -3, economy: -1 };
    project.aftermath = scheduleHealthAftermath(project, turn);
    project.followupTurn = project.aftermath.due;
    const ending = project.status === 'completed' ? 'Районные отделения открыты; запись к специалистам снова доступна на месте.'
      : project.status === 'partial' ? 'Часть районных отделений открылась. В остальных пациенты по-прежнему едут в областной центр.'
      : 'Программа не выполнена. Незанятые ставки остаются пустыми; жители требуют объяснить, куда ушёл год.';
    story = `${ending} Укомплектовано ${project.progress}%. ${factors.join('. ')}. Продолжение истории — через ${project.aftermath.due - turn} кв.: ${project.status === 'failed' ? 'ответ жителям за провал программы' : 'бюджетные и кадровые обязательства после завершения проекта'}. Экономика ${res.economy ?? 0}, легитимность ${(res.internalLegitimacy ?? 0) > 0 ? '+' : ''}${res.internalLegitimacy}.`;
  }
  return { res, story };
}

export function validHealthProject(value: unknown, turn: number): value is HealthProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as HealthProject;
  const integer = (number: unknown, min: number, max: number) => Number.isSafeInteger(number) && Number(number) >= min && Number(number) <= max;
  return ['unassigned', 'running', 'completed', 'partial', 'failed'].includes(project.status)
    && integer(project.openedTurn, 0, turn) && integer(project.deadline, project.openedTurn + 1, Number.MAX_SAFE_INTEGER)
    && integer(project.progress, 0, 100) && integer(project.funds, 0, 8)
    && (project.executor === null ? project.status !== 'running' : HEALTH_PEOPLE.includes(project.executor) && project.status !== 'unassigned')
    && typeof project.secured === 'boolean' && typeof project.cover === 'boolean'
    && ['permanent', 'rotation'].includes(project.approach)
    && Array.isArray(project.lastFactors) && project.lastFactors.every(factor => typeof factor === 'string')
    && (project.followupTurn === null || integer(project.followupTurn, project.openedTurn + 1, Number.MAX_SAFE_INTEGER))
    && (project.aftermath === undefined || projectFinished(project) && validHealthAftermath(project.aftermath, turn)
      && (project.aftermath.phase === 'scheduled' ? project.followupTurn === project.aftermath.due : project.followupTurn === null));
}

export function cloneHealthProject(project: HealthProject): HealthProject {
  return { ...project, lastFactors: [...project.lastFactors], ...(project.aftermath ? { aftermath: { ...project.aftermath, factors: [...project.aftermath.factors] } } : {}) };
}
