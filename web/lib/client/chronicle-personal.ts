// «Хроника срока» (#298): редкая личная строка между решениями — цена должности, а не симулятор быта.
// Не больше одной строки за квартал; обычно не два квартала подряд — кроме первой ночи и кануна выборов,
// которые звучат в свой квартал. Каждая строка звучит один раз за срок.
// Всё во втором лице «вы» без рода: пол президента в строке не угадывается. Семья — один намёк за срок.
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { hashSeed } from '../game/engine.ts';
import type { GameState } from '../game/types.ts';

export interface PersonalMemory {
  used: string[];
  lastTurn: number | null; // after.turn квартала, где прозвучала прошлая строка
}

export const EMPTY_PERSONAL: PersonalMemory = { used: [], lastTurn: null };

interface Moment {
  before: GameState;
  after: GameState;
  month: number; // месяц следующего решения, 0–11
}

interface PersonalBeat {
  id: string;
  text: string;
  when: (moment: Moment) => boolean;
  urgent?: boolean;   // звучит в свой квартал, не дожидаясь случая
  priority?: boolean; // если квартал выпал на личную строку — сначала эти: они о том, что происходит сейчас
  first?: boolean;    // стоит первой строкой квартала, сразу после подписи
}

const wagesCard = ALTERNATE_EVENTS.find(card => card.id === 'alt_wages');

const paidWages = ({ after }: Moment) => {
  const first = after.history[0];
  return !!wagesCard && first?.title === wagesCard.title && first.choice === wagesCard.choices[0].text && first.success !== false;
};

const OLD_LIFE: Record<string, string> = {
  officer: 'Бывший сослуживец просит о встрече. В приёмной ему отвечают, что график расписан на два месяца вперёд. '
    + 'Вы узнаёте об этом из отчёта охраны.',
  economist: 'В институте, где вы работали, ваш старый расчёт по зарплатам разбирают на семинаре. Студенты спорят, ошибся ли автор.',
  lawyer: 'Бывший подзащитный пишет из Гродно: его снова вызывают на допрос. Письмо приходит через канцелярию с пометкой «для сведения».',
  diplomat: 'Бывший коллега по торгпредству поздравляет с должностью. Письмо прочитали до вас: на конверте две печати.',
  mayor: 'Из вашего прежнего города пишут: на заводе, где вы когда-то выступали, сменили директора. Вас об этом не спросили.',
};

export const PERSONAL_BEATS: PersonalBeat[] = [
  { id: 'first-night', urgent: true, first: true, when: ({ after }) => after.turn === 1,
    text: 'Первую ночь в резиденции вы почти не спите. Охрана сменяется каждые четыре часа, и под окном слышны шаги.' },
  { id: 'election-eve', urgent: true, when: ({ after }) => after.turn === 9 || after.turn === 19,
    text: 'Ночь перед голосованием. Секретарь оставляет на столе термос и уходит, не прощаясь.' },
  { id: 'driver', priority: true, when: moment => moment.after.turn <= 5 && paidWages(moment),
    text: 'Шофёр, не оборачиваясь, говорит, что брат с тракторного получил деньги. Больше он за всю дорогу ничего не говорит.' },
  { id: 'queue', priority: true, when: ({ after }) => after.resources.economy < 30,
    text: 'Из окна машины видна очередь у молочного магазина. Водитель сворачивает на другую улицу раньше, чем вы успеваете попросить.' },
  { id: 'walk', priority: true, when: ({ after }) => after.resources.internalLegitimacy < 35,
    text: 'Вы хотите пройти до площади пешком. Начальник охраны просит не делать этого хотя бы в этом месяце.' },
  { id: 'lift', priority: true, when: ({ after }) => after.resources.politicalCapital < 30,
    text: 'В лифте министр делает вид, что читает бумаги. Ещё недавно он заговаривал первым.' },
  { id: 'portrait', when: ({ after }) => after.turn >= 3,
    text: 'В приёмной вешают ваш официальный портрет. Фотограф просил улыбнуться; на снимке всё равно видна усталость.' },
  { id: 'drawing', when: ({ after }) => after.turn >= 4 && after.resources.internalLegitimacy >= 45,
    text: 'Школьница из Бреста прислала рисунок: резиденция и флаг над ней. Флаг не того цвета. Рисунок остаётся на столе.' },
  { id: 'birthday', when: ({ after }) => after.turn >= 5,
    text: 'День рождения. Торт из столовой резиденции, три тоста стоя. К девяти вечера все расходятся по кабинетам.' },
  { id: 'old-life', when: ({ after }) => after.turn >= 6 && !!OLD_LIFE[after.bio ?? ''],
    text: '' },
  { id: 'home', when: ({ after }) => after.turn >= 7,
    text: 'Звонок из дома. Вы обещаете перезвонить после совещания. Совещание заканчивается за полночь.' },
  { id: 'doctor', when: ({ after }) => after.turn >= 9 || after.resources.personalResource < 30,
    text: 'Врач резиденции записывает давление и ничего не говорит. На следующий день кофе вам приносят слабее.' },
  { id: 'snow', when: ({ after, month }) => after.turn >= 2 && (month === 10 || month === 11),
    text: 'Первый снег на площади. Дворники выходят раньше, чем вы дочитываете утреннюю сводку.' },
];

const textOf = (beat: PersonalBeat, state: GameState) => beat.id === 'old-life' ? OLD_LIFE[state.bio ?? ''] : beat.text;

/** Личная строка квартала или null. Детерминирована зерном партии и номером квартала. */
export function personalBeat(moment: Moment, memory: PersonalMemory): { text: string | null; first?: boolean; memory: PersonalMemory } {
  const { after } = moment;
  const fresh = PERSONAL_BEATS.filter(beat => !memory.used.includes(beat.id) && beat.when(moment));
  const resting = memory.lastTurn !== null && after.turn - memory.lastTurn < 2;
  const urgent = fresh.find(beat => beat.urgent);
  const chance = hashSeed(after.seed, 'personal', after.turn) % 5 < 2; // примерно два квартала из пяти
  const beat = urgent ?? (!resting && chance
    ? [...fresh].sort((a, b) => Number(!!b.priority) - Number(!!a.priority)
      || hashSeed(after.seed, 'beat', a.id) - hashSeed(after.seed, 'beat', b.id))[0]
    : undefined);
  if (!beat) return { text: null, memory };
  return { text: textOf(beat, after), first: beat.first, memory: { used: [...memory.used, beat.id], lastTurn: after.turn } };
}
