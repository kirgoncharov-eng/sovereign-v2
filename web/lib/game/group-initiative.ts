// Один самостоятельный спор двух групп. Общий квартал и бюджет — из основной партии.
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { GameState, ResourceDelta } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';

export type GroupPhase = 'scouting' | 'offer' | 'backed' | 'conditions' | 'delegated' | 'dispute' | 'bargain' | 'shipping' | 'settled';
export type GroupOutcome = 'fuel' | 'shared' | 'small' | 'private' | 'lost' | 'withdrawn';
export interface GroupInitiative {
  phase: GroupPhase;
  opened: number;
  changed: number;
  due: number;
  cause: 'orders' | 'market';
  friendly: boolean;
  business: { id: string; name: string };
  regional: { id: string; name: string };
  mediator?: { id: string; name: string };
  outcome?: GroupOutcome;
  text: string;
}

export const groupNeedsReply = (g: GroupInitiative) => ['offer', 'dispute', 'bargain'].includes(g.phase);
const enabled = (gs: GameState) => gs.country === ALTERNATE_COUNTRY && !gs.daily && !gs.ended;
export const groupTitle = (g: GroupInitiative) => ({
  scouting: 'Палата ищет покупателя', offer: 'Экспортный заказ и местное топливо', backed: 'Заводы готовят экспортную партию',
  conditions: 'Области считают свою долю', delegated: 'Советник ведёт переговоры', dispute: 'Области удерживают топливо',
  bargain: 'Встречное предложение областей', shipping: 'Договорённость исполняется', settled: 'Судьба экспортного заказа',
})[g.phase];

const RESULTS: Record<GroupOutcome, { res: ResourceDelta; text: string }> = {
  fuel: { res: { economy: 6 }, text: 'Дополнительное топливо дошло до заводов. Палата отгрузила заказ, области сохранили местное снабжение. Выручка дала экономике +6; закупка топлива уже оплачена отдельным поручением.' },
  shared: { res: { economy: 4, internalLegitimacy: 2 }, text: 'Заводы отгрузили первую партию. Часть выручки по вашему условию осталась на районные склады топлива. Экономика +4, легитимность +2. У палатских компаний меньше прибыли, зато области готовы обсуждать следующий заказ.' },
  small: { res: { economy: 2 }, text: 'Покупатель принял меньшую партию. Заводы обошлись имеющимся топливом, областям не пришлось отдавать местный запас. Экономика +2. Крупный заказ на этих условиях не состоялся.' },
  private: { res: { economy: 1 }, text: 'Без президентского поручения палата и области согласовали маленькую поставку на собственных условиях. Государственных гарантий нет, местный запас сохранён. Экономика +1. Полную партию покупатель заказал у другого поставщика.' },
  lost: { res: { economy: -2 }, text: 'Палата и области не договорились о топливе. Срок покупателя истёк; подготовленная партия осталась на складах. Экономика −2. Гарантий президента не было, платить чужой долг казна не обязана.' },
  withdrawn: { res: {}, text: 'Палата остановила подготовку и уведомила покупателя об отказе. Области сохранили запас топлива. Новых бюджетных расходов нет; упущенный заказ не превращается в скрытый государственный долг.' },
};

