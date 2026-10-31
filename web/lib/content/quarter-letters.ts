// Письма папки квартала кампании 1978 года (#244): человек говорит от первого лица и о своём интересе,
// цифры — в одной строке канцелярии в конце. Архив шести стран пишет прежними формулировками своих генераторов.
import type { ResourceDelta } from '../game/types.ts';

const signed = (quote: string, name?: string | null) => `«${quote}»${name ? ` — ${name}` : ''}.`;
const signedNumber = (value: number) => `${value > 0 ? '+' : ''}${value}`.replace('-', '−');

// Строка канцелярии: проценты, сроки и последствия, которые раньше звучали в речи людей.
// Пункты — со строчной; «Компетенция Имя: 2/3» становится «компетенция руководителя 2/3».
export function chancery(parts: (string | false | null | undefined)[]): string {
  const lines = parts.filter((part): part is string => !!part)
    .map(part => part.replace(/^Компетенция [^:]+: (\d\/3)$/, 'компетенция руководителя $1'))
    .map(part => part.charAt(0).toLowerCase() + part.slice(1));
  return lines.length ? ` Канцелярия: ${lines.join(' · ')}.` : '';
}

// Для показа в папке: голос человека и строка канцелярии отдельно (в газете и истории они идут одним текстом).
export function splitChancery(text: string): { voice: string; chancery: string | null } {
  const at = text.indexOf(' Канцелярия: ');
  return at < 0 ? { voice: text, chancery: null } : { voice: text.slice(0, at), chancery: text.slice(at + 1) };
}

export function consequences(res: ResourceDelta): string {
  const names: Partial<Record<keyof ResourceDelta, string>> = {
    economy: 'экономика', internalLegitimacy: 'легитимность', externalReputation: 'репутация',
    politicalCapital: 'политкапитал', personalResource: 'личный ресурс', military: 'силовики',
  };
  const parts = Object.entries(res).filter(([, value]) => value)
    .map(([key, value]) => `${names[key as keyof ResourceDelta] ?? key} ${signedNumber(value!)}`);
  return parts.length ? `последствия: ${parts.join(', ')}` : '';
}

// Энергосеть.
export function energyFirstLetter(minister: string, engineer: string, governor: string): string {
  return `${minister}, министр энергетики, переслал письмо диспетчерской с припиской. Диспетчерская: «Узлы изношены, свет отключаем `
    + `по графику. Заводы заканчивают смены раньше, больница просит не отодвигать жилые кварталы. Узлы нужно заменить в течение года». `
    + `Приписка министра: «Если поручите — возьму работу под личный контроль. ${engineer} считает, что нынешний поставщик требует `
    + `переделки оборудования, а новый договор дороже. ${governor} обещает местных подрядчиков, если им оставят заказы. Решать вам, кому».`;
}

export function energyWithoutOrder(minister: string, firstReminder: boolean): string {
  return firstReminder
    ? signed('Диспетчерская ждёт ответа второй квартал. Из региона спрашивают меня, кто отвечает за сеть, — мне нечего им сказать', minister)
    : signed('Из региона пишут снова. Без решения резиденции местные власти обошлись временным ремонтом, заводы так и работают '
      + 'по сокращённому графику', minister);
}

export function energyProgress(executor: string, progress: number, situation: string, factors: string[]): string {
  return `${signed(situation.replace(/\.$/, ''), executor)}${chancery([`восстановлено ${progress}% сети`, ...factors])}`;
}

export function energyEnding(ending: string, speaker: string, executorAssigned: boolean, progress: number, factors: string[],
  res: ResourceDelta): string {
  const quote = executorAssigned ? ending : `${ending} Работы так и не начались: не было ни руководителя, ни денег.`;
  return `${signed(quote.replace(/\.$/, ''), speaker)}${chancery([`восстановлено ${progress}% сети`, ...factors, consequences(res)])}`;
}

// Районные больницы.
// Занятость местной власти — факт партии: губернатор действительно ведёт энергосеть, а не фраза для всех (#310, C04).
export function healthFirstLetter(doctor: string, healthMinister: string, governorOnEnergy: boolean): string {
  const local = governorOnEnergy
    ? 'Местная власть помогла бы с назначениями, но губернатор уже ведёт энергосеть.'
    : 'Местная власть может помочь с назначениями.';
  return signed(`Кабинеты и койки есть — врачей нет. Прошу за год укомплектовать районные отделения. ${healthMinister} предлагает `
    + `постоянный набор. ${local} Можно временно перевести врачей `
    + 'из области: быстро, но области останутся без своих', `${doctor}, главный врач`);
}

export function healthWithoutOrder(doctor: string): string {
  return signed('Решения резиденции всё нет. Койки есть, но кабинеты без специалистов закрыты; пациентов возим в областной центр', doctor);
}

export function healthProgress(executor: string, progress: number, situation: string, factors: string[]): string {
  return `${signed(situation, executor)}${chancery([`укомплектовано ${progress}%`, ...factors])}`;
}

export function healthEnding(ending: string, speaker: string, progress: number, factors: string[], next: string, res: ResourceDelta): string {
  return `${signed(ending.replace(/\.$/, ''), speaker)}${chancery([`укомплектовано ${progress}%`, ...factors, next, consequences(res)])}`;
}

