import { classicApi } from "../lib/game/classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../lib/game/engine.ts";
import { ALTERNATE_COUNTRY } from "../lib/game/alternate-world.ts";
import type { DifficultyId, GameState } from "../lib/game/types.ts";

const DIFFICULTIES: DifficultyId[] = ["debut", "coalition", "crisis"];
const SEEDS = 30;
const STRATEGIES = [0, 1, 2];

const regionalCounts: Record<string, number> = {
  alt_region_walkers: 0,
  alt_region_factory_strike: 0,
  alt_region_customs: 0,
  alt_region_governors: 0,
  alt_region_border_rift: 0,
};

let totalGames = 0;
let totalTurns = 0;
let gamesWithRegional = 0;

for (const diff of DIFFICULTIES) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const strat of STRATEGIES) {
      totalGames++;
      const intro = await classicApi.setup(ALTERNATE_COUNTRY, diff, "pragmatist", seed);
      let state = createInitialState(ALTERNATE_COUNTRY, diff, "pragmatist", intro, seededRandom(seed));
      let hadRegional = false;

      while (!state.ended && state.turn < 20) {
        totalTurns++;
        const event = (await classicApi.event(state)) as GameState["currentEvent"] & { cardId?: string };
        state = startEvent(state, event!);
        
        if (event?.cardId && event.cardId in regionalCounts) {
          regionalCounts[event.cardId]++;
          hadRegional = true;
        }

        const choiceIndex = (state.turn + strat) % event.choices.length;
        const choice = event.choices[choiceIndex];
        const consequence = await classicApi.consequence(state, choice.id);
        state = resolveTurn(state, choice.id, consequence);
      }
      if (hadRegional) gamesWithRegional++;
    }
  }
}

console.log(`Всего партий: ${totalGames}, ходов: ${totalTurns}`);
console.log(`Партий с хотя бы одним региональным событием: ${gamesWithRegional} (${Math.round((gamesWithRegional / totalGames) * 100)}%)`);
console.log("Встречаемость региональных событий:");
for (const [id, count] of Object.entries(regionalCounts)) {
  console.log(`  ${id}: ${count} раз (${((count / totalGames) * 100).toFixed(1)}%)`);
}
