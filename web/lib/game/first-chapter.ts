// A bounded, opt-in chapter. Hospital execution uses the same world model as free play.
// Saves contain decisions only; deterministic replay never trusts a serialized world.
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { interveneWorld, livingActions, openLivingWorld, stepLivingWorld, worldPerson } from './living-world.ts';
import type { GameState, ResourceDelta } from './types.ts';
import type { SceneKey } from '../content/scene-map.ts';

export const CHAPTER_SAVE = 'sovereign.chapter.price-of-promise.v1';
export type ChapterGoal = 'reach' | 'lasting' | 'reserve';
export type ChapterContract = 'minister' | 'doctor' | 'joint';
export type ChapterStage = 'goal' | 'appoint' | 'support' | 'call' | 'lastOrder' | 'press' | 'followup' | 'briefing' | 'response' | 'execution' | 'end';
export interface Chapter {
  game: GameState;
  stage: ChapterStage;
  goal: ChapterGoal | null;
  contract: ChapterContract | null;
  press: 'responsibility' | 'defend' | 'blame' | null;
  promise: boolean;
  promiseProgress: number | null;
  debtPaid: boolean;
  firstYearProgress: number | null;
  decisions: string[];
  report: string;
  openingResources: GameState['resources'];
}
export interface ChapterOption { id: string; title: string; detail: string; cost: ResourceDelta; blocked?: string | null }
export const RESOURCE_NAMES: Record<keyof GameState['resources'], string> = {
  economy: 'Экономика', politicalCapital: 'Политкапитал', personalResource: 'Личный ресурс',
  internalLegitimacy: 'Легитимность', externalReputation: 'Внешняя репутация', military: 'Силовой ресурс',
};
export const GOALS: Record<ChapterGoal, string> = {
  reach: 'Открыть приёмы: не менее 90% ставок к концу первого года',
  lasting: 'Создать постоянную службу: не менее 75% ставок и сохранённые приёмы через два года',
  reserve: 'Удержать расходы: экономика не ниже 45 при не менее 60% ставок через два года',
};
const cap = (v: number, min = 0) => Math.max(min, Math.min(100, v));
export async function newChapter(): Promise<Chapter> {
  const gs = openLivingWorld(createInitialState('Украина', 'debut', 'pragmatist',
    await classicApi.setup('Украина', 'debut', 'pragmatist', 15), seededRandom(15)));
  // Authored scenario baseline: the previous cabinet completed the energy project.
  const game = { ...gs, world: { ...gs.world!, project: { ...gs.world!.project, status: 'completed' as const, progress: 100, reported: 100 } } };
  return { game, stage: 'goal', goal: null, contract: null, press: null, promise: false, promiseProgress: null,
    debtPaid: false, firstYearProgress: null, decisions: [], report: '', openingResources: { ...game.resources } };
}
function pay(game: GameState, cost: ResourceDelta): GameState {
  const resources = { ...game.resources };
  for (const [k, v] of Object.entries(cost)) resources[k as keyof typeof resources] = cap(resources[k as keyof typeof resources] + v!);
  return { ...game, resources };
}
function relations(game: GameState, minister: number, doctor: number): GameState {
  const people = game.world!.people.map(p => ({ ...p, relation: cap(p.relation + (p.id === 'healthMinister' ? minister : p.id === 'doctor' ? doctor : 0), -100) }));
  return { ...game, world: { ...game.world!, people } };
}
function tick(chapter: Chapter): Chapter {
  let game = chapter.game;
  const turn = game.turn + 1;
  const result = stepLivingWorld(game, turn);
  game = pay({ ...game, world: result.world, turn, lastTurn: null }, result.res);
  let report = [chapter.report, result.story].filter(Boolean).join('\n\n');
  let debtPaid = chapter.debtPaid;
  if (chapter.contract === 'minister' && turn >= 4 && !debtPaid) {
    game = pay(game, { politicalCapital: -2 }); debtPaid = true;
    report += '\n\nМинистр напоминает о договоре: кадровые назначения остаются внутри ведомства. Вам приходится снять возражения коалиции. Политкапитал −2 — отложенная цена вашего телефонного соглашения.';
  }
  return { ...chapter, game, report, debtPaid };
}
const option = (id: string, title: string, detail: string, cost: ResourceDelta = {}): ChapterOption => ({ id, title, detail, cost });
export function chapterOptions(c: Chapter): ChapterOption[] {
  const hospital = c.game.world!.health!;
  const actions = livingActions(c.game).filter(a => a.id.startsWith('health:'));
  let options: ChapterOption[] = [];
  switch (c.stage) {
    case 'goal': options = [
      option('goal:reach', 'Открыть приёмы до зимы', 'Не менее 90% ставок к концу первого года. Быстрые переводы помогут районам, но заберут врачей у областных больниц.'),
      option('goal:lasting', 'Закрепить врачей надолго', 'Постоянный набор, не менее 75% ставок и сохранённые приёмы через два года. Придётся оплатить не только открытие, но и содержание.'),
      option('goal:reserve', 'Сохранить бюджетный резерв', 'Через два года: экономика не ниже 45, укомплектованность не ниже 60%. Сокращая расходы, придётся выбирать, где помощь останется.'),
    ]; break;
    case 'appoint': options = actions.filter(a => a.id.startsWith('health:appoint:')); break;
    case 'support': case 'lastOrder': options = actions.filter(a => ['health:fund', 'health:visit'].includes(a.id) || a.id.startsWith('health:approach:'));
      if (hospital.cover) options = options.filter(a => a.id !== 'health:visit');
      options.push(option('keep', 'Оставить поручение без изменений', 'Новые ресурсы не выделяются. Исполнитель продолжит по текущему плану; следующий доклад покажет результат квартала.')); break;
    case 'call': options = [
      option('contract:minister', 'Передать министру контроль над назначениями', 'Министр становится руководителем. Его отношение +12, врача −10. Сейчас политкапитал −1; в конце года ещё −2 за согласование кадровой самостоятельности.', { politicalCapital: -1 }),
      option('contract:doctor', 'Дать врачу прямой мандат резиденции', 'Врач становится руководителем и получает политическую защиту. Его отношение +10, министра −18. Вы лично проводите решение через аппарат.', { politicalCapital: -3, personalResource: -2 }),
      option('contract:joint', 'Оставить исполнителя, согласовать общий мандат', 'Обоим отношение +3. Политическая поддержка появится, если экономика ≥25 и оба не настроены враждебно (отношение выше −20). Потребуются дополнительные согласования.', { economy: -2, politicalCapital: -2 }),
    ]; break;
    case 'press': options = [
      option('press:responsibility', '«Это моя программа. Отвечаю за её результат»', 'Журналист спросит, что вы готовы гарантировать на следующий год. Сейчас ресурсы не меняются.'),
      option('press:defend', '«Надо смотреть не только на число открытых дверей»', 'Объяснить выбранную модель помощи. Журналист проверит её цену для других больниц и бюджета. Сейчас ресурсы не меняются.'),
      option('press:blame', '«Назначения проводил руководитель программы»', 'Назвать исполнителя ответственным. Его отношение снизится на 10; это может осложнить исполнение следующего поручения. Сейчас ресурсы не меняются.'),
    ]; break;
    case 'followup': options = [
      option('promise', '«Через год сохранится не меньше нынешних приёмов»', `Публичное обязательство: к концу второго года не менее ${hospital.progress}% ставок и исполненный план сохранения помощи. При выполнении легитимность +2, при нарушении −3.`),
      option('honest', '«Нового срока до утверждения плана не обещаю»', 'Не брать обязательство раньше решения по содержанию. Нового обещания и его бонуса нет; результат программы всё равно будет опубликован.'),
    ]; break;
    case 'briefing': options = [option('review', 'Открыть доклад о следующем годе', 'Квартал пройдёт без нового вмешательства. В кабинет поступит реальное продолжение выбранной программы.')]; break;
    case 'response': options = actions.filter(a => a.id.startsWith('health:response:') && a.id !== 'health:response:mediate');
      options.push(option('keep', 'Не выделять новых полномочий и денег', `До квартала ${hospital.aftermath!.deadline} можно ответить. Без ответа учреждения останутся с прежней проблемой.`)); break;
    case 'execution': options = [option('review', 'Принять итоговый доклад', 'Пройдёт последний квартал главы. Подписанный план проверится по исполнителю, отношениям, бюджету и сопротивлению аппарата.')]; break;
    case 'end': return [];
  }
  return options.map(a => ({ ...a, blocked: a.blocked ?? (Object.entries(a.cost).some(([k, v]) => c.game.resources[k as keyof typeof c.game.resources] + v! <= 4) ? 'Недостаточно ресурса: нужен остаток выше 4' : null) }));
}
export function decideChapter(c: Chapter, id: string): Chapter {
  const selected = chapterOptions(c).find(a => a.id === id);
  if (!selected || selected.blocked) throw new Error(selected?.blocked ?? 'Решение недоступно в этой сцене');
  let next: Chapter = { ...c, decisions: [...c.decisions, id], report: '' };
  switch (c.stage) {
    case 'goal': return { ...next, goal: id.slice(5) as ChapterGoal, stage: 'appoint', report: 'На первой странице программы секретарь записывает ваш приоритет. Цифры теперь станут мерой результата, а не украшением речи.' };
    case 'appoint': next.game = interveneWorld(c.game, id); next.report = next.game.world!.dispatches.at(-1)!.text; next.stage = 'support'; return tick(next);
    case 'support': case 'lastOrder':
      if (id !== 'keep') { next.game = interveneWorld(c.game, id); next.report = next.game.world!.dispatches.at(-1)!.text; }
      else next.report = 'Нового поручения нет. Руководитель получает отметку «продолжать по действующему плану».';
      next.stage = c.stage === 'support' ? 'call' : 'press'; next = tick(next);
      if (c.stage === 'lastOrder') next.firstYearProgress = next.game.world!.health!.progress;
      return next;
    case 'call': {
      const contract = id.slice(9) as ChapterContract;
      let game = pay(c.game, selected.cost);
      game = relations(game, contract === 'minister' ? 12 : contract === 'doctor' ? -18 : 3, contract === 'minister' ? -10 : contract === 'doctor' ? 10 : 3);
      const cooperative = game.resources.economy >= 25 && ['doctor', 'healthMinister'].every(id => worldPerson(game, id as 'doctor' | 'healthMinister')!.relation > -20);
      const old = game.world!.health!;
      const executor = contract === 'joint' ? old.executor : contract === 'minister' ? 'healthMinister' as const : 'doctor' as const;
      // Transfer has the same quarter delay as replacement in the world model.
      const health = { ...old, executor, cover: contract === 'doctor' || contract === 'joint' && cooperative || old.cover,
        lastFactors: executor !== old.executor ? ['Передача дел'] : [...old.lastFactors] };
      next = { ...next, game: { ...game, world: { ...game.world!, health } }, contract, stage: 'lastOrder',
        report: contract === 'minister' ? '«Тогда назначения идут через меня», — говорит министр. Он забирает кадровые папки. Врач остаётся участником программы, но лишается самостоятельного доступа к решениям. К концу года предстоит оплатить договор ещё двумя пунктами политкапитала.'
          : contract === 'doctor' ? 'Вы просите соединить врача с министром на одной линии. «По кадровому плану он обращается прямо ко мне». Министр отвечает после паузы: «В таком случае ответственность тоже ваша». Политическая защита получена; ведомственная дружба — нет.'
          : cooperative ? 'Министр сохраняет участие, исполнитель — своё поручение. Вы утверждаете совместное согласование назначений и прямой доступ в резиденцию. Оба согласны работать по этому мандату; компромисс стоит денег и времени кабинета.' : 'Совместный мандат подписан, но сотрудничества нет: бюджет слишком слаб или отношения с одним из участников враждебны. Дополнительной политической поддержки исполнитель не получает.' };
      return tick(next);
    }
    case 'press': return { ...next, press: id.slice(6) as Chapter['press'], stage: 'followup', report: '' };
    case 'followup':
      if (c.press === 'blame') {
        const executor = c.game.world!.health!.executor;
        next.game = executor === 'doctor' ? relations(c.game, 0, -10) : executor === 'healthMinister' ? relations(c.game, -10, 0)
          : { ...c.game, keyFigures: c.game.keyFigures.map(f => f.id === worldPerson(c.game, 'governor')?.figure ? { ...f, relation: cap(f.relation - 10, -100) } : f), world: { ...c.game.world!, people: c.game.world!.people.map(p => p.id === 'governor' ? { ...p, relation: cap(p.relation - 10, -100) } : p) } };
      }
      next.promise = id === 'promise'; next.promiseProgress = next.promise ? c.game.world!.health!.progress : null;
      next.report = next.promise ? `Камеры продолжают снимать. В стенограмме остаётся число: ${next.promiseProgress}% и срок — конец второго года. Это обещание будет проверено по итоговому докладу.` : 'Журналист записывает отказ от нового срока. Вы не получили красивого заголовка, зато не выдали будущие назначения за уже обеспеченный результат.';
      if (c.press === 'blame') next.report += '\n\nИсполнитель увидел, что резиденция публично отодвинулась от него. Его отношение −10; поручение осталось за ним.';
      next.stage = 'briefing'; return tick(next);
    case 'briefing': next.stage = 'response'; return tick(next);
    case 'response':
      if (id !== 'keep') { next.game = interveneWorld(c.game, id); next.report = next.game.world!.dispatches.at(-1)!.text; }
      else next.report = 'Вы не подписываете новое поручение. Учреждения продолжат ждать ответа до установленного срока.';
      next.stage = 'execution'; return tick(next);
    case 'execution': {
      next.stage = 'end'; next = tick(next);
      if (next.promise) {
        const met = keptPromise(next);
        next.game = pay(next.game, { internalLegitimacy: met ? 2 : -3 });
        next.report += `\n\nПубличное обещание ${met ? 'выполнено. Легитимность +2' : 'нарушено. Легитимность −3'}: ${promiseReason(next)}.`;
      }
      return next;
    }
    case 'end': throw new Error('Глава завершена');
  }
}
export function keptPromise(c: Chapter): boolean {
  const health = c.game.world!.health!;
  return c.promise && health.progress >= c.promiseProgress! && health.aftermath?.outcome === 'fulfilled'
    && ['payroll', 'lean', 'replacement', 'pilot'].includes(health.aftermath.response ?? '');
}
export function promiseReason(c: Chapter): string {
  const health = c.game.world!.health!;
  return `обещано сохранить ${c.promiseProgress}% ставок; сейчас ${health.progress}%; ${keptPromise(c) ? 'план сохранения помощи исполнен' : 'подтверждённого исполнения плана сохранения помощи нет'}`;
}
export function goalMet(c: Chapter): boolean {
  const h = c.game.world!.health!;
  if (c.goal === 'reach') {
    // First-year target is measured at the press conference, before later closures.
    return c.firstYearProgress !== null && c.firstYearProgress >= 90;
  }
  return c.goal === 'lasting' ? h.approach === 'permanent' && h.progress >= 75 && h.aftermath?.outcome === 'fulfilled' && ['payroll', 'lean'].includes(h.aftermath.response ?? '')
    : c.goal === 'reserve' && c.game.resources.economy >= 45 && h.progress >= 60;
}
export function serializeChapter(c: Chapter): string { return JSON.stringify({ version: 1, decisions: c.decisions }); }
export function restoreChapter(base: Chapter, raw: string): Chapter | null {
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.decisions) || value.decisions.length > 10 || !value.decisions.every((id: unknown) => typeof id === 'string')) return null;
    return value.decisions.reduce((c: Chapter, id: string) => decideChapter(c, id), base);
  } catch { return null; }
}
export function chapterScene(c: Chapter): SceneKey {
  return c.stage === 'call' ? 'phone' : ['press', 'followup'].includes(c.stage) ? 'press' : ['support', 'lastOrder', 'response', 'execution'].includes(c.stage) ? 'hospital' : c.stage === 'end' ? 'square' : 'cabinet';
}
