// Демо-адаптер: та же игра, но модель вызывается прямо со страницы артефакта claude.ai
// через возможность `sample` (на аккаунте зрителя). Интерфейс совпадает с lib/client/api.ts.
import { FIGURE_ROLES } from "../lib/game/data.ts";
import { planTurn, warningLevel } from "../lib/game/engine.ts";
import { consequencePrompt, endingPrompt, eventPrompt, setupPrompt, SYS_BASE, SYS_CONSEQUENCE, SYS_ENDING } from "../lib/game/prompts.ts";
import { sanitizeNarration, sanitizeEvent, sanitizeIntro, sanitizeVerdict } from "../lib/game/sanitize.ts";
import type { DifficultyId, GameState, IdeologyId } from "../lib/game/types.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

type Tier = "quick" | "default" | "complex";
interface SampleFn {
  json: (input: string, opts?: { modelTier?: Tier; cache?: boolean }) => Promise<unknown>;
}
declare global {
  interface Window { claude?: { use: (name: string) => Promise<unknown> } }
}

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  if (!window.claude) return Promise.resolve(null);
  samplePromise ??= window.claude.use("sample") as Promise<SampleFn | null>;
  return samplePromise;
}

const ERRORS: Record<string, string> = {
  not_granted: "Страница не получила разрешения обращаться к Claude. Перезагрузите её и разрешите доступ.",
  sampling_disabled: "Claude недоступен для этого аккаунта.",
  rate_limited: "Слишком много запросов или исчерпан лимит. Подождите немного и повторите.",
  session_expired: "Сессия истекла — войдите в claude.ai заново.",
  refused: "Claude отказался генерировать этот фрагмент. Попробуйте другой вариант решения.",
  invalid_json: "Модель вернула некорректный ответ.",
  upstream_error: "Сбой связи с Claude.",
};

const RANDOM_EVENT_CHANCE = 0.28;

async function generate<T>(system: string, prompt: string, tier: Tier, validate: (raw: unknown) => T | null): Promise<T> {
  const sample = await getSample();
  if (!sample) throw new ApiError("Игра работает только внутри claude.ai: здесь нет доступа к Claude.");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await sample.json(`${system}\n\n${prompt}`, { modelTier: tier, cache: false });
      const result = validate(raw);
      if (result) return result;
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "upstream_error";
      if (code !== "invalid_json" || attempt === 1) throw new ApiError(ERRORS[code] ?? ERRORS.upstream_error);
    }
  }
  throw new ApiError(ERRORS.invalid_json);
}

export const api = {
  setup: (country: string, diff: string, ideo: string) =>
    generate(SYS_BASE, setupPrompt(country, diff as DifficultyId, ideo as IdeologyId), "quick",
      r => sanitizeIntro(r, FIGURE_ROLES[country].length)),

  event: (state: GameState) => {
    const isCritical = warningLevel(state) === "critical";
    const withRandom = state.turn > 0 && Math.random() < RANDOM_EVENT_CHANCE;
    const factionIds = state.factions.map(f => f.id);
    return generate(SYS_BASE, eventPrompt(state, { isCritical, withRandom }), "quick",
      r => sanitizeEvent(r, factionIds, { isCritical, allowRandom: withRandom, crisisIds: state.activeCrises.map(c => c.id) }));
  },

  consequence: (state: GameState, choiceId: string) => {
    let prompt: string;
    try { prompt = consequencePrompt(state, planTurn(state, choiceId)); }
    catch (e) { return Promise.reject(new ApiError((e as Error).message)); }
    return generate(SYS_CONSEQUENCE, prompt, "quick", sanitizeNarration);
  },

  ending: (state: GameState) => generate(SYS_ENDING, endingPrompt(state), "default", sanitizeVerdict),
};
