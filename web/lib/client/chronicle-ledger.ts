// Ведомость хроники: только представление фактических слагаемых уже рассчитанного квартала (#334).
// Подробности остаются текстом существующей строки ledger: версия и структура сохранения не меняются.
import { RESOURCE_NAME, RESOURCE_TITLE } from '../content/resource-names.ts';
import { sourceLabel } from '../game/turn-report.ts';
import type { GameState, ResourceKey } from '../game/types.ts';

const RESOURCE_KEYS = Object.keys(RESOURCE_NAME) as ResourceKey[];
const DANGER = 15;
const signed = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}`;

/** Первый абзац виден всегда; остальные раскрываются по желанию и не удлиняют паузу чтения. */
export function ledgerParts(text: string): { summary: string; details: string[] } {
  const [summary, ...details] = text.split('\n\n');
  return { summary, details: details.filter(Boolean) };
}

export function quarterLedger(before: GameState, after: GameState): string {
  // Перед резолюцией личное поручение уже могло быть оплачено. Движок сохранил начало квартала отдельно.
  const opening = after.prevResources ?? before.resources;
  const changes = RESOURCE_KEYS.filter(key => after.resources[key] !== opening[key])
    .map(key => `${RESOURCE_NAME[key]} ${signed(after.resources[key] - opening[key])}`);
  let summary = changes.length ? `К концу квартала: ${changes.join(', ')}.` : 'К концу квартала опоры власти не сдвинулись.';
  const low = RESOURCE_KEYS.filter(key => after.resources[key] <= DANGER);
  if (low.length && !after.ended) {
    summary += ` Опасно мало: ${low.map(key => `${RESOURCE_NAME[key]} — ${after.resources[key]}`).join(', ')}.`;
  }

  // В старом отчёте может не быть ведомости. Итог известен, но его причины не восстанавливаем догадкой.
  const sources = after.lastTurn?.sources;
  if (!sources || !Object.values(sources).some(entries => entries?.some(([, value]) => value !== 0))) return summary;

  const details = RESOURCE_KEYS.flatMap(key => {
    const entries = (sources[key] ?? []).filter(([, value]) => value !== 0);
    const change = after.resources[key] - opening[key];
    if (!entries.length && !change) return [];
    const lines = entries.map(([label, value]) => `${sourceLabel(after, after.lastTurn, label)}: ${signed(value)}`);
    const remainder = change - entries.reduce((sum, [, value]) => sum + value, 0);
    if (remainder) lines.push(`не расписано в ведомости: ${signed(remainder)}`);
    const total = change === 0 ? 'без перемены' : signed(change);
    return [`${RESOURCE_TITLE[key]}: ${opening[key]} → ${after.resources[key]} (${total})\n${lines.join('\n')}`];
  });
  return [summary, ...details].join('\n\n');
}
