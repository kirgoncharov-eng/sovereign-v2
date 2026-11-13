// Хроника (#426): то, что ведомость квартала уже посчитала, лента называет словами мира.
// На столе `/game` об этом писала газета: фон квартала, обещания, кризисы, закон, утечка советника, враждебный лагерь.
// Здесь только представление итога хода: ни одного нового расчёта, поля сохранения не меняются.
import { HOSTILE_DRAIN, HOSTILE_RELATION } from '../game/data.ts';
import { campaignCopy } from '../game/alternate-world.ts';
import { lawDef } from '../game/laws.ts';
import { promiseDef } from '../game/promises.ts';
import { RESOURCE_NAME } from '../content/resource-names.ts';
import type { GameState, ResourceDelta, ResourceKey } from '../game/types.ts';

export interface CountryLine {
  kind: 'country' | 'notice';
  who?: string;
  text: string;
  /** Короткая строка на случай, если лента уже печатала полную: тот же фон выпал второй раз за срок. */
  again?: string;
  /** Пояснение правила: лента дописывает его к строке один раз за срок. */
  once?: string;
}

export interface CountryLines {
  /** Следствие самой подписи: закон, обещание, перечёркнутое или исполненное этим решением. Стоит сразу после сцены. */
  own: CountryLine[];
  /** То, что случилось в стране помимо подписи: фон квартала. Стоит среди голосов и газет. */
  background: CountryLine[];
  /** Обещания, проверенные по сроку: срок — выборы, поэтому в квартале выборов они стоят в их блоке. */
  deadline: CountryLine[];
  /** Остальное в квартале: кризисы, утечки, враждебный лагерь. Стоит перед ведомостью. */
  quarter: CountryLine[];
}

const RESOURCE_KEYS = Object.keys(RESOURCE_NAME) as ResourceKey[];

const deltaWords = (delta: ResourceDelta | undefined) => RESOURCE_KEYS
  .filter(key => delta?.[key])
  .map(key => `${RESOURCE_NAME[key]} ${delta![key]! > 0 ? '+' : '−'}${Math.abs(delta![key]!)}`);

const unquoted = (pitch: string) => pitch.trim().replace(/[.…]+$/, '');

// Слово, перечёркнутое подписью: первая, вторая и следующие потери звучат по-разному.
const BROKEN_CLOSING = [
  'Те, кому оно было дано, этого не забудут.',
  'Второе слово, взятое назад, запоминают крепче первого.',
  'Вашим предвыборным словам теперь верят меньше.',
];
// Обещания, не исполненные к сроку, стоят в блоке выборов подряд: причина не повторяется дословно.
const OVERDUE_CAUSE = ['Срок вышел: к выборам оно не исполнено.', 'И это слово к выборам осталось словом.', 'К выборам не исполнено и оно.'];

/**
 * Обещания, статус которых сменился за квартал, и шаги к исполнению. Причина — из правил `stepPromises`:
 * до срока слово нарушает запретная подпись или сам президент на пресс-конференции, исполняет — нужное число решений;
 * в срок (ход выборов) проверяется всё остальное.
 */
function promiseLines(before: GameState, after: GameState): { own: CountryLine[]; deadline: CountryLine[] } {
  const own: CountryLine[] = [], deadline: CountryLine[] = [];
  const pressConference = !!before.currentEvent?.press;
  const was = new Map((before.promises ?? []).map(promise => [promise.id, promise]));
  // Сколько обещаний уже было нарушено к началу квартала: концовка строки не повторяется от обещания к обещанию.
  let brokenBefore = (before.promises ?? []).filter(promise => promise.status === 'broken').length;
  let overdue = 0;
  for (const promise of after.promises ?? []) {
    const old = was.get(promise.id), def = promiseDef(promise.id, after.country);
    if (!def || !old || old.status !== 'open') continue;
    const said = `«${unquoted(def.pitch)}», — говорили вы перед выборами.`;
    const due = after.turn >= def.due;
    if (promise.status === 'broken') {
      const bySignature = !due || def.goal.kind === 'never';
      const cause = !bySignature ? OVERDUE_CAUSE[Math.min(overdue++, OVERDUE_CAUSE.length - 1)]
        : pressConference ? 'Вы сами сняли его перед журналистами.' : 'Эта подпись его перечеркнула.';
      const closing = bySignature && !pressConference ? ` ${BROKEN_CLOSING[Math.min(brokenBefore, BROKEN_CLOSING.length - 1)]}` : '';
      brokenBefore++;
      (bySignature ? own : deadline).push({ kind: 'notice', who: 'Обещание нарушено', text: `«${def.title}». ${said} ${cause}${closing}` });
    } else if (promise.status === 'kept') {
      const bySignature = def.goal.kind === 'tags' && promise.progress > old.progress;
      (bySignature ? own : deadline).push({ kind: 'notice', who: 'Обещание исполнено',
        text: `«${def.title}». ${said} ${bySignature ? 'Эта подпись закрыла его.' : 'Срок вышел, слово сдержано.'}` });
    } else if (def.goal.kind === 'tags' && promise.progress > old.progress) {
      own.push({ kind: 'notice', who: 'Обещание', text: `«${def.title}»: сделан шаг, ${promise.progress} из ${def.goal.count}.` });
    }
  }
  return { own, deadline };
}

