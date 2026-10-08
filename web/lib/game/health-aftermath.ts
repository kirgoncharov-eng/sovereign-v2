import { bargainActions, bargainFactors, newHealthBargain, validHealthBargain, type HealthBargain } from './health-bargain.ts';
// Одна история после кадровой программы: память о решении, срок ответа и исполнение.
import type { GameState, ResourceDelta } from './types.ts';
import type { HealthProject } from './living-health.ts';
import type { LivingWorld, WorldAction, WorldPerson, WorldPersonId } from './living-world.ts';

export type HealthBranch = 'permanent' | 'rotation' | 'failure';
export type HealthResponse = 'payroll' | 'lean' | 'cuts' | 'replacement' | 'return' | 'mediate' | 'pilot' | 'audit' | 'acknowledge';
export interface HealthAftermath {
  branch: HealthBranch;
  phase: 'scheduled' | 'open' | 'working' | 'settled';
  due: number;
  deadline: number;
  cause: string;
  response: HealthResponse | null;
  executor: WorldPersonId | null;
  outcome: 'fulfilled' | 'limited' | 'neglected' | null;
  factors: string[];
  bargain?: HealthBargain;
}
export const AFTERMATH_TITLE: Record<HealthBranch, string> = {
  permanent: 'Кто оплатит открытые отделения',
  rotation: 'Врачи на два района',
  failure: 'Пустые кабинеты, полный зал',
};
const TRAIT: Record<WorldPerson['trait'], string> = { careerist: 'карьерист', idealist: 'идеалист', apparatchik: 'аппаратчик', pragmatist: 'прагматик', hawk: 'ястреб', populist: 'популист' };
const RESPONSES: Record<HealthBranch, HealthResponse[]> = {
  permanent: ['payroll', 'lean', 'cuts'], rotation: ['replacement', 'return', 'mediate'], failure: ['pilot', 'audit', 'acknowledge'],
};
const PLANS: Record<HealthResponse, { title: string; detail: string; cost: ResourceDelta }> = {
  payroll: { title: 'Закрепить зарплаты и жильё на следующий год', detail: 'Сохранить постоянные ставки. Руководитель должен согласовать выплаты с казначейством; при слабом исполнении часть отделений потеряет врачей.', cost: { economy: -3, politicalCapital: -1 } },
  lean: { title: 'Сократить аппарат, сохранив врачебные ставки', detail: 'Перенести расходы с управления на отделения. Требует согласования; карьерист защищает собственный аппарат. Если план сорвётся, часть приёмов закроется.', cost: { politicalCapital: -2, personalResource: -1 } },
  cuts: { title: 'Сократить районную программу', detail: 'Снизить расходы без нового финансирования. Через два квартала часть открытых отделений закроется; главный врач и жители выступят против сокращения.', cost: { politicalCapital: -1 } },
  replacement: { title: 'Нанять замену для областных больниц', detail: 'Сохранить районные отделения и восстановить областные. Министр должен провести набор; деньги сами по себе не гарантируют исполнения.', cost: { economy: -4, politicalCapital: -1 } },
  return: { title: 'Вернуть переведённых врачей в областные центры', detail: 'Разгрузить областные больницы за счёт районов. Через два квартала часть районных приёмов снова закроется; жители вспомнят ваше обещание.', cost: { politicalCapital: -2 } },
  mediate: { title: 'Согласовать общий график врачей двух уровней', detail: 'Главный врач согласует выездные дни с министерством. Часть районных ставок станет совместительством, помощь будет доступна по расписанию. Потребуются компетенция и сотрудничество; идеалист поддерживает доступность помощи, враждебное ведомство задерживает договор.', cost: { personalResource: -2, politicalCapital: -2 } },
  pilot: { title: 'Перезапустить программу в нескольких районах', detail: 'Главный врач начнёт с ограниченной сети. Это частичное исправление провала: вся программа не будет завершена одним указом.', cost: { economy: -3, politicalCapital: -2 } },
  audit: { title: 'Поручить главному врачу публичную проверку', detail: 'Опубликовать причины провала и расходования бюджета. Проверка может вернуть доверие, но сама по себе не откроет отделения; враждебное ведомство сопротивляется.', cost: { politicalCapital: -3, personalResource: -1 } },
  acknowledge: { title: 'Признать провал и отказаться от перезапуска', detail: 'Объяснить решение без новых расходов. Кабинеты останутся закрытыми; признание не отменит недовольство жителей.', cost: { politicalCapital: -1 } },
};

