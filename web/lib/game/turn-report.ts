import { ALTERNATE_RANDOM_EVENTS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { GameState, TurnReport } from './types.ts';

// #260: итог хода 1978 года отделяет то, что сделала подпись президента, от того, что случилось в квартале помимо неё:
// эхо прежних решений, выборы, жизнь ведомств, предвестия интриги. Игрок не должен приписывать весь итог последней подписи.

/** Абзац-разделитель газеты: всё после него — не следствие сегодняшней резолюции. */
export const QUARTER_MARK = 'В том же квартале';

export interface QuarterSplit {
  own: string;      // сцена исполнения и то, что вызвала сама подпись
  other: string[];  // остальное в квартале, по абзацам
}

/** Делит газету на часть о резолюции и часть «В том же квартале». Без разделителя всё относится к резолюции. */
export function splitQuarter(narrative: string): QuarterSplit {
  const paragraphs = String(narrative ?? '').split(/\n\n+/);
  const mark = paragraphs.findIndex(paragraph => paragraph.trim() === QUARTER_MARK);
  if (mark < 0) return { own: narrative, other: [] };
  return {
    own: paragraphs.slice(0, mark).join('\n\n'),
    other: paragraphs.slice(mark + 1).map(paragraph => paragraph.trim()).filter(Boolean),
  };
}

// Подписи движка общие для всех кампаний; в 1978 году в ведомости они звучат языком мира, а не правил игры.
// Смысл не меняется: «давление обстоятельств» — общий спад по сложности, «институты восстанавливаются» — подтягивание
// просевших опор. Новых причин здесь не придумываем.
const HISTORICAL_SOURCE: Readonly<Record<string, string>> = {
  'решение': 'ваша резолюция',
  'давление обстоятельств': 'трудности квартала',
  'институты восстанавливаются': 'ведомства выправляют положение',
};
const BACKGROUND = new Set(ALTERNATE_RANDOM_EVENTS.map(event => event.title.toLowerCase()));

/** Подпись строки ведомости «из чего сложилась перемена». Архивные кампании — без изменений. */
export function sourceLabel(gs: Pick<GameState, 'country'>, report: Pick<TurnReport, 'matured'> | null | undefined, label: string): string {
  if (gs.country !== ALTERNATE_COUNTRY) return label;
  if (HISTORICAL_SOURCE[label]) return HISTORICAL_SOURCE[label];
  // Отложенное последствие прошлой подписи: движок пишет его название строчными.
  if (report?.matured?.some(pending => pending.label.toLowerCase() === label)) return `по прежней подписи: ${label}`;
  if (BACKGROUND.has(label)) return `вне резолюции: ${label}`;
  return label;
}
