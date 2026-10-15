import type { GameEvent, GameState } from '../game/types.ts';
import type { SceneKey } from '../content/scene-map.ts';
import { ALTERNATE_EVENTS, ALTERNATE_LAWS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { FIGURE_ROLES } from '../game/data.ts';
import { isFemaleName } from '../game/engine.ts';
import { MANAGEMENT_DOSSIERS } from '../content/management.ts';

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
export type HistoricalArt = { src: string; caption: string };
export const HISTORICAL_OUTCOME_ART = {
  bridgeTemporary: { src: '/art/gemini-next/bridge-temporary.webp', caption: 'Временная переправа вернула сообщение' },
  bridgeRestored: { src: '/art/gemini-next/bridge-restored.webp', caption: 'Мост открыт после капитального восстановления' },
  bridgeToll: { src: '/art/gemini-next/bridge-toll.webp', caption: 'На восстановленном мосту взимают плату за проезд' },
  districtRepairs: { src: '/art/gemini-next/district-repairs.webp', caption: 'Ремонт больницы продолжается с новым подрядчиком' },
  districtDelayed: { src: '/art/gemini-next/district-delayed.webp', caption: 'Ремонт больницы не сдвинулся, крыша продолжает течь' },
} satisfies Record<string, HistoricalArt>;
const bridgeDossier = MANAGEMENT_DOSSIERS.find(dossier => dossier.id === 'bridges')!;
const bridgeOutcomes = [
  HISTORICAL_OUTCOME_ART.bridgeTemporary, HISTORICAL_OUTCOME_ART.bridgeRestored, HISTORICAL_OUTCOME_ART.bridgeToll,
];
const districtCard = ALTERNATE_EVENTS.find(card => card.id === 'alt_district')!;
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
  const completed = state.history.at(-1);
  // Opening a bridge is a delayed result, not a photograph of the signed estimate.
  for (const pending of state.lastTurn?.matured ?? []) {
    const index = bridgeDossier.options.findIndex(option =>
      pending.event === bridgeDossier.title && pending.source === option.text && pending.label === option.later.label);
    if (index >= 0) return bridgeOutcomes[index];
  }
  if (completed?.title === districtCard.title) {
    if (completed.success === false) return HISTORICAL_OUTCOME_ART.districtDelayed;
    if (completed.success === true) {
      if (completed.choice === districtCard.choices[0].text) return HISTORICAL_OUTCOME_ART.districtRepairs;
      // The other successful choices finish the roof. Don't show leaks or unfinished repairs.
      return null;
    }
  }
  const title = completed?.title;
  if (title && TITLE_ART[title]) return TITLE_ART[title];
  // The stored scene belongs to the completed event; don't consult the next event or current arc.
  return MODE_ART[scene] ?? (scene === 'archive' ? HISTORICAL_SCENE_ART.archive : null);
}

export const HISTORICAL_FIGURE_ART: Record<string, { src: string; female: boolean }> = Object.fromEntries(
  ['oligarch', 'governor', 'opp_leader', 'amb_russia', 'amb_eu', 'journalist', 'interior',
    'nat_leader', 'patriarch', 'security'].map(id => [id, { src: `/art/figures/${id}.webp`, female: id === 'amb_eu' }]),
);
export const HISTORICAL_ADDITIONAL_FIGURE_ART = {
  amb_eu: { src: '/art/gemini-next/amb-eu-male.webp', female: false },
  journalist: { src: '/art/gemini-next/journalist-female.webp', female: true },
} as const;

export function historicalPortraitArt(
  state: GameState | null, name: string, roster?: Record<string, string> | null,
): string | null {
  if (!state || state.country !== ALTERNATE_COUNTRY || state.leader.name === name) return null;
  const figure = state.keyFigures.find(person => person.name === name);
  if (!figure || (roster && roster[figure.id] !== name)) return null;
  const role = FIGURE_ROLES[ALTERNATE_COUNTRY].find(role => role.id === figure.id && role.role === figure.role);
  const female = isFemaleName(name);
  const alternative = role && HISTORICAL_ADDITIONAL_FIGURE_ART[role.id as keyof typeof HISTORICAL_ADDITIONAL_FIGURE_ART];
  const art = alternative?.female === female ? alternative : role && HISTORICAL_FIGURE_ART[role.id];
  return art && art.female === isFemaleName(name) ? art.src : null;
}

declare global { interface Window { __SOVEREIGN_ART__?: Record<string, string> } }
export function artSource(src: string): string {
  return typeof window === 'undefined' ? src : window.__SOVEREIGN_ART__?.[src] ?? src;
}
