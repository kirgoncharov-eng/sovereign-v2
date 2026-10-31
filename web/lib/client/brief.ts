// Короткий ход: что игрок видит сразу, а что — по «Подробнее».
// Дело и газета делятся по абзацам: завязка видна целиком, остальное раскрывается нажатием.
// Абзацы не режутся посередине — текст остаётся литературным, просто короче.

export const CASE_LEAD = { limit: 90, least: 40 };     // дело: завязка до 90 слов, но не меньше 40, если текст длиннее
export const NEWS_LEAD = { limit: 30, least: 12 };     // газета: первый абзац, второй — только если первый совсем короткий
export const TAIL_LEAST = 20;                          // хвост короче этого не прячем: «Подробнее» ради одной фразы не нужно
export const TOP_CHANGES = 3;                          // «Что изменилось»: строк в свёрнутой ведомости, если опор мало

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

// Газета не повторяет заголовок: если рассказ начинается той же фразой, что и заголовок, она убирается.
// Сравниваются слова без регистра и знаков — «Банк выдал комплект.» и «Банк выдал комплект» совпадают.
const normalized = (text: string) => (text.toLowerCase().match(/[\p{L}\d]+/gu) ?? []).join(" ");

export function leadsWithHeadline(narrative: string, headline: string): boolean {
  const target = normalized(headline);
  const first = String(narrative ?? "").split(/\n\n+/)[0].split(/(?<=[.!?…])\s+/)[0];
  return !!target && normalized(first) === target;
}

export function withoutHeadline(narrative: string, headline: string): string {
  if (!leadsWithHeadline(narrative, headline)) return narrative;
  const [first, ...others] = String(narrative ?? "").split(/\n\n+/);
  const sentences = first.split(/(?<=[.!?…])\s+/);
  const remainder = sentences.slice(1).join(" ").trim();
  return [remainder, ...others].filter(Boolean).join("\n\n");
}

export interface LedgerRow {
  k: string;
  delta: number;
  rel?: boolean;
}

// #284: свёрнутая ведомость показывает все изменившиеся опоры — это цена подписи — и самые заметные перемены лагерей:
// столько, чтобы вместе вышло три строки, но хотя бы один лагерь, если они менялись. Развёрнутая — всё:
// сначала опоры в обычном порядке, затем лагеря по величине сдвига.
export function ledgerRows<Row extends LedgerRow>(rows: Row[], full: boolean): { shown: Row[]; hidden: number } {
  const resources = rows.filter(row => !row.rel);
  const groups = rows.filter(row => row.rel).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (full) return { shown: [...resources, ...groups], hidden: 0 };
  const groupCount = Math.min(groups.length, Math.max(1, TOP_CHANGES - resources.length));
  const shown = [...resources, ...groups.slice(0, groupCount)];
  return { shown, hidden: rows.length - shown.length };
}
