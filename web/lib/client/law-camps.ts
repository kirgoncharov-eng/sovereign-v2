import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import type { Bloc, GameState } from '../game/types.ts';

// Общие ярлыки блоков для шести архивных стран: там они и раньше стояли в карточке закона.
const BLOC_LABEL: Record<Bloc, string> = {
  security: 'силовики', business: 'бизнес', church: 'церковь', liberal: 'либералы', west: 'торговые партнёры',
  russia: 'Россия', nationalist: 'националисты', regional: 'регионы', ruling: 'правящая партия',
};

// Кого задевает закон. В 1978 году лагерь называется так же, как на остальных экранах (#310, C13):
// «Промышленная палата», а не «бизнес»; «Областные советы», а не «регионы».
export function lawCampNames(state: Pick<GameState, 'country' | 'factions'>, blocs: readonly Bloc[]): string[] {
  return blocs.map(bloc => {
    const own = state.country === ALTERNATE_COUNTRY ? state.factions.filter(faction => faction.bloc === bloc) : [];
    return own.length ? own.map(faction => faction.name).join(', ') : BLOC_LABEL[bloc] ?? bloc;
  });
}
