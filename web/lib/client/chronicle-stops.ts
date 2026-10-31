// «Хроника срока» (#302): когда лента останавливается. Только представление: какие уже существующие обращения
// ждут ответа игрока и в каком порядке их показать. Ни цен, ни последствий здесь нет — их считает движок.
// Правило: лента стоит, если промолчать — значит изменить игру. Опись — docs/chronicle-inventory.md.
import { governmentBriefs } from './government-brief.ts';
import { presidentialMessages, type PresidentialMessage } from './presidential-inbox.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { POOL_TURNS, candidatePool, staffingOpen } from '../game/staffing.ts';
import type { GameState, Letter } from '../game/types.ts';

/** Опора у порога: столько и меньше. То же значение, что у строки ведомости «Опасно мало». */
export const DANGER = 15;
/** Сколько остановок, кроме дела, лента делает за квартал. Истекающее сейчас предел не откладывает (#302, гипотеза). */
export const EXTRA_STOPS = 2;

export type StopKind = 'letter' | 'proposal' | 'story' | 'staff';

export interface Stop {
  key: string;      // ключ обращения: тот же, что у письма в папке `/game`
  token: string;    // версия обращения: новая фаза — новая остановка
  kind: StopKind;
  title: string;
  person: string;   // id человека из personProfiles; у правительства — экономист
  deadline?: number;
  /** Письмо в папке `/game` — чтобы показать его теми же панелями. */
  message?: PresidentialMessage;
  /** Письмо человека из газеты квартала — на него отвечают до следующего дела. */
  letter?: Letter;
}

/** Что лента уже показала: ключ → версия, квартал и было ли напоминание. Хранится в сохранении хроники. */
export interface StopMemory {
  [key: string]: { token: string; kind: StopKind; turn: number; reminded: boolean; danger: boolean; urgent: boolean };
}

export const EMPTY_STOPS: StopMemory = {};

const pillarInDanger = (state: GameState) => RESOURCE_KEYS.some(key => state.resources[key] <= DANGER);

// Последний квартал срока ответа: напоминание приходит, даже если обращение уже откладывали.
const lastCall = (stop: Stop, turn: number) => stop.deadline !== undefined && stop.deadline - turn <= 1;
// Истекает сейчас: письмо человека пропадает со следующим делом, у обращения со сроком — последний квартал.
const isUrgent = (stop: Stop, turn: number) => stop.kind === 'story' || lastCall(stop, turn);

// Версия письма поручения в папке — последний доклад, и она меняется каждый квартал. Остановка же меняется только
// с вопросом: назначить исполнителя, ответить по графику врачей, исполнить ответ. Её срок — часть вопроса.
function replyToken(state: GameState, message: PresidentialMessage): string {
  const world = state.world!;
  if (message.action === 'energy') return `${world.project.status}@${message.deadline ?? ''}`;
  if (message.action === 'health' && world.health) {
    const aftermath = world.health.aftermath;
    return [world.health.status, aftermath?.phase ?? '', aftermath?.bargain?.phase ?? ''].join(':') + `@${message.deadline ?? ''}`;
  }
  return message.token;
}

/** Обращения, на которые сейчас нужен ответ, пока на столе дело. В порядке, в котором их приносит секретарь. */
export function openStops(state: GameState): Stop[] {
  if (state.daily || state.ended || !state.world || !state.currentEvent) return [];
  const messages = presidentialMessages(state);
  const replies: Stop[] = messages.filter(message => message.needsReply).map(message => ({
    key: message.key, token: replyToken(state, message), kind: 'letter', title: message.title, person: message.person,
    ...(message.deadline !== undefined ? { deadline: message.deadline } : {}), message,
  }));
  // Предложения правительства в `/game` помечены «для сведения», но без ответа программа не запустится.
  // Новое предложение — новая остановка: версия — набор ещё не запущенных программ.
  const proposed = governmentBriefs(state).filter(brief => brief.status === 'proposed').map(brief => brief.id).sort();
  const cabinet = messages.find(message => message.key === 'government-proposals');
  const proposals: Stop[] = cabinet && proposed.length ? [{
    key: cabinet.key, token: proposed.join(','), kind: 'proposal', title: cabinet.title, person: cabinet.person, message: cabinet,
  }] : [];
  const housing = messages.filter(message => message.key === 'housing-next').map(message => ({
    key: message.key, token: message.token, kind: 'proposal' as const, title: message.title, person: message.person, message,
  }));
  // Кадровый резерв обновляется раз в год: новый резерв — одна остановка. Без решения кресла остаются за прежними людьми.
  const staff: Stop[] = staffingOpen(state) && candidatePool(state).length ? [{
    key: 'staffing', token: `year:${Math.floor(state.turn / POOL_TURNS)}`, kind: 'staff', title: 'Кадровый резерв', person: '',
  }] : [];
  return [...replies, ...proposals, ...housing, ...staff];
}

