// Описание дела «Приложение к договору 1956 года» по исходу расследования «Четвёртый экземпляр» (#178).
import { ARCHIVE_FOUND, ARCHIVE_MEMORY } from "../content/archive-memory.ts";
import type { GameState } from "./types.ts";

export const ARCHIVE_CARD = "alt_archive";
const INDUSTRIAL_ARC = "alt_contracts";
const ENDINGS = Object.keys(ARCHIVE_MEMORY) as (keyof typeof ARCHIVE_MEMORY)[];
// Флаги, после которых приложение у игрока на руках: банк выдал комплект или кредитор — заверенную копию.
const FOUND = ["ok:audit", "ok:case"];

// null — расследования в этом сроке не было или приложения игрок не видел: остаётся текст карточки.
export function archiveDescription(state: GameState): string | null {
  const arc = state.arc;
  if (arc?.id !== INDUSTRIAL_ARC) return null;
  const ending = [...arc.flags].reverse().find((flag): flag is keyof typeof ARCHIVE_MEMORY => (ENDINGS as string[]).includes(flag));
  if (ending) return arc.flags.includes(`ok:${ending}`) ? ARCHIVE_MEMORY[ending].ok : ARCHIVE_MEMORY[ending].failed;
  return FOUND.some(flag => arc.flags.includes(flag)) ? ARCHIVE_FOUND : null;
}