export function scheduleHealthAftermath(project: HealthProject, turn: number): HealthAftermath {
  const branch = project.status === 'failed' ? 'failure' : project.approach;
  const due = turn + (branch === 'failure' ? 1 : 2);
  const cause = branch === 'failure'
    ? `Годовая программа закончилась с ${project.progress}% укомплектованных ставок. ${project.executor ? 'Назначенный руководитель не достиг даже частичного результата.' : 'Резиденция так и не назначила руководителя и не выделила кадровый бюджет.'}`
    : branch === 'rotation'
      ? `Вы выбрали временные переводы. Районная программа достигла ${project.progress}%, но специалистов взяли из областных больниц; замены им не подготовили.`
      : `Вы выбрали постоянный набор. Районная программа достигла ${project.progress}%; новые ставки и жильё требуют содержания после окончания стартового бюджета.`;
  return { branch, phase: 'scheduled', due, deadline: due + 2, cause, response: null, executor: null, outcome: null, factors: [] };
}
export const healthNeedsAttention = (project?: HealthProject) => project?.aftermath?.phase === 'open' || project?.aftermath?.bargain?.phase === 'open';
export const healthHasContinuation = (project?: HealthProject) => !!project?.aftermath && (project.aftermath.phase !== 'settled' || project.aftermath.bargain?.reviewDue != null);

function responseExecutor(project: HealthProject, response: HealthResponse): WorldPersonId {
  if (['mediate', 'pilot', 'audit'].includes(response)) return 'doctor';
  if (['replacement', 'return'].includes(response)) return 'healthMinister';
  return project.executor ?? 'healthMinister';
}
export function aftermathActions(world: LivingWorld, people: WorldPerson[]): Omit<WorldAction, 'blocked'>[] {
  const project = world.health;
  if (!project || !healthNeedsAttention(project)) return [];
  if (project.aftermath!.phase === 'working') return bargainActions(world);
  return RESPONSES[project.aftermath!.branch].map(response => {
    const plan = PLANS[response], person = people.find(p => p.id === responseExecutor(project, response))!;
    return {
      id: `health:response:${response}`, title: plan.title,
      detail: `${plan.detail} Исполнитель: ${person.name}, ${person.role.toLowerCase()}; компетенция ${person.competence}/3, характер — ${TRAIT[person.trait]}, к вам ${person.relation > 0 ? '+' : ''}${person.relation}. Доклад через два квартала.`,
      cost: plan.cost,
    };
  });
}
export function decideHealthAftermath(world: LivingWorld, response: HealthResponse, turn: number, person: (id: WorldPersonId) => WorldPerson): string {
  const project = world.health!, story = project.aftermath!;
  story.response = response;
  story.executor = responseExecutor(project, response);
  story.phase = 'working';
  story.due = turn + 2;
  if (response === 'mediate') story.bargain = newHealthBargain(world.people.map(p => person(p.id)));
  return `${person(story.executor).name} получает поручение «${PLANS[response].title}». ${story.cause} Секретарь вписывает в журнал: доклад через два квартала. До доклада результат программы не меняется; исполнитель должен провести решение через учреждения, а не только подписать бумагу.`;
}

function executionFactors(state: GameState, story: HealthAftermath, actor: WorldPerson, people: WorldPerson[]) {
  let score = actor.competence;
  const factors = [`Исполнитель — ${actor.name}; компетенция ${actor.competence}/3`];
  if (actor.relation >= 30) { score++; factors.push('Исполнитель лично поддерживает поручение'); }
  if (actor.relation <= -20) { score--; factors.push('Исполнитель затягивает согласования из-за отношений с резиденцией'); }
  if (actor.trait === 'idealist' && ['payroll', 'lean', 'mediate', 'pilot', 'audit'].includes(story.response!)) {
    score++; factors.push('План соответствует стремлению исполнителя сохранить доступную помощь');
  }
  if (actor.trait === 'careerist' && ['payroll', 'replacement'].includes(story.response!)) {
    score++; factors.push('Финансирование помогает исполнителю сохранить показатели ведомства');
  }
  if (actor.trait === 'careerist' && story.response === 'lean') {
    score--; factors.push('Руководитель защищает аппарат ведомства от сокращения');
  }
  if (['mediate', 'audit'].includes(story.response!) && (people.find(p => p.id === 'healthMinister')?.relation ?? 0) <= -20) {
    score--; factors.push('Министерство сопротивляется работе главного врача');
  }
  if (state.factions.some(f => f.bloc === 'regional' && f.relation < 0) && story.response !== 'audit') {
    score--; factors.push('Местный аппарат задерживает согласования');
  }
  if (state.world?.project.status === 'running' && state.world.project.executor === actor.id) {
    score--; factors.push('Исполнитель делит время с восстановлением энергосети');
  }
  if (state.resources.economy < 25 && ['payroll', 'replacement', 'pilot'].includes(story.response!)) {
    score--; factors.push('Слабая экономика затрудняет исполнение кадрового бюджета');
  }
  const bargain = bargainFactors(story.bargain, people, state.resources.economy);
  score += bargain.score; factors.push(...bargain.factors);
  return { good: score >= 4, factors };
}
function reduceDistricts(project: HealthProject, amount: number) {
  project.progress = Math.max(0, project.progress - amount);
  project.status = project.progress >= 60 ? 'partial' : 'failed';
}

