// Короткий ход: что игрок видит сразу, а что — по «Подробнее».
// Дело и газета делятся по абзацам: завязка видна целиком, остальное раскрывается нажатием.
// Абзацы не режутся посередине — текст остаётся литературным, просто короче.

export const CASE_LEAD = { limit: 90, least: 40 };     // дело: завязка до 90 слов, но не меньше 40, если текст длиннее
export const NEWS_LEAD = { limit: 30, least: 12 };     // газета: первый абзац, второй — только если первый совсем короткий
export const TAIL_LEAST = 20;                          // хвост короче этого не прячем: «Подробнее» ради одной фразы не нужно
export const TOP_CHANGES = 3;                          // «Что изменилось»: три самые заметные перемены

export const wordCount = (text: string) => (text.match(/[\p{L}\d]+(?:[-‐][\p{L}\d]+)*/gu) ?? []).length;

export interface Lead {
  lead: string[];
  rest: string[];
}

// Абзацы идут в завязку, пока она не наберёт `least` слов или пока следующий абзац помещается в `limit`.
export function splitLead(text: string, { limit, least }: { limit: number; least: number }): Lead {
  const paragraphs = String(text ?? "").split(/\n\n+/).map(part => part.trim()).filter(Boolean);
  const lead: string[] = [];
  let words = 0;
  for (const paragraph of paragraphs) {
    const size = wordCount(paragraph);
    if (lead.length && words >= least && words + size > limit) break;
    lead.push(paragraph);
    words += size;
  }
  const rest = paragraphs.slice(lead.length);
  if (wordCount(rest.join(" ")) < TAIL_LEAST) return { lead: paragraphs, rest: [] };
  return { lead, rest };
}

export interface LedgerRow {
  k: string;
  delta: number;
  rel?: boolean;
}

// Свёрнутая ведомость: три самых заметных перемены — ресурсы и группы вместе, по величине сдвига.
// Развёрнутая — всё: сначала ресурсы в обычном порядке, затем группы по величине.
export function ledgerRows<Row extends LedgerRow>(rows: Row[], full: boolean): { shown: Row[]; hidden: number } {
  const byDelta = (a: Row, b: Row) => Math.abs(b.delta) - Math.abs(a.delta);
  const resources = rows.filter(row => !row.rel);
  const groups = rows.filter(row => row.rel).sort(byDelta);
  if (full) return { shown: [...resources, ...groups], hidden: 0 };
  // Ресурс важнее группы при равном сдвиге: от ресурсов зависит, удержится ли власть.
  const top = [...resources, ...groups].sort(byDelta).slice(0, TOP_CHANGES);
  const shown = [...resources.filter(row => top.includes(row)), ...groups.filter(row => top.includes(row))];
  return { shown, hidden: rows.length - shown.length };
}
