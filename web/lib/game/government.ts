import { mandateHousing } from './minister-mandate.ts';
import type { GameEvent, GameState, ResourceDelta, Choice } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';

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
  reviewed: boolean;
  supported: boolean;
}
export interface GovernmentState {
  programs: GovernmentProgram[];
  priority: GovernmentProjectId | null;
}
export const PROJECTS = [
  { id: 'energy', title: 'Восстановление энергосети', benefit: 'Надёжный свет, работа заводов; результат зависит от приоритета подключения.', risk: 'Несовместимое оборудование, местные подрядчики и зависимость от спонсора.', politics: 'Показать способность восстановить регион; успех или провал станет вашим.', advisor: 'economist', cost: { economy: -4, politicalCapital: -2 } },
  { id: 'health', title: 'Районные больницы', benefit: 'Укомплектовать отделения; постоянный набор даёт легитимность +5 и экономику +1 при полном результате.', risk: 'Согласование ставок, кадровый дефицит; временный перевод ослабляет областные центры.', politics: 'Закрепить поддержку провинции; отвечать за доступность лечения.', advisor: 'economist', cost: { economy: -4, politicalCapital: -2 } },
  { id: 'procurement', title: 'Проверка государственных закупок', benefit: 'При полном исполнении: экономика +3, легитимность +4.', risk: 'Аппарат и связанные с закупками группы сопротивляются. Их отношение ухудшится уже при запуске.', politics: 'Провести курс на прозрачность, вступив в конфликт с частью коалиции.', advisor: 'security', cost: { economy: -3, politicalCapital: -3 } },
  { id: 'exports', title: 'Экспортный коридор', benefit: 'При полном исполнении: экономика +6, внешняя репутация +3.', risk: 'Без международного доверия и поддержки бизнеса согласования затянутся; частичный результат не вернёт весь бюджет.', politics: 'Создать опору среди экспортёров и показать внешнеполитический результат.', advisor: 'diplomat', cost: { economy: -5, politicalCapital: -2 } },
  { id: 'housing', title: 'Жилищная программа', benefit: 'При полном исполнении: экономика +2, легитимность +6.', risk: 'Дорогой старт; слабая экономика и конфликт с региональными властями тормозят стройку.', politics: 'Получить видимый общественный результат; незавершённые дома станут вашим обещанием.', advisor: 'economist', cost: { economy: -6, politicalCapital: -2 } },
] as const;
export const projectDef = (id: GovernmentProjectId) => PROJECTS.find(p => p.id === id)!;
export function ensureGovernment(gs: GameState): GameState {
  if (!gs.world || gs.daily || gs.ended || gs.world.government) return gs;
  const government: GovernmentState = {
    priority: null,
    programs: ['procurement', 'exports', 'housing'].map(id => ({ id: id as ProgramId, status: 'proposed', progress: 0, started: null, due: null, coordinator: null, name: null, lastFactors: [], reviewed: false, supported: false })),
  };
  return { ...gs, world: { ...gs.world, government } };
}
export const cloneGovernment = (g: GovernmentState): GovernmentState => ({ ...g, programs: g.programs.map(p => ({ ...p, lastFactors: [...p.lastFactors] })) });
export function governmentProject(world: LivingWorld, id: GovernmentProjectId) {
  return id === 'energy' ? world.project : id === 'health' ? world.health! : world.government!.programs.find(p => p.id === id)!;
}
export function governmentLoad(world: LivingWorld): number {
  return [world.project, ...(world.health ? [world.health] : []), ...(world.government?.programs ?? [])].filter(p => p.status === 'running').length;
}
export function governmentActions(gs: GameState): Omit<WorldAction, 'blocked'>[] {
  const world = gs.world;
  if (!world?.government) return [];
  const actions: Omit<WorldAction, 'blocked'>[] = [];
  for (const def of PROJECTS) {
    const p = governmentProject(world, def.id);
    if (!p) continue;
    if (p.status === 'proposed') actions.push({ id: `government:start:${def.id}`, title: `Делегировать: ${def.title}`, cost: { ...def.cost }, detail: 'Кабинет получает бюджет на четыре квартала. Исполнение идёт между решениями; личное вмешательство нужно для запуска, а не для каждого доклада.' });
    if (p.status === 'running' && 'supported' in p && !p.supported) {
      const help = def.id === 'procurement' ? { title: 'Дать проверяющим прямой доступ к документам', detail: 'Мандат резиденции уберёт задержку документов со стороны аппарата. Саму проверку продолжает кабинет.', cost: { politicalCapital: -2, personalResource: -1 } } : def.id === 'exports' ? { title: 'Согласовать гарантии и доступ к экспортному коридору', detail: 'Переговоры снимут текущую задержку внешних согласований и сопротивление бизнеса именно по этой программе.', cost: { politicalCapital: -3, personalResource: -2 } } : { title: 'Обеспечить строительный резерв и доступ к участкам', detail: 'Дополнительные бригады дают +6 пунктов работы в квартал; согласование снимает задержку выделения участков. Другие программы не получают этот резерв.', cost: { economy: -3, politicalCapital: -1 } };
      actions.push({ id: `government:support:${def.id}`, ...help });
    }
    if (p.status === 'running' && world.government.priority !== def.id) actions.push({ id: `government:priority:${def.id}`, title: `Объявить личным приоритетом: ${def.title}`, cost: { politicalCapital: -2, personalResource: -2, ...(world.government.priority ? { internalLegitimacy: -2 } : {}) }, detail: 'Один личный приоритет. Работы получают +5 пунктов в квартал, пока личный ресурс выше 4; контроль стоит личного ресурса −1 за квартал. Полный успех: легитимность +3; неполный результат: −4. Запуск и деньги на проект оплачиваются отдельно.' });
  }
  if (world.government.priority) actions.push({ id: 'government:release', title: 'Вернуть личный приоритет под обычный контроль кабинета', cost: { politicalCapital: -2, internalLegitimacy: -2 }, detail: 'Проект продолжит работу без ускорения и затрат вашего времени. Отказ от публичного приоритета стоит легитимности −2; подпись и уже понесённые расходы остаются в истории.' });
  return actions;
}
export function governmentDecision(gs: GameState, world: LivingWorld, id: string): { text: string; factions: Record<string, number> } {
  const g = world.government!;
  const [, act, projectId] = id.split(':');
  if (act === 'release') {
    const title = projectDef(g.priority!).title; g.priority = null;
    return { text: `Вы возвращаете «${title}» под обычный контроль кабинета. Подписанное поручение не отменено, бюджет не возвращается. Публичное отступление: легитимность −2.`, factions: {} };
  }
  const target = projectId as GovernmentProjectId, def = projectDef(target);
  if (act === 'priority') {
    const previous = g.priority;
    g.priority = target;
    return { text: `Вы объявляете «${def.title}» своим политическим приоритетом. ${previous ? `Предыдущий приоритет «${projectDef(previous).title}» переходит под обычный контроль; публичная смена курса стоит легитимности −2. ` : ''}Бригады и аппарат получают прямой доступ в резиденцию; результат не наступает сразу. Контроль расходует личный ресурс, а финал будет отнесён к вашему обещанию.`, factions: {} };
  }
  const p = g.programs.find(p => p.id === target)!;
  if (act === 'support') {
    p.supported = true;
    const detail = target === 'procurement' ? 'Вы даёте проверяющим прямой доступ к документам. Связанные с закупками группы больше не могут задерживать эту программу удержанием бумаг; политическое несогласие остаётся.' : target === 'exports' ? 'Вы согласуете гарантии доступа к коридору. Текущая задержка внешних согласований и блокирование бизнесом сняты именно по этому договору; общий рейтинг страны за рубежом не становится высоким автоматически.' : 'Вы обеспечиваете дополнительный строительный резерв и согласуете доступ к участкам. Бригады получают +6 пунктов работы за квартал; задержка участков снята. Эти деньги уже нельзя направить в другую программу.';
    return { text: detail, factions: {} };
  }
  const advisor = gs.advisors.find(a => a.id === def.advisor) ?? gs.advisors[0];
  p.status = 'running'; p.started = gs.turn; p.due = gs.turn + 4; p.coordinator = advisor.id; p.name = advisor.name;
  p.lastFactors = ['Поручение подписано; первый доклад после решения в кабинете'];
  const factions = target === 'procurement' ? Object.fromEntries(gs.factions.filter(f => ['business', 'ruling'].includes(f.bloc)).map(f => [f.id, -5])) : {};
  return { text: `${advisor.name} координирует исполнение «${def.title}» через совет министров. Финансирование утверждено на четыре квартала; срок — конец квартала ${p.due}. ${def.risk} ${target === 'procurement' ? 'Группы бизнеса и правящей коалиции: отношение −5.' : ''} Дальнейшее исполнение не требует повторять подпись каждый квартал.`, factions };
}
export function priorityWork(gs: GameState, world: LivingWorld, id: GovernmentProjectId): number {
  return world.government?.priority === id && gs.resources.personalResource > 4 ? 5 : 0;
}
export function stepGovernment(gs: GameState, world: LivingWorld, turn: number, review?: Choice['projectReview']): { story: string | null; effects: {label: string; res: ResourceDelta}[] } {
  if (!world.government) return { story: null, effects: [] };
  const g = cloneGovernment(world.government); world.government = g;
  if (review) { const p = g.programs.find(p => p.id === review.id); if (p && ['completed', 'partial', 'failed'].includes(p.status)) p.reviewed = true; }
  const stories: string[] = [], effects: {label: string; res: ResourceDelta}[] = [];
  for (const p of g.programs) {
    if (p.status !== 'running') continue;
    const def = projectDef(p.id), advisor = gs.advisors.find(a => a.id === p.coordinator && a.name === p.name);
    let gain = advisor ? 12 + advisor.skill * 5 : 0;
    const factors = [advisor ? `Координатор ${advisor.name}: качество работы ${advisor.skill}/3` : 'Прежний координатор ушёл; согласования остановились'];
    if (advisor && gs.resources.economy < 25) { gain -= 6; factors.push('Слабая экономика тормозит исполнение'); }
    if (advisor && g.programs.some(other => other.id !== p.id && other.status === 'running' && other.coordinator === p.coordinator)) { gain -= 5; factors.push('Координатор делит время между программами'); }
    if (advisor && !p.supported && p.id === 'procurement' && gs.factions.some(f => ['business', 'ruling'].includes(f.bloc) && f.relation < 10)) { gain -= 5; factors.push('Связанные с закупками группы затягивают передачу документов'); }
    if (advisor && !p.supported && p.id === 'exports' && gs.resources.externalReputation < 40) { gain -= 6; factors.push('Низкое внешнее доверие затягивает согласования'); }
    if (advisor && !p.supported && p.id === 'exports' && gs.factions.some(f => f.bloc === 'business' && f.relation < 0)) { gain -= 5; factors.push('Бизнес не поддерживает совместную работу'); }
    if (advisor && !p.supported && p.id === 'housing' && gs.factions.some(f => f.bloc === 'regional' && f.relation < 0)) { gain -= 5; factors.push('Регионы затягивают выделение участков'); }
    if (advisor && p.supported) {
      if (p.id === 'housing') gain += 6;
      factors.push(p.id === 'housing' ? 'Строительный резерв и согласованные участки: +6' : 'Президентское поручение сняло препятствие этой программы');
    }
    if (advisor && mandateHousing(world)) {
      if (p.id === 'housing') {
        gain += 5; factors.push(`Подрядчики ${world.mandate!.name}: +5 работы, экономика −1`);
        effects.push({ label: `закупочный мандат ${world.mandate!.name}`, res: { economy: -1 } });
      }
      if (p.id === 'procurement' && !p.supported) { gain -= 5; factors.push(`Министр ${world.mandate!.name} удерживает строительные документы: −5`); }
    }
    if (advisor && p.id === 'housing' && world.mandate?.phase === 'withdrawn' && world.mandate.handover && world.mandate.changed === turn - 1) {
      gain -= 5; factors.push('Передача закупок после отзыва мандата: −5 на один квартал');
    }
    const boost = advisor ? priorityWork(gs, world, p.id) : 0;
    if (boost) { gain += boost; factors.push('Личный приоритет президента ускоряет согласования: +5'); }
    p.progress = Math.min(100, p.progress + Math.max(0, gain)); p.lastFactors = factors;
    const terminal = p.progress === 100 || turn >= p.due!;
    if (terminal) {
      p.status = p.progress === 100 ? 'completed' : p.progress >= 60 ? 'partial' : 'failed';
      const res: ResourceDelta = p.status === 'completed' ? p.id === 'procurement' ? { economy: 3, internalLegitimacy: 4 } : p.id === 'exports' ? { economy: 6, externalReputation: 3 } : { economy: 2, internalLegitimacy: 6 } : p.status === 'partial' ? { internalLegitimacy: 1 } : { internalLegitimacy: -2 };
      effects.push({ label: `программа «${def.title}»`, res });
    }
    const text = `${p.name ?? 'Кабинет'}: «${def.title}» — ${p.progress}%. ${factors.join('. ')}. ${terminal ? `Срок закончен: ${p.status === 'completed' ? 'программа исполнена' : p.status === 'partial' ? 'частичный результат' : 'срок сорван'}. Итог поступит на главное рассмотрение.` : 'Подписанное поручение продолжает исполняться.'}`;
    world.dispatches = [...world.dispatches, { project: p.id, id: `${turn}:government:${p.id}`, turn, kind: terminal ? 'news' as const : 'report' as const, title: def.title, text }].slice(-24);
    stories.push(text);
  }
  const priority = g.priority;
  if (priority) {
    const previous = governmentProject(gs.world!, priority), current = governmentProject(world, priority);
    if (previous?.status === 'running') {
      if (gs.resources.personalResource > 4) effects.push({ label: `личный контроль: ${projectDef(priority).title}`, res: { personalResource: -1 } });
      if (current.status !== 'running') {
        effects.push({ label: `публичный итог приоритета: ${projectDef(priority).title}`, res: { internalLegitimacy: current.status === 'completed' ? 3 : -4 } });
        stories.push(`Ваш личный приоритет «${projectDef(priority).title}»: ${current.status === 'completed' ? 'обещание выполнено, легитимность +3' : 'полного результата нет; публичная ответственность, легитимность −4'}.`);
        g.priority = null;
      }
    }
  }
  return { story: stories.join('\n\n') || null, effects };
}
export function governmentReviewEvent(gs: GameState): (GameEvent & {cardId: string}) | null {
  if (gs.daily || gs.ended || gs.activeCrises.length) return null;
  const p = gs.world?.government?.programs.find(p => ['completed', 'partial', 'failed'].includes(p.status) && !p.reviewed);
  if (!p) return null;
  const def = projectDef(p.id), complete = p.status === 'completed';
  return {
    cardId: `government-review:${p.id}`, title: `Кому принадлежит результат: ${def.title}`, source: 'Совет министров', isCritical: false, affectedFactions: [], randomEvent: null,
    description: `Советник приносит итоговый доклад по программе, которую вы сами запустили. ${p.name} координировал работу кабинета.\n\nВыполнено ${p.progress}% за четыре квартала. ${p.lastFactors.join('. ')}. ${complete ? 'Работа дала заявленный результат; расходы и выгоды уже отражены в докладе.' : 'Полного результата нет. Уже выделенные деньги не вернутся от удачного выступления.'}\n\nПресс-служба просит определить, кто выступит с итогами. Вы можете сделать этот результат частью собственного курса или оставить отчёт кабинету. Это решение завершает текущий квартал; остальные процессы продолжатся.`,
    choices: [
      { id: 'a', text: complete ? 'Лично представить результат как часть своего курса' : 'Лично признать неполный результат', hint: complete ? 'Легитимность +2; результат связывают с вашим курсом' : 'Политкапитал −1; вы берёте публичную ответственность', tags: ['dialogue'], resolvesCrisis: null, deal: { pure: true, res: complete ? { internalLegitimacy: 2 } : { politicalCapital: -1 } }, projectReview: { id: p.id }, scene: complete ? 'Вы выступаете с цифрами выполненной программы. Работа кабинета становится видимым результатом вашего курса.' : 'Вы называете выполненный объём и причины отставания. Пресс-служба не может объявить частичное исполнение полной победой.' },
      { id: 'b', text: 'Поручить кабинету представить фактический отчёт', hint: 'Без дополнительной цены; результат и расходы сохраняются', tags: ['delay'], resolvesCrisis: null, deal: { pure: true }, projectReview: { id: p.id }, scene: `${p.name} представляет фактический объём работы. Кабинет отвечает за объяснение результата; вы продолжаете другие государственные дела.` },
    ],
  };
}
export function validGovernment(value: unknown, turn: number): value is GovernmentState {
  if (!value || typeof value !== 'object') return false;
  const g = value as GovernmentState;
  if (g.priority !== null && !PROJECTS.some(p => p.id === g.priority)) return false;
  if (!Array.isArray(g.programs) || g.programs.length !== 3
    || new Set(g.programs.map(p => p?.id)).size !== 3) return false;
  const startedBefore = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= turn;
  return g.programs.every(p => {
    if (!p || !['procurement', 'exports', 'housing'].includes(p.id)
      || !['proposed', 'running', 'completed', 'partial', 'failed'].includes(p.status)
      || !Number.isSafeInteger(p.progress) || p.progress < 0 || p.progress > 100
      || typeof p.supported !== 'boolean' || typeof p.reviewed !== 'boolean' || !Array.isArray(p.lastFactors)
      || !p.lastFactors.every(f => typeof f === 'string')) return false;
    if (p.status === 'proposed') return p.started === null && p.due === null
      && p.coordinator === null && p.name === null && p.progress === 0 && !p.reviewed;
    if (!startedBefore(p.started) || !Number.isSafeInteger(p.due) || p.due !== p.started! + 4
      || typeof p.coordinator !== 'string' || !p.coordinator
      || typeof p.name !== 'string' || !p.name) return false;
    if (p.status === 'running') return p.due > turn && !p.reviewed && p.progress < 100;
    if (p.status === 'completed') return p.progress === 100;
    return p.due <= turn && (p.status === 'partial' ? p.progress >= 60 && p.progress < 100 : p.progress < 60);
  });
}
