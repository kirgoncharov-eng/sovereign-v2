// «Дело дня» и очки партии — общие для клиента и сервера.
import { ALTERNATE_COUNTRY, ALTERNATE_DAILY_FROM, LEGACY_COUNTRIES } from "./alternate-world.ts";
import { promisesBroken, promisesKept } from "./promises.ts";
import { computePolls, hashSeed, isSurvival, seededRandom } from "./engine.ts";
import { END_BONUS } from "./terms.ts";
import { IDEOLOGIES, RES_CONFIG } from "./data.ts";
import type { DifficultyId, GameState, IdeologyId } from "./types.ts";

// «Дело дня»: одна и та же партия у всех игроков в течение суток — можно сравнить итог с друзьями.
export function dailyCase(now = new Date()) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dailyCaseForDate(date);
}

export function dailyCaseForDate(date: string) {
  const seed = hashSeed("daily", date);
  const r = seededRandom(seed);
  const legacyCountry = LEGACY_COUNTRIES[Math.floor(r() * LEGACY_COUNTRIES.length)];
  const diffs: DifficultyId[] = ["coalition", "coalition", "crisis"];
  return {
    date, seed,
    country: date >= ALTERNATE_DAILY_FROM ? ALTERNATE_COUNTRY : legacyCountry,
    diff: diffs[Math.floor(r() * diffs.length)],
    ideo: IDEOLOGIES[Math.floor(r() * IDEOLOGIES.length)].id as IdeologyId,
  };
}


// Очки для таблицы «Дела дня»: сколько продержался, чем кончилось, в каком состоянии страна.
export function runScore(gs: Pick<GameState, "endType" | "turn" | "country" | "factions" | "resources" | "stats" | "arc" | "promises">): number {
  const rating = computePolls(gs.country, gs.factions, gs.resources).leader;
  const avg = RES_CONFIG.reduce((s, c) => s + gs.resources[c.key], 0) / RES_CONFIG.length;
  const score = gs.turn * 40 + rating * 6 + avg * 3
    + (isSurvival(gs.endType) ? 400 : 0) + (gs.endType ? END_BONUS[gs.endType] ?? 0 : 0)
    + (gs.arc?.epilogue ? 150 : 0) - (gs.stats?.failures ?? 0) * 15
    + promisesKept(gs.promises) * 120 - promisesBroken(gs.promises) * 80;
  return Math.max(0, Math.round(score));
}
