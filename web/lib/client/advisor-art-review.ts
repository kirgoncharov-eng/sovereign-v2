import { classicApi } from "../game/classic.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
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
  "Оксана Гончар": "/art/advisors/economist-v2.webp",
  "Юрий Бондаренко": "/art/advisors/security-v2.webp",
};

export async function createAdvisorArtScene(country = "Украина"): Promise<AdvisorArtScene> {
  if (!COUNTRIES[country]) throw new Error("Неизвестная страна");
  // Фиксированная сцена приёмки: после исправления лояльности прежний маршрут 1978 не даёт нужную пару.
  // В 1978 году сцена — спор о гарантиях экспортных заказов: другие дела тоже дают пару советников (#196).
  // Маршрут к нему зависит от ранних дел, которые меняются вместе с контентом (#227), поэтому зерно ищется по порядку:
  // первое, на котором спор находится. Результат детерминирован.
  const seeds = country === ALTERNATE_COUNTRY ? Array.from({ length: 30 }, (_, index) => index + 1) : [1];
  for (const seed of seeds) {
    const scene = await findAdvisorArtScene(country, seed);
    if (scene) return scene;
  }
  throw new Error(`Не найден спор для страны: ${country}`);
}

async function findAdvisorArtScene(country: string, seed: number): Promise<AdvisorArtScene | null> {
  const wanted = (event: GameState["currentEvent"]) => country !== ALTERNATE_COUNTRY
    || !!event?.choices.some(choice => choice.law?.id === "alt_export_guarantee");
  const intro = await classicApi.setup(country, "coalition", "pragmatist", seed);
  let state = createInitialState(country, "coalition", "pragmatist", intro, seededRandom(seed));

  for (let index = 0; index < 20 && !state.ended; index++) {
    state = startEvent(state, await classicApi.event(state));
    const takes = debate(state);
    if (takes?.length === 2 && takes[0].id === "economist" && takes[1].id === "security" && wanted(state.currentEvent)) {
      if (takes[0].favors !== takes[1].favors) return { state, takes };
    }
    const choice = state.currentEvent!.choices[country === ALTERNATE_COUNTRY && index === 0 ? 1 : 0];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  return null;
}

// Show an explanation rather than exact hidden outcomes before signing.
export function reviewChoiceBrief(state: GameState, choice: Choice) {
  const effects = choiceEffects(state, choice);
  const costs = RES_CONFIG
    .filter(resource => (effects.resources[resource.key] ?? 0) < 0)
    .flatMap(resource => {
      const tag = choice.tags.find(candidate => (ACTIONS[candidate].res[resource.key] ?? 0) < 0);
      const reason = choice.costReasons?.[resource.key] ?? (tag ? ACTIONS[tag].why?.[resource.key] : undefined);
      return reason ? [{ label: resource.label, reason }] : [];
    });
  const warnings = RES_CONFIG
    .filter(resource => state.resources[resource.key] < CRISIS_THRESHOLD
      && (effects.resources[resource.key] ?? 0) < 0)
    .map(resource => `${resource.label} в кризисе — решение ударит и по ней`);
  const chance = successChance(state, choice);
  const percent = Math.round(chance * 100);
  const risk = percent >= 85 ? "Низкий риск"
    : percent >= 70 ? "Умеренный риск"
      : percent >= 55 ? "Высокий риск" : "Очень высокий риск";
  return { costs, warnings, risk };
}
