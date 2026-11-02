// Единый словарь экранных имён ресурсов (#310, C13). Внутренние ключи не меняются: `politicalCapital` — это «влияние».
// Решение Кирилла 2 ноября 2026: на экране только «Влияние», прежнее название ресурса не используется ни в каком падеже.
import type { GameState } from '../game/types.ts';

type ResourceKey = keyof GameState['resources'];

export const RESOURCE_NAME: Record<ResourceKey, string> = {
  politicalCapital: 'влияние', economy: 'экономика', military: 'силовики',
  externalReputation: 'репутация', internalLegitimacy: 'легитимность', personalResource: 'личный ресурс',
};

export const RESOURCE_NAME_GENITIVE: Record<ResourceKey, string> = {
  politicalCapital: 'влияния', economy: 'экономики', military: 'силовиков',
  externalReputation: 'репутации', internalLegitimacy: 'легитимности', personalResource: 'личного ресурса',
};

export const RESOURCE_TITLE = Object.fromEntries(
  Object.entries(RESOURCE_NAME).map(([key, name]) => [key, `${name[0].toUpperCase()}${name.slice(1)}`]),
) as Record<ResourceKey, string>;