/** Только предложения; общую квоту и платёж проверяет livingActions/interveneWorld. */
export function groupActions(gs: GameState): Omit<WorldAction, 'blocked'>[] {
  const g = gs.world?.groups;
  if (!enabled(gs) || !g || !groupNeedsReply(g) || gs.turn >= g.due) return [];
  const action = (key: string, title: string, detail: string, cost: ResourceDelta) => ({
    id: `groups:${g.phase}:${key}`, title, detail, cost,
  });
  if (g.phase === 'offer') {
    const advisor = gs.advisors.find(a => a.id === 'economist');
    return [
      action('back', 'Поддержать полный экспортный заказ',
        'Влияние −2. Палата получит вашу поддержку (+6 к отношению), областные советы увидят угрозу местному снабжению (−5). Через квартал они предъявят условия. Топливо этой подписью не оплачивается.', { politicalCapital: -2 }),
      action('conditions', 'Потребовать долю выручки для местного снабжения',
        'Влияние −3. Палата уступит часть прибыли (отношение −3), области получат место за столом (+5). Через квартал они предложат свой размер поставки и совместный резерв топлива.', { politicalCapital: -3 }),
      ...(advisor ? [action('delegate', `Поручить переговоры: ${advisor.name}`,
        'Влияние −1. К следующему кварталу советник должен согласовать долю областей. Компетентный и лояльный посредник принесёт компромисс; слабый, нелояльный или уволенный оставит открытый спор. Новые деньги без вашей подписи не выделяются.', { politicalCapital: -1 })] : []),
    ];
  }
  return [
    ...(g.phase === 'dispute' ? [action('fuel', 'Купить дополнительное топливо для полного заказа',
      'Экономика −4 сейчас. Через два квартала отгрузка принесёт экономике +6. Палата получит полный заказ (отношение +4), области сохранят свой запас (+2).', { economy: -4 })]
      : [action('shared', 'Согласовать заказ с районным резервом топлива',
        'Экономика −2, влияние −2 сейчас. Через два квартала: экономика +4, легитимность +2. Палата и области получат закреплённую долю (отношение обеих групп +4).', { economy: -2, politicalCapital: -2 })]),
    action('small', 'Сократить партию до имеющегося топлива',
      'Влияние −1 сейчас. Через два квартала: экономика +2. Палата потеряет часть заказа (отношение −4), области сохранят топливо (+3).', { politicalCapital: -1 }),
    action('withdrawn', 'Отказаться от заказа',
      'Без списания ресурсов. Палата потеряет заказ (отношение −6), области сохранят запас (+2). Ответ использует личное вмешательство квартала.', {}),
  ];
}

export function groupDecision(gs: GameState, world: LivingWorld, id: string): { text: string; factions: Record<string, number> } {
  const action = groupActions(gs).find(a => a.id === id);
  if (!action || !world.groups) throw Error('Это предложение групп больше не действует');
  const g = { ...world.groups, changed: gs.turn, due: gs.turn + 1 };
  world.groups = g;
  const key = id.split(':')[2];
  let business = 0, regional = 0;
  if (key === 'back') {
    g.phase = 'backed'; business = 6; regional = -5;
    g.text = 'Вы поддержали полный заказ. Палата начала готовить партию и запросила у областей топливо. Области ещё не соглашались менять местное снабжение; их ответ придёт через квартал.';
  } else if (key === 'conditions') {
    g.phase = 'conditions'; business = -3; regional = 5;
    g.text = 'Вы поставили условие: часть выручки должна остаться на местное снабжение. Палата передала расчёты областным советам. Их встречное предложение придёт через квартал.';
  } else if (key === 'delegate') {
    const advisor = gs.advisors.find(a => a.id === 'economist')!;
    g.phase = 'delegated'; g.mediator = { id: advisor.id, name: advisor.name };
    g.text = `${advisor.name} получает поручение свести требования палаты и областей. Доклад — через квартал; бюджет и гарантии до вашего ответа не меняются.`;
  } else {
    g.outcome = key as GroupOutcome;
    g.phase = key === 'withdrawn' ? 'settled' : 'shipping';
    g.due = gs.turn + (key === 'withdrawn' ? 0 : 2);
    [business, regional] = key === 'fuel' ? [4, 2] : key === 'shared' ? [4, 4] : key === 'small' ? [-4, 3] : [-6, 2];
    g.text = key === 'withdrawn' ? RESULTS.withdrawn.text
      : `Вы подписали: «${action.title}». ${action.detail} Подготовка и отгрузка займут два квартала; срок завершения — конец квартала ${g.due}.`;
  }
  return { text: g.text, factions: { [g.business.id]: business, [g.regional.id]: regional } };
}