/** Письма людей из газеты квартала, на которые ещё не ответили. Ответ возможен только до следующего дела. */
export function storyStops(state: GameState): Stop[] {
  if (state.daily || state.ended || state.currentEvent) return [];
  return (state.lastTurn?.letters ?? [])
    .filter(letter => letter.replies?.length && !state.storyReplies?.[letter.story])
    .map(letter => ({ key: `story:${letter.story}`, token: letter.story, kind: 'story', title: letter.from, person: letter.hero ?? '', letter }));
}

/**
 * Какие из открытых обращений остановят ленту в этом квартале. Показанное однажды не останавливает снова, пока
 * не сменится его версия, не наступит последний квартал срока или опора не окажется у порога (для предложений).
 * Не больше EXTRA_STOPS за квартал; то, что истекает сейчас, — всегда. Остальное ждёт следующего квартала.
 */
export function dueStops(state: GameState, stops: Stop[], memory: StopMemory): Stop[] {
  const danger = pillarInDanger(state);
  const due = stops.filter(stop => {
    const seen = memory[stop.key];
    if (!seen || seen.token !== stop.token) return true;
    if (lastCall(stop, state.turn) && !seen.reminded) return true;
    return stop.kind === 'proposal' && danger && !seen.danger;
  });
  const urgent = due.filter(stop => isUrgent(stop, state.turn));
  const rest = due.filter(stop => !urgent.includes(stop))
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
  // Предел считается за квартал целиком: остановки, уже показанные в этом квартале, тоже входят.
  const shown = Object.values(memory).filter(seen => seen.turn === state.turn && !seen.urgent).length;
  const room = Math.max(0, EXTRA_STOPS - shown - urgent.length);
  return [...urgent, ...rest.slice(0, room)];
}

/** Остановка показана: запомнить версию. Повторный показ в последний квартал срока — это напоминание. */
export function rememberStop(state: GameState, stop: Stop, memory: StopMemory): StopMemory {
  const seen = memory[stop.key];
  const reminded = lastCall(stop, state.turn) || (!!seen && seen.token === stop.token && seen.reminded);
  return { ...memory, [stop.key]: {
    token: stop.token, kind: stop.kind, turn: state.turn, reminded, danger: pillarInDanger(state), urgent: isUrgent(stop, state.turn),
  } };
}

/** Письмо папки, открытое игроком из справки: поручения и доклады, программы правительства, письма человека. */
export function letterStop(state: GameState, key: string): Stop | null {
  const open = openStops(state).find(stop => stop.key === key);
  if (open) return open;
  const message = presidentialMessages(state).find(item => item.key === key);
  return message ? { key, token: message.token, kind: message.action === 'government' ? 'proposal' : 'letter', title: message.title,
    person: message.person, message } : null;
}

/** Ждёт ли обращение ответа сейчас — иначе вместо «Отложить» лента предлагает «Дальше». */
export function stillWaiting(state: GameState, stop: Stop): boolean {
  if (stop.kind === 'story') return storyStops(state).some(other => other.key === stop.key);
  // Одно кадровое решение за квартал: после назначения резерв ещё открыт, но ответ уже дан.
  if (stop.kind === 'staff') return state.staffing?.lastTurn !== state.turn && openStops(state).some(other => other.key === stop.key);
  return openStops(state).some(other => other.key === stop.key && other.token === stop.token);
}
