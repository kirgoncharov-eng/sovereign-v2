import type { GameEvent, GameState } from '../game/types.ts';
import type { SceneKey } from '../content/scene-map.ts';
import { ALTERNATE_EVENTS, ALTERNATE_LAWS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { FIGURE_ROLES } from '../game/data.ts';
import { isFemaleName } from '../game/engine.ts';

export const HISTORICAL_SCENE_ART = {
  archive: { src: '/art/scenes/archive.webp', caption: 'Промышленный договор в архиве' },
  radio: { src: '/art/scenes/radio.webp', caption: 'Письмо в радиостудии' },
  rail: { src: '/art/scenes/rail.webp', caption: 'Составы на пограничной станции' },
  fuel: { src: '/art/scenes/fuel.webp', caption: 'Мазут для городской ТЭЦ' },
  standards: { src: '/art/scenes/standards.webp', caption: 'Насос и чертежи в опытном цехе' },
  district: { src: '/art/scenes/district.webp', caption: 'Протекающая крыша районной больницы' },
  harvest: { src: '/art/scenes/harvest.webp', caption: 'Закупка зерна у элеватора' },
  export: { src: '/art/scenes/export-guarantee.webp', caption: 'Экспортная гарантия в банковской книге' },
  orders: { src: '/art/scenes/open-orders.webp', caption: 'Областные заказы в открытом бюллетене' },
  press: { src: '/art/scenes/press.webp', caption: 'Журналисты в пресс-центре' },
  phone: { src: '/art/scenes/phone.webp', caption: 'Звонок по защищённой линии' },
  bridge: { src: '/art/scenes/bridge.webp', caption: 'Осмотр мостов после паводка' },
  protest: { src: '/art/scenes/protest.webp', caption: 'Собрание у университета' },
  ballot: { src: '/art/scenes/ballot.webp', caption: 'Подсчёт избирательных бюллетеней' },
} as const;
export type HistoricalArt = typeof HISTORICAL_SCENE_ART[keyof typeof HISTORICAL_SCENE_ART];
const CARD_ART: Record<string, HistoricalArt> = {
  alt_fuel: HISTORICAL_SCENE_ART.fuel, alt_standards: HISTORICAL_SCENE_ART.standards,
  alt_district: HISTORICAL_SCENE_ART.district, alt_rail: HISTORICAL_SCENE_ART.rail,
  alt_radio: HISTORICAL_SCENE_ART.radio, alt_harvest: HISTORICAL_SCENE_ART.harvest,
  alt_archive: HISTORICAL_SCENE_ART.archive,
  law_alt_export_guarantee: HISTORICAL_SCENE_ART.export,
  law_alt_open_orders: HISTORICAL_SCENE_ART.orders,
};
const MODE_ART: Partial<Record<SceneKey, HistoricalArt>> = {
  press: HISTORICAL_SCENE_ART.press, phone: HISTORICAL_SCENE_ART.phone,
  bridge: HISTORICAL_SCENE_ART.bridge, protest: HISTORICAL_SCENE_ART.protest, ballot: HISTORICAL_SCENE_ART.ballot,
};
const TITLE_ART: Record<string, HistoricalArt> = Object.fromEntries([
  ...ALTERNATE_EVENTS.filter(card => CARD_ART[card.id]).map(card => [card.title, CARD_ART[card.id]]),
  ...ALTERNATE_LAWS.map(law => [`Законопроект «${law.title}»`, CARD_ART[`law_${law.id}`]]),
  ['Мосты после паводка', HISTORICAL_SCENE_ART.bridge],
]);

export function historicalEventArt(country: string, event: GameEvent, scene: SceneKey): HistoricalArt | null {
  if (country !== ALTERNATE_COUNTRY) return null;
  if (event.beat?.arcId === 'alt_contracts') return HISTORICAL_SCENE_ART.archive;
  if (event.card && CARD_ART[event.card]) return CARD_ART[event.card];
  const bill = event.card?.match(/^law:\d+:(alt_export_guarantee|alt_open_orders)$/)?.[1];
  if (bill) return CARD_ART[`law_${bill}`];
  if (event.special?.kind === 'inspect') return event.title === 'Мосты после паводка' ? HISTORICAL_SCENE_ART.bridge : null;
  return MODE_ART[scene] ?? null;
}

export function historicalResultArt(state: GameState, scene: SceneKey): HistoricalArt | null {
  if (state.country !== ALTERNATE_COUNTRY) return null;
  if (state.lastTurn?.election) return HISTORICAL_SCENE_ART.ballot;
  const title = state.history.at(-1)?.title;
  if (title && TITLE_ART[title]) return TITLE_ART[title];
  // The stored scene belongs to the completed event; don't consult the next event or current arc.
  return MODE_ART[scene] ?? (scene === 'archive' ? HISTORICAL_SCENE_ART.archive : null);
}

export const HISTORICAL_FIGURE_ART: Record<string, { src: string; female: boolean }> = Object.fromEntries(
  ['oligarch', 'governor', 'opp_leader', 'amb_russia', 'amb_eu', 'journalist', 'interior',
    'nat_leader', 'patriarch', 'security'].map(id => [id, { src: `/art/figures/${id}.webp`, female: id === 'amb_eu' }]),
);

export function historicalPortraitArt(
  state: GameState | null, name: string, roster?: Record<string, string> | null,
): string | null {
  if (!state || state.country !== ALTERNATE_COUNTRY || state.leader.name === name) return null;
  const figure = state.keyFigures.find(person => person.name === name);
  if (!figure || (roster && roster[figure.id] !== name)) return null;
  const role = FIGURE_ROLES[ALTERNATE_COUNTRY].find(role => role.id === figure.id && role.role === figure.role);
  const art = role && HISTORICAL_FIGURE_ART[role.id];
  return art && art.female === isFemaleName(name) ? art.src : null;
}

declare global { interface Window { __SOVEREIGN_ART__?: Record<string, string> } }
export function artSource(src: string): string {
  return typeof window === 'undefined' ? src : window.__SOVEREIGN_ART__?.[src] ?? src;
}