/** Called once by the guarded world tick. Copies its branch before changing it. */
export function stepGroups(gs: GameState, world: LivingWorld, turn: number): { story: string | null; res: ResourceDelta } {
  const noChange = { story: null, res: {} };
  if (!enabled(gs) || turn <= (world.groups?.changed ?? -1)) return noChange;
  let g = world.groups;
  if (!g) {
    // Разное начало без расхода генератора событий. Только первый срок, не первые дела.
    if (turn < 6 + (gs.seed >>> 0) % 3 || turn > 14) return noChange;
    const business = gs.factions.find(f => f.bloc === 'business'), regional = gs.factions.find(f => f.bloc === 'regional');
    if (!business || !regional || gs.resources.economy > 50 && gs.resources.externalReputation < 50) return noChange;
    const cause = gs.resources.economy <= 50 ? 'orders' : 'market';
    g = { phase: 'scouting', opened: turn, changed: turn, due: turn + 1, cause, friendly: business.relation >= 0,
      business: { id: business.id, name: business.name }, regional: { id: regional.id, name: regional.name },
      text: `${business.name}: ${cause === 'orders' ? 'заводам не хватает заказов, и предприятия за свой счёт отправили образцы иностранному покупателю' : 'иностранный покупатель заинтересовался продукцией республики; предприятия за свой счёт отправили образцы'}. Палата ищет сбыт, не дожидаясь поручения президента. Для полной партии понадобится топливо из областных запасов.` };
    world.groups = g;
  } else {
    if (g.phase === 'settled' || turn < g.due) return noChange;
    g = { ...g, changed: turn };
    world.groups = g;
    if (g.phase === 'scouting') {
      g.phase = 'offer'; g.due = turn + 2;
      g.text = `${g.business.name}: покупатель готов взять партию оборудования. ${g.friendly ? 'Предприятия берут подготовку на себя и предлагают совместно решить вопрос топлива.' : 'Предприятия требуют приоритета в снабжении и уже разослали своё предложение газетам.'} ${g.regional.name} пока не отдают местный запас. Ответ нужен до конца квартала ${g.due}. Без ответа группы попробуют договориться сами; при враждебных отношениях заказ может сорваться (экономика −2), при согласии останется малая поставка (+1).`;
    } else if (['backed', 'conditions', 'delegated'].includes(g.phase)) {
      const mediator = g.mediator && gs.advisors.find(a => a.id === g!.mediator!.id && a.name === g!.mediator!.name);
      const agreed = g.phase === 'conditions' || g.phase === 'delegated' && mediator && mediator.skill >= 2 && (mediator.loyalty ?? 65) >= 40;
      const report = g.phase === 'delegated' ? mediator ? `${mediator.name}: ${agreed ? 'удалось согласовать долю областей' : 'стороны остались при своих требованиях'}. `
        : 'Назначенный посредник покинул совет. Новый советник не получил этого личного поручения; переговоры остались без доклада. ' : '';
      g.phase = agreed ? 'bargain' : 'dispute'; g.due = turn + 2;
      g.text = report + (agreed
        ? `${g.regional.name} предлагают оставить часть экспортной выручки на районный резерв топлива. Палата согласна на меньшую прибыль в обмен на поставку. Можно оплатить совместный резерв или сократить партию.`
        : `${g.regional.name} удерживают топливо: сначала местные котельные, затем экспорт. Палата требует приоритета для заводов. Можно купить дополнительное топливо или сократить заказ.`)
        + ` Ответ — до конца квартала ${g.due}. Без решения покупатель уйдёт, подготовленная партия останется на складах (экономика −2).`;
    } else if (g.phase === 'shipping') {
      g.phase = 'settled';
    } else {
      const friendly = [g.business.id, g.regional.id].every(id => (gs.factions.find(f => f.id === id)?.relation ?? -100) >= 0);
      g.outcome = g.phase === 'offer' && friendly ? 'private' : 'lost';
      g.phase = 'settled';
    }
    if (g.phase === 'settled') {
      g.due = turn;
      g.text = RESULTS[g.outcome!].text;
      return { story: g.text, res: RESULTS[g.outcome!].res };
    }
  }
  return { story: g.text, res: {} };
}

export function validGroups(value: unknown, turn: number): value is GroupInitiative {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const g = value as GroupInitiative;
  const int = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const actor = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
    && ['id', 'name'].every(k => typeof (v as Record<string, unknown>)[k] === 'string'
      && String((v as Record<string, unknown>)[k]).length > 0 && String((v as Record<string, unknown>)[k]).length < 200);
  if (!['scouting', 'offer', 'backed', 'conditions', 'delegated', 'dispute', 'bargain', 'shipping', 'settled'].includes(g.phase)
    || !int(g.opened) || g.opened < 6 || !int(g.changed) || g.changed < g.opened || g.changed > turn
    || !int(g.due) || g.due < g.changed || g.phase !== 'settled' && g.due <= g.changed
    || !['orders', 'market'].includes(g.cause) || typeof g.friendly !== 'boolean'
    || !actor(g.business) || !actor(g.regional) || g.business.id === g.regional.id
    || typeof g.text !== 'string' || !g.text.trim() || g.text.length > 4000
    || g.mediator !== undefined && !actor(g.mediator) || g.phase === 'delegated' && !g.mediator) return false;
  return ['shipping', 'settled'].includes(g.phase)
    ? !!g.outcome && Object.hasOwn(RESULTS, g.outcome) && (g.phase !== 'shipping' || ['fuel', 'shared', 'small'].includes(g.outcome))
    : g.outcome === undefined;
}