function lawLine(after: GameState): CountryLine[] {
  const law = after.lastTurn?.law;
  const def = law && lawDef(law.id);
  if (!law || !def) return [];
  const title = campaignCopy(def.title, after.country);
  const text = law.act === 'enact'
    ? law.passed ? `Закон «${title}» принят. Он действует со следующего квартала.` : `Законопроект «${title}» не набрал голосов.`
    : law.act === 'amend' ? `К закону «${title}» принята переходная льгота.`
      : law.passed ? `Закон «${title}» отменён.` : `Отменить закон «${title}» не удалось: он остаётся в силе.`;
  return [{ kind: 'notice', who: 'Парламент', text }];
}

// Кризисы опор в ленте 1978 года — вторым лицом и вещами того времени. Общие описания движка («Лидер измотан…»)
// остаются архиву; неизвестное название печатается с описанием движка.
const CRISIS_1978: Readonly<Record<string, string>> = {
  'Парламентский паралич': 'Законы не проходят: фракции торгуются за каждый голос, и повестку заседаний пишут уже не в резиденции.',
  'Коалиция на грани распада': 'Союзники в парламенте требуют новых условий. Без них большинства у кабинета нет.',
  'Бюджетный коллапс': 'Казна пуста: зарплаты учителям и врачам задержаны, казначейство платит по очереди.',
  'Банковская паника': 'У сберегательных касс очереди с утра: вкладчики забирают деньги, банки ограничивают выдачу.',
  'Брожение в армии': 'В гарнизонах обсуждают, кому подчиняться. Рапорты идут в обход министра.',
  'Силовики выходят из подчинения': 'Приказы исполняют выборочно. Какие исполнять, решают уже не в вашем кабинете.',
  'Международная изоляция': 'Послов отзывают на консультации, банки соседей придерживают кредит.',
  'Дипломатический бойкот': 'Делегации отменяют визиты; на приёмах в резиденции пустые кресла.',
  'Кризис доверия': 'Заявлениям резиденции не верят: любую новость люди сверяют со слухами.',
  'Улица против власти': 'На площадях собираются без разрешения, и с каждой неделей людей больше.',
  'Лидер на пределе': 'Вы измотаны. Решения даются всё тяжелее; врач резиденции просит отменить половину приёмов.',
  'Слухи о болезни лидера': 'В столице говорят, что вы больны. Опровержения только добавляют слухам веса.',
};

function crisisLines(after: GameState): CountryLine[] {
  const report = after.lastTurn;
  const lines: CountryLine[] = [];
  if (report?.newCrisis) {
    const drain = deltaWords(report.newCrisis.resourceDrain);
    const told = CRISIS_1978[report.newCrisis.title] ?? report.newCrisis.description;
    // Кризис длится несколько кварталов (`CRISIS_LIFETIME`) либо закрывается исполненным решением по нему.
    lines.push({ kind: 'notice', who: 'Новый кризис', text: `${report.newCrisis.title}. ${told}`
      + `${drain.length ? ` Пока кризис длится, каждый квартал: ${drain.join(', ')}.` : ''}`,
      once: 'Кризис длится несколько кварталов, если не закрыть его отдельным решением.' });
  }
  for (const title of report?.expiredCrises ?? []) {
    lines.push({ kind: 'notice', who: 'Кризис затих', text: `«${title}» больше не стоит в сводках. Решения по нему так и не было.` });
  }
  return lines;
}

/** Лагерь, который в этом квартале начал вредить: в ведомости появилась строка «вредят …», а кварталом раньше её не было. */
function hostileLines(before: GameState, after: GameState): CountryLine[] {
  const sources = after.lastTurn?.sources ?? {};
  const names = new Set(Object.values(sources).flatMap(entries => (entries ?? [])
    .flatMap(([label]) => label.match(/^вредят «(.+)»$/)?.[1] ?? [])));
  return [...names].flatMap(name => {
    const now = after.factions.find(faction => faction.name === name);
    const earlier = before.factions.find(faction => faction.name === name);
    if (!now || !earlier || earlier.relation <= HOSTILE_RELATION) return [];
    const drain = deltaWords(HOSTILE_DRAIN[now.bloc]);
    // Второй и следующие противники описаны другими словами: строка про каждого лагеря не должна читаться шаблоном.
    const others = before.factions.some(faction => faction.name !== name && faction.relation <= HOSTILE_RELATION);
    const turn = others ? 'тоже больше не скрывает вражды: его люди уходят с совещаний, а ваши поручения возвращаются без ответа.'
      : 'перешёл к открытому противодействию: ваши распоряжения вязнут, его люди отказываются от встреч.';
    return [{ kind: 'notice' as const, who: 'Открытый противник', text: `Лагерь «${name}» ${turn}`
      + `${drain.length ? ` Пока отношения не выправятся, каждый квартал: ${drain.join(', ')}.` : ''}` }];
  });
}

/** Строки квартала, о которых без них сообщала бы только ведомость. */
export function countryLines(before: GameState, after: GameState): CountryLines {
  const report = after.lastTurn;
  if (!report) return { own: [], background: [], deadline: [], quarter: [] };
  const promises = promiseLines(before, after);
  const event = before.currentEvent?.randomEvent;
  return {
    own: [...lawLine(after), ...promises.own],
    // Фон квартала берётся из небольшого набора и за срок может выпасть дважды: второй раз — одной строкой.
    background: event ? [{ kind: 'country', text: event.description,
      again: `И снова — ${event.title.charAt(0).toLowerCase()}${event.title.slice(1)}.` }] : [],
    deadline: promises.deadline,
    quarter: [
      ...crisisLines(after),
      ...(report.leaks ?? []).map(text => ({ kind: 'notice' as const, who: 'Утечка', text })),
      ...hostileLines(before, after),
    ],
  };
}
