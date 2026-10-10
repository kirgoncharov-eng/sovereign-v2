import { classicApi } from "../game/classic.ts";
import { ACTIONS, COUNTRIES, CRISIS_THRESHOLD, RES_CONFIG } from "../game/data.ts";
import { choiceEffects, createInitialState, resolveTurn, seededRandom, startEvent, successChance } from "../game/engine.ts";
import { debate, type AdvisorTake } from "../game/forecasts.ts";
import type { Choice, GameState } from "../game/types.ts";

export interface AdvisorArtScene {
  state: GameState;
  takes: AdvisorTake[];
}

// These two faces belong to this review cast only, never to a randomly generated role.
export const ADVISOR_REVIEW_ART: Record<string, string> = {
  "Оксана Гончар": "/art/advisors/economist-v1.webp",
  "Юрий Бондаренко": "/art/advisors/security-v1.webp",
};

export async function createAdvisorArtScene(country = "Украина"): Promise<AdvisorArtScene> {
  if (!COUNTRIES[country]) throw new Error("Неизвестная страна");
  const seed = 1;
  const intro = await classicApi.setup(country, "coalition", "pragmatist", seed);
  let state = createInitialState(country, "coalition", "pragmatist", intro, seededRandom(seed));

  for (let index = 0; index < 20 && !state.ended; index++) {
    state = startEvent(state, await classicApi.event(state));
    const takes = debate(state);
    if (takes?.length === 2 && takes[0].id === "economist" && takes[1].id === "security") {
      if (takes[0].favors !== takes[1].favors) return { state, takes };
    }
    const choice = state.currentEvent!.choices[0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  throw new Error(`Не найден спор для страны: ${country}`);
}

// Show an explanation rather than exact hidden outcomes before signing.
export function reviewChoiceBrief(state: GameState, choice: Choice) {
  const effects = choiceEffects(state, choice);
  const costs = RES_CONFIG.filter(resource => (effects.resources[resource.key] ?? 0) < 0).flatMap(resource => {
    const tag = choice.tags.find(candidate => (ACTIONS[candidate].res[resource.key] ?? 0) < 0);
    const reason = choice.costReasons?.[resource.key] ?? (tag ? ACTIONS[tag].why?.[resource.key] : undefined);
    return reason ? [{ label: resource.label, reason }] : [];
  });
  const warnings = RES_CONFIG.filter(resource => state.resources[resource.key] < CRISIS_THRESHOLD
    && (effects.resources[resource.key] ?? 0) < 0).map(resource => `${resource.label} в кризисе — решение ударит и по ней`);
  const chance = successChance(state, choice);
  const percent = Math.round(chance * 100);
  const risk = percent >= 85 ? "Низкий риск" : percent >= 70 ? "Умеренный риск" : percent >= 55 ? "Высокий риск" : "Очень высокий риск";
  return { costs, warnings, risk };
}
