// Календарь правления: ход — квартал, четыре хода в году. У каждого хода своя дата внутри квартала,
// день недели настоящий, погода — по сезону. Всё зависит от зерна партии: перезагрузка даты не меняет.
import { hashSeed } from "./engine.ts";

export const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
export type Season = "winter" | "spring" | "summer" | "autumn";

export interface TurnDate { year: number; month: number; day: number; weekday: string; season: Season }

// turn — номер хода от нуля (state.turn в момент, когда дело лежит на столе).
export function turnDate(seed: number, startYear: number, turn: number): TurnDate {
  const year = startYear + Math.floor(turn / 4);
  // Первый ход — сразу после инаугурации, в январе; дальше месяц внутри квартала выбирает зерно.
  const month = turn === 0 ? 0 : (turn % 4) * 3 + (hashSeed(seed, "month", turn) % 3);
  const day = 1 + (hashSeed(seed, "day", turn) % 28);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month, day)).getUTCDay()];
  const season: Season = month === 11 || month <= 1 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
  return { year, month, day, weekday, season };
}

export const monthYear = (d: Pick<TurnDate, "month" | "year">) => `${MONTHS[d.month]} ${d.year}`;