export function stepHealthAftermath(state: GameState, world: LivingWorld, turn: number, people: WorldPerson[]): { res: ResourceDelta; story: string | null } {
  const project = world.health!, continuation = project.aftermath!;
  const minister = people.find(p => p.id === 'healthMinister')!, doctor = people.find(p => p.id === 'doctor')!;
  if (continuation.phase === 'settled') {
    const bargain = continuation.bargain;
    if (bargain?.reviewDue != null && turn >= bargain.reviewDue) {
      bargain.reviewDue = null;
      return { res: { politicalCapital: -2 }, story: `${minister.name} представил назначения по согласованному вами порядку. Руководители больниц теперь обязаны карьерой министру; он опирается на них в торге с резиденцией. Политкапитал −2 — цена переданного контроля над кадрами, а не новый штраф за больничную программу.` };
    }
    return { res: {}, story: null };
  }
  if (continuation.phase === 'scheduled') {
    if (turn < continuation.due) return { res: {}, story: null };
    continuation.phase = 'open';
    project.followupTurn = null;
    const scene = continuation.branch === 'permanent'
      ? `Казначейство возвращает зарплатную ведомость с пустой строкой финансирования. ${minister.name} кладёт её поверх отчёта об открытых отделениях: «Людей приняли, но стартовая программа закончилась». ${doctor.name} принёс заявления врачей: без гарантированных выплат они не продлят договоры. Министр защищает бюджет ведомства, врач — постоянные ставки. Можно оплатить следующий год, сократить аппарат или свернуть часть районной программы.`
      : continuation.branch === 'rotation'
        ? `В областном приёмном покое очередь выходит в коридор. На дверях двух кабинетов фамилии врачей, которых вы перевели в районы. ${minister.name} показывает районные показатели и просит не разрушать достигнутый результат. ${doctor.name} раскладывает расписания обеих больниц: одни и те же люди не могут принимать одновременно в двух местах. Можно нанять замену, вернуть врачей или согласовать выездные дни.`
        : `На встрече с районными жителями первый ряд занимают люди с направлениями в областную больницу. ${minister.name} предлагает закрыть программу в отчёте; ${doctor.name} просит начать хотя бы с нескольких отделений. Оппозиция раздаёт копии обещания резиденции. Можно ограниченно перезапустить набор, опубликовать проверку или признать провал без нового бюджета.`;
    return { res: {}, story: `${AFTERMATH_TITLE[continuation.branch]}. ${scene}\n\nПричина: ${continuation.cause} Ответ ждут в течение двух кварталов. Поручение доступно в повестке районных больниц. Без вмешательства ${continuation.branch === 'permanent' ? 'часть врачей уйдёт, а открытые приёмы закроются' : continuation.branch === 'rotation' ? 'областные больницы останутся без замены специалистов' : 'недовольство жителей усилится'}.` };
  }
  if (continuation.phase === 'open') {
    if (turn < continuation.deadline) return { res: {}, story: `По больницам ответа ещё нет. ${doctor.name} просит подписать решение до следующего квартального доклада. Причина остаётся прежней: ${continuation.cause}` };
    continuation.phase = 'settled'; continuation.outcome = 'neglected';
    if (continuation.branch === 'permanent') {
      reduceDistricts(project, 25);
      return { res: { economy: 1, internalLegitimacy: -4 }, story: `Срок ответа прошёл без поручения. Врачи не дождались гарантий выплат и покидают часть районных отделений; укомплектованность падает до ${project.progress}%. ${doctor.name} присылает список закрытых приёмов. Экономия получена ценой потери результата программы. Причина: ${continuation.cause}` };
    }
    return continuation.branch === 'rotation'
      ? { res: { economy: -2, internalLegitimacy: -3 }, story: `Срок ответа прошёл без поручения. Областные больницы нанимают срочную замену, отменяя плановые приёмы; районы сохраняют переведённых врачей, но очередь переместилась в область. ${minister.name} сохраняет показатели районной программы, жители области требуют ответа. Причина: ${continuation.cause}` }
      : { res: { internalLegitimacy: -4, politicalCapital: -2 }, story: `Срок ответа прошёл без поручения. Закрытые кабинеты становятся местом еженедельных собраний. Оппозиция связывает пустые ставки с молчанием резиденции; ${doctor.name} прекращает обещать людям скорое открытие. Укомплектовано по-прежнему ${project.progress}%. Причина: ${continuation.cause}` };
  }
  if (turn < continuation.due && continuation.bargain?.phase === 'waiting') {
    continuation.bargain.phase = 'open';
    return { res: {}, story: `Согласование остановилось на двух подписях. ${continuation.bargain.ministerCondition} ${continuation.bargain.doctorCondition} До итогового доклада остался один квартал. Выберите, чьи полномочия закрепить, в поручениях районных больниц. Без ответа министерство задержит график; лояльность сама по себе не снимает спор об интересах.` };
  }
  if (turn >= continuation.due && continuation.bargain?.phase === 'open') continuation.bargain.phase = 'ignored';
  const actor = people.find(p => p.id === continuation.executor)!;
  if (turn < continuation.due) return { res: {}, story: `${actor.name} исполняет поручение «${PLANS[continuation.response!].title}». Решение проходит согласования; итоговый доклад — после следующего решения в кабинете.` };
  const response = continuation.response!;
  const policy = ['cuts', 'return', 'acknowledge'].includes(response);
  const { good, factors } = policy ? { good: true, factors: ['Резиденция сознательно выбрала сокращение помощи или отказ от перезапуска'] } : executionFactors(state, continuation, actor, people);
  continuation.factors = factors;
  continuation.phase = 'settled';
  continuation.outcome = good ? 'fulfilled' : 'limited';
  let res: ResourceDelta = {}, result: string;
  if (response === 'cuts' || response === 'return') {
    continuation.outcome = 'fulfilled';
    reduceDistricts(project, response === 'cuts' ? 25 : 20);
    res = response === 'cuts' ? { economy: 2, internalLegitimacy: -3 } : { internalLegitimacy: -1 };
    result = response === 'cuts'
      ? `Вы сократили программу. Часть районных приёмов закрывается; укомплектованность теперь ${project.progress}%. Бюджет разгружен, но жители теряют помощь рядом с домом.`
      : `Врачи вернулись в областные центры. Там возобновляют приёмы; в районах снова свободные ставки. Укомплектованность районной программы теперь ${project.progress}%.`;
  } else if (response === 'acknowledge') {
    continuation.outcome = 'fulfilled'; res = { internalLegitimacy: -2 };
    result = `Резиденция признала провал и отказалась от перезапуска. Районные отделения остаются укомплектованы на ${project.progress}%. Новых расходов нет; жители услышали объяснение, но не получили врачей.`;
  } else if (response === 'audit') {
    res = { internalLegitimacy: good ? 2 : -1 };
    result = good
      ? `${doctor.name} публикует проверку: ${project.executor ? 'названы сорванные назначения и ответственные за исполнение' : 'программа не получила ни руководителя, ни кадрового бюджета'}. Резиденция получает часть доверия за открытость. Укомплектованность остаётся ${project.progress}%: проверка не открыла отделения.`
      : `Проверка опубликована частично: ведомство не предоставило документы по назначениям. Вопросы к расходам и ответственности остаются. Укомплектованность по-прежнему ${project.progress}%.`;
  } else if (response === 'pilot') {
    project.progress = Math.min(75, project.progress + (good ? 45 : 20)); project.status = 'partial';
    res = { internalLegitimacy: good ? 3 : 1 };
    result = `${actor.name} ${good ? 'открыл ограниченную сеть отделений' : 'смог открыть лишь первые приёмы'}. Укомплектовано теперь ${project.progress}%. Это частичное исправление прошлогоднего провала; остальные районы ещё ждут специалистов.`;
  } else if (response === 'mediate') {
    if (good) reduceDistricts(project, 10);
    res = { internalLegitimacy: good ? 1 : -2 };
    result = good
      ? `${doctor.name} согласовал выездные дни. Районы сохраняют помощь, областные больницы возвращают часть приёмов. Теперь специалисты приезжают по расписанию; постоянная укомплектованность районов снизилась до ${project.progress}%. Ждать консультации приходится дольше, чем при постоянном составе.`
      : 'Общий график подписали не все учреждения. Районы сохраняют часть переводов, в областных больницах продолжают отменять приёмы; спор между уровнями власти остаётся.';
  } else if (response === 'replacement') {
    res = { internalLegitimacy: good ? 2 : -2 };
    result = good
      ? `${minister.name} нанял замену для областных больниц. Районы сохраняют переведённых врачей, областные центры возобновляют приёмы. Быстрый успех районной программы пришлось оплатить вторым набором.`
      : `${minister.name} провёл лишь часть назначений. Бюджет выделен, но областные центры всё ещё ждут специалистов; новое финансирование не сняло задержки исполнения.`;
  } else {
    if (!good) reduceDistricts(project, 15);
    res = { internalLegitimacy: good ? 2 : -2 };
    result = good
      ? response === 'payroll' ? `${actor.name} провёл выплаты и договоры на следующий год. Врачи остаются; районные приёмы сохранены. Постоянный набор удалось превратить в устойчивую службу.` : `${actor.name} сократил управленческие расходы и сохранил врачебные ставки. Приёмы продолжаются; аппарат ведомства потерял часть должностей.`
      : `${actor.name} не согласовал весь план. Часть специалистов не продлила договоры; укомплектованность снизилась до ${project.progress}%.`;
  }
  return { res, story: `Исполнение поручения «${PLANS[response].title}». ${result}\n\nЧто повлияло: ${factors.join('. ')}. Причина исходной ситуации: ${continuation.cause}` };
}