export function healthFollowup(text: string, res: ResourceDelta): string {
  return `${text}${chancery([consequences(res)])}`;
}

export function healthAnswerReminder(doctor: string, cause: string): string {
  return `${signed('Ответа по больницам всё нет. Прошу подписать решение до следующего квартального доклада', doctor)} `
    + `Причина остаётся прежней: ${cause}`;
}

export function healthExecution(executor: string, order: string): string {
  return signed(`Поручение „${order}“ принял. Согласования идут; итог доложу в папке следующего квартала`, executor);
}

// Программы правительства и следующий этап жилья.
const SPEECH: Readonly<Record<string, string>> = {
  'Координатор делит время между программами': 'я делю время между программами',
  'Координатор ведёт другую программу': 'я веду ещё одну программу',
};
const HINDRANCE = /−\d|тормоз|затягива|задержива|делит время|ведёт другую|не поддерживает|удерживает|ушёл|останов|Передача|Остались|Новая площадка/;

function spoken(factor: string): string {
  const plain = factor.replace(/:\s*[−-]\d.*$/, '');
  const known = Object.entries(SPEECH).find(([start]) => plain.startsWith(start));
  return known ? known[1] : plain.charAt(0).toLowerCase() + plain.slice(1);
}

function quality(factor: string): string {
  return factor.replace(/^.*?:\s*(качество работы \d\/3)$/, '$1');
}

export function programReport(name: string | null, progress: number, factors: string[], outcome: 'running' | 'completed' | 'partial' | 'failed',
  tail?: string): string {
  const hindrance = factors.slice(1).find(factor => HINDRANCE.test(factor));
  const quote = outcome === 'completed' ? 'Программа исполнена'
    : outcome === 'partial' ? 'Программа выполнена частично: срок вышел раньше, чем мы закончили'
    : outcome === 'failed' ? 'Срок сорван: до результата программу не довели'
    : hindrance ? `Работа идёт, но мешает вот что: ${spoken(hindrance)}` : 'Работа идёт по плану';
  return `${signed(quote, name)}${chancery([`выполнено ${progress}%`, quality(factors[0] ?? ''), ...factors.slice(1), tail])}`;
}

export function housingNextProposal(coordinator: string, progress: number): string {
  const missing = progress === 100 ? 'нет сетей, никто не заселён' : 'остались работы, нет сетей, никто не заселён';
  const offer = progress === 100 ? 'оплатить сети и заселение или перевести команду на новую площадку' : 'оплатить оставшиеся работы, сети и заселение';
  return `${coordinator} разворачивает карту района: «Стройка дала ${progress}%, но жить в домах пока нельзя: ${missing}. `
    + `Следующее поручение может ${offer}. Условия — ниже; решать сейчас не обязательно».`;
}

export function housingNextQuote(name: string, progress: number, factors: string[], terminal: false | 'completed' | 'partial' | 'failed',
  settle: boolean): string {
  const quote = terminal === 'completed'
    ? settle ? 'Район подключён к сетям, дома готовы к заселению' : 'Новый район построен'
    : terminal ? 'Полного результата нет: готовность района не объявлена'
    : undefined;
  if (!quote) return programReport(name, progress, factors, 'running');
  const tail = terminal && !settle ? 'подключение и заселение первого района этим бюджетом не оплачены' : undefined;
  return `${signed(quote, name)}${chancery([`выполнено ${progress}%`, quality(factors[0] ?? ''), ...factors.slice(1), tail])}`;
}

// Министр просит закупочный мандат: просьба — его словами, условия — строкой канцелярии.
export function mandateOffer(minister: string, due: number): string {
  return `${minister} сам просит встречу. «Энергосеть можно ускорить через аппарат. В следующей жилищной программе дайте мне право `
    + `выбирать подрядчиков».${chancery(['энергосеть +4 работы сейчас', 'позже жильё +5 работы, но экономика −1 каждый квартал',
      'проверке закупок понадобится прямой доступ к документам, иначе −5 работы', `ответ до конца квартала ${due}`])}`;
}

export function governmentProposals(advisor: string, notStarted: number): string {
  const words = ['ни одна не начата', 'одна ещё не начата', 'две ещё не начаты', 'три ещё не начаты', 'четыре ещё не начаты', 'все пять ещё не начаты'];
  return signed(`Кабинет подготовил пять программ, ${words[Math.min(notStarted, 5)]}. В каждой — бюджет, ожидаемый результат и риски. `
    + 'Любую можно отдать кабинету, одну — взять под личный контроль. Программы подождут, пока у вас дойдут до них руки',
  `${advisor}, экономический советник`);
}

// Почему поручение нельзя подписать: ресурс и порог вместо «недостаточно запаса».
const RESOURCE_GENITIVE: Readonly<Record<string, string>> = {
  economy: 'экономики', politicalCapital: 'политкапитала', personalResource: 'личного ресурса',
  externalReputation: 'репутации', internalLegitimacy: 'легитимности', military: 'силовиков',
};

export function reserveShortage(resource: string, after: number): string {
  return `Не хватает ${RESOURCE_GENITIVE[resource] ?? resource}: после подписи останется ${Math.max(0, after)}, а запас ниже 5 не тратится`;
}