export function validHealthAftermath(value: unknown, turn: number): value is HealthAftermath {
  if (!value || typeof value !== 'object') return false;
  const s = value as HealthAftermath;
  const int = (v: number) => Number.isSafeInteger(v) && v >= 0;
  if (!Object.hasOwn(RESPONSES, s.branch) || !['scheduled', 'open', 'working', 'settled'].includes(s.phase)
    || !int(s.due) || !int(s.deadline) || s.deadline < 2 || typeof s.cause !== 'string' || !s.cause
    || !Array.isArray(s.factors) || !s.factors.every(f => typeof f === 'string')) return false;
  if (s.bargain !== undefined) {
    if (!validHealthBargain(s.bargain) || s.response !== 'mediate' || s.branch !== 'rotation' || !['working', 'settled'].includes(s.phase)) return false;
    const b = s.bargain;
    if (s.phase === 'working' && (!['waiting', 'open', 'answered'].includes(b.phase) || b.phase === 'waiting' && s.due !== turn + 2 || b.phase === 'open' && s.due !== turn + 1)) return false;
    if (s.phase === 'settled' && !['answered', 'ignored'].includes(b.phase)) return false;
    if (s.executor !== (b.choice === 'minister' ? 'healthMinister' : 'doctor')) return false;
    if (b.choice === 'minister' && s.phase === 'working' && b.reviewDue === null) return false;
    if (b.reviewDue !== null && (b.reviewDue !== s.due + 2 || b.reviewDue <= turn)) return false;
  }
  if (s.phase === 'scheduled' || s.phase === 'open') return s.response === null && s.executor === null && s.outcome === null && s.deadline === s.due + 2 && (s.phase === 'scheduled' ? s.due > turn && s.due <= turn + 2 : s.due <= turn && s.deadline > turn);
  if (s.phase === 'working') return RESPONSES[s.branch].includes(s.response!) && ['healthMinister', 'doctor', 'governor'].includes(s.executor!) && s.outcome === null && s.due > turn && s.due <= turn + 2;
  return ['fulfilled', 'limited', 'neglected'].includes(s.outcome!) && (s.outcome === 'neglected' ? s.response === null && s.executor === null && s.deadline <= turn : RESPONSES[s.branch].includes(s.response!) && ['healthMinister', 'doctor', 'governor'].includes(s.executor!) && s.due <= turn);
}
