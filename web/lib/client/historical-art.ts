import type { GameEvent, GameState } from '../game/types.ts';
import type { SceneKey } from '../content/scene-map.ts';
import { ALTERNATE_EVENTS, ALTERNATE_LAWS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { FIGURE_ROLES } from '../game/data.ts';
import { isFemaleName, isSurvival } from '../game/engine.ts';
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
  wages: { src: '/art/gemini-next/wages-gate.webp', caption: 'Проходная тракторного завода зимой' },
  electionNight: { src: '/art/gemini-next/election-night.webp', caption: 'Кабинет президента в ночь подсчёта голосов' },
  electionDefeat: { src: '/art/gemini-next/election-defeat.webp', caption: 'Штаб кампании в полночь после поражения' },
  parliamentHall: { src: '/art/gemini-next/parliament-hall.webp', caption: 'Правительственная ложа в зале парламента' },
  residenceMorning: { src: '/art/gemini-next/residence-morning.webp', caption: 'Вид из кабинета президента на площадь Независимости' },
} as const;
export type HistoricalArt = { src: string; caption: string };
export const HISTORICAL_OUTCOME_ART = {
  bridgeTemporary: { src: '/art/gemini-next/bridge-temporary.webp', caption: 'Временная переправа вернула сообщение' },
  bridgeRestored: { src: '/art/gemini-next/bridge-restored.webp', caption: 'Мост открыт после капитального восстановления' },
  bridgeToll: { src: '/art/gemini-next/bridge-toll.webp', caption: 'На восстановленном мосту взимают плату за проезд' },
  districtRepairs: { src: '/art/gemini-next/district-repairs.webp', caption: 'Ремонт больницы продолжается с новым подрядчиком' },
  districtDelayed: { src: '/art/gemini-next/district-delayed.webp', caption: 'Ремонт больницы не сдвинулся, крыша продолжает течь' },
  districtCompleted: { src: '/art/gemini-next/district-completed.webp', caption: 'Крыша районной больницы полностью отремонтирована' },
  wagesAudit: { src: '/art/gemini-next/wages-audit.webp', caption: 'Выплата зарплаты и проверка заводских договоров' },
  wagesAdvance: { src: '/art/gemini-next/wages-advance.webp', caption: 'Отгрузка тракторов под трёхлетний экспортный аванс' },
  wagesRetool: { src: '/art/gemini-next/wages-retool.webp', caption: 'Перестройка цеха и переобучение рабочих' },
  wagesGate: { src: '/art/gemini-next/wages-gate.webp', caption: 'Заводские цеха остановлены, рабочие ждут у проходной' },
  harvestSubsidy: { src: '/art/gemini-next/harvest-subsidy.webp', caption: 'Государственная приёмка зерна на центральном элеваторе' },
  harvestDirect: { src: '/art/gemini-next/harvest-direct.webp', caption: 'Разгрузка муки нового урожая у городской пекарни' },
  harvestCredit: { src: '/art/gemini-next/harvest-credit.webp', caption: 'Оформление кредитных расписок в отделении сельхозбанка' },
  harvestRot: { src: '/art/gemini-next/harvest-rot.webp', caption: 'Сорванная закупка зерна и брошенная техника под дождём' },
  fuelTransitEast: { src: '/art/gemini-next/fuel-transit-east.webp', caption: 'Эшелон цистерн мазута на разгрузке ТЭЦ' },
  fuelTransitWest: { src: '/art/gemini-next/fuel-transit-west.webp', caption: 'Перевалка мазута Торгового союза на пограничной эстакаде' },
  fuelInsulation: { src: '/art/gemini-next/fuel-insulation.webp', caption: 'Срочный ремонт теплотрассы в жилом квартале' },
  fuelFreeze: { src: '/art/gemini-next/fuel-freeze.webp', caption: 'Остановленная городская ТЭЦ в январские морозы' },
} satisfies Record<string, HistoricalArt>;
const bridgeDossier = MANAGEMENT_DOSSIERS.find(dossier => dossier.id === 'bridges')!;
const bridgeOutcomes = [
  HISTORICAL_OUTCOME_ART.bridgeTemporary, HISTORICAL_OUTCOME_ART.bridgeRestored, HISTORICAL_OUTCOME_ART.bridgeToll,
];
const districtCard = ALTERNATE_EVENTS.find(card => card.id === 'alt_district')!;
const wagesCard = ALTERNATE_EVENTS.find(card => card.id === 'alt_wages')!;
const harvestCard = ALTERNATE_EVENTS.find(card => card.id === 'alt_harvest')!;
const fuelCard = ALTERNATE_EVENTS.find(card => card.id === 'alt_fuel')!;
const CARD_ART: Record<string, HistoricalArt> = {
  alt_wages: HISTORICAL_SCENE_ART.wages,
  alt_fuel: HISTORICAL_SCENE_ART.fuel, alt_standards: HISTORICAL_SCENE_ART.standards,
  alt_district: HISTORICAL_SCENE_ART.district, alt_rail: HISTORICAL_SCENE_ART.rail,
  alt_rail_blockade: HISTORICAL_SCENE_ART.rail, alt_rail_chamber: HISTORICAL_SCENE_ART.rail,
  alt_fuel_west: HISTORICAL_SCENE_ART.fuel, alt_fuel_advance: HISTORICAL_SCENE_ART.fuel, alt_fuel_audit: HISTORICAL_SCENE_ART.fuel,
  alt_district_police: HISTORICAL_SCENE_ART.district, alt_district_court: HISTORICAL_SCENE_ART.district,
  alt_standards_chamber: HISTORICAL_SCENE_ART.standards, alt_standards_patriots: HISTORICAL_SCENE_ART.standards,
  alt_radio: HISTORICAL_SCENE_ART.radio, alt_harvest: HISTORICAL_SCENE_ART.harvest,
  alt_archive: HISTORICAL_SCENE_ART.archive,
  alt_region_walkers: HISTORICAL_SCENE_ART.bridge,
  alt_region_factory_strike: HISTORICAL_SCENE_ART.protest,
  alt_region_customs: HISTORICAL_SCENE_ART.rail,
  alt_region_governors: HISTORICAL_SCENE_ART.parliamentHall,
  alt_region_border_rift: HISTORICAL_SCENE_ART.rail,
  law_alt_export_guarantee: HISTORICAL_SCENE_ART.parliamentHall,
  law_alt_open_orders: HISTORICAL_SCENE_ART.parliamentHall,
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
  if (state.lastTurn?.election) {
    if (state.lastTurn.election.outcome === 'won') return HISTORICAL_SCENE_ART.electionNight;
    if (state.lastTurn.election.outcome === 'lost') return HISTORICAL_SCENE_ART.electionDefeat;
    return HISTORICAL_SCENE_ART.ballot;
  }
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
      return HISTORICAL_OUTCOME_ART.districtCompleted;
    }
  }
  if (completed?.title === wagesCard.title) {
    if (completed.success === false) return HISTORICAL_OUTCOME_ART.wagesGate;
    if (completed.success === true) {
      if (completed.choice === wagesCard.choices[0].text) return HISTORICAL_OUTCOME_ART.wagesAudit;
      if (completed.choice === wagesCard.choices[1].text) return HISTORICAL_OUTCOME_ART.wagesAdvance;
      if (completed.choice === wagesCard.choices[2].text) return HISTORICAL_OUTCOME_ART.wagesRetool;
    }
  }
  if (completed?.title === harvestCard.title) {
    if (completed.success === false) return HISTORICAL_OUTCOME_ART.harvestRot;
    if (completed.success === true) {
      if (completed.choice === harvestCard.choices[0].text) return HISTORICAL_OUTCOME_ART.harvestSubsidy;
      if (completed.choice === harvestCard.choices[1].text) return HISTORICAL_OUTCOME_ART.harvestDirect;
      if (completed.choice === harvestCard.choices[2].text) return HISTORICAL_OUTCOME_ART.harvestCredit;
    }
  }
  if (completed?.title === fuelCard.title) {
    if (completed.choice === fuelCard.choices[0].text) {
      return completed.success ? HISTORICAL_OUTCOME_ART.fuelTransitEast : HISTORICAL_SCENE_ART.fuel;
    }
    if (completed.choice === fuelCard.choices[1].text) {
      return completed.success ? HISTORICAL_OUTCOME_ART.fuelTransitWest : HISTORICAL_SCENE_ART.fuel;
    }
    if (completed.choice === fuelCard.choices[2].text) {
      return HISTORICAL_OUTCOME_ART.fuelInsulation;
    }
  }
  const title = completed?.title;
  if (title && TITLE_ART[title]) return TITLE_ART[title];
  // The stored scene belongs to the completed event; don't consult the next event or current arc.
  return MODE_ART[scene] ?? (scene === 'archive' ? HISTORICAL_SCENE_ART.archive : null);
}

export function historicalEndingArt(state: GameState): HistoricalArt | null {
  if (state.country !== ALTERNATE_COUNTRY) return null;
  if (state.endType === 'revolution') {
    return { src: HISTORICAL_SCENE_ART.protest.src, caption: 'Народные волнения на улицах столицы' };
  }
  if (state.endType === 'mandate' || state.endType === 'impeachment') {
    return HISTORICAL_SCENE_ART.electionDefeat;
  }
  if (state.endType === 'reelected' || state.endType === 'zeroed' || state.endType === 'premier') {
    return HISTORICAL_SCENE_ART.electionNight;
  }
  if (state.endType === 'died') {
    return null;
  }
  if (state.endType === 'emergency_rule' || state.endType === 'dictator') {
    return { src: HISTORICAL_SCENE_ART.electionNight.src, caption: 'Огни столицы за окном кабинета правителя' };
  }
  if (isSurvival(state.endType)) {
    return HISTORICAL_SCENE_ART.electionNight;
  }
  return HISTORICAL_SCENE_ART.electionDefeat;
}

export const HISTORICAL_FIGURE_ART: Record<string, { src: string; female: boolean }> = Object.fromEntries(
  ['oligarch', 'governor', 'opp_leader', 'amb_russia', 'amb_eu', 'journalist', 'interior',
    'nat_leader', 'patriarch', 'security'].map(id => [id, { src: `/art/figures/${id}.webp`, female: id === 'amb_eu' }]),
);
export const HISTORICAL_ADDITIONAL_FIGURE_ART = {
  amb_eu: { src: '/art/gemini-next/amb-eu-male.webp', female: false },
  journalist: { src: '/art/gemini-next/journalist-female.webp', female: true },
} as const;

export const HISTORICAL_ADVISOR_ART: Record<string, { src: string; female: boolean }> = {
  strategist: { src: '/art/gemini-next/adv-strategist.webp', female: true },
  economist: { src: '/art/gemini-next/adv-economist.webp', female: true },
  security: { src: '/art/gemini-next/adv-security.webp', female: false },
  diplomat: { src: '/art/gemini-next/adv-diplomat.webp', female: true },
};

export const LEADER_PORTRAIT_IDS = ['economist', 'officer', 'mayor', 'lawyer', 'diplomat'] as const;

export const BIO_TO_PORTRAIT: Record<string, (typeof LEADER_PORTRAIT_IDS)[number]> = {
  officer: 'officer',
  military: 'officer',
  economist: 'economist',
  lawyer: 'lawyer',
  diplomat: 'diplomat',
  mayor: 'mayor',
};

export const HISTORICAL_LEADER_ART: Record<string, { src: string; female: boolean; label: string }> = {
  economist: { src: '/art/gemini-next/leader-economist.webp', female: false, label: 'Госплан · Экономист' },
  officer: { src: '/art/gemini-next/leader-officer.webp', female: false, label: 'Армия · Офицер в отставке' },
  mayor: { src: '/art/gemini-next/leader-mayor.webp', female: false, label: 'Обком · Бывший мэр' },
  lawyer: { src: '/art/gemini-next/leader-lawyer.webp', female: false, label: 'Юстиция · Правозащитник' },
  diplomat: { src: '/art/gemini-next/leader-diplomat.webp', female: false, label: 'МИД · Дипломат' },
};

export function historicalPortraitArt(
  state: GameState | null, name: string, roster?: Record<string, string> | null,
): string | null {
  if (!state || state.country !== ALTERNATE_COUNTRY) return null;
  if (state.leader.name === name) {
    const p = state.leader.portrait && HISTORICAL_LEADER_ART[state.leader.portrait];
    return p && p.female === isFemaleName(name) ? p.src : null;
  }
  const figure = state.keyFigures.find(person => person.name === name);
  if (figure) {
    if (roster && roster[figure.id] !== name) return null;
    const role = FIGURE_ROLES[ALTERNATE_COUNTRY].find(role => role.id === figure.id && role.role === figure.role);
    const female = isFemaleName(name);
    const alternative = role && HISTORICAL_ADDITIONAL_FIGURE_ART[role.id as keyof typeof HISTORICAL_ADDITIONAL_FIGURE_ART];
    const art = alternative?.female === female ? alternative : role && HISTORICAL_FIGURE_ART[role.id];
    return art && art.female === female ? art.src : null;
  }
  const advisor = state.advisors?.find(person => person.name === name);
  if (advisor) {
    const key = `advisor:${advisor.id}`;
    if (roster && roster[key] && roster[key] !== name) return null;
    const art = HISTORICAL_ADVISOR_ART[advisor.id];
    return art && art.female === isFemaleName(name) ? art.src : null;
  }
  return null;
}

declare global { interface Window { __SOVEREIGN_ART__?: Record<string, string> } }
export function artSource(src: string): string {
  return typeof window === 'undefined' ? src : window.__SOVEREIGN_ART__?.[src] ?? src;
}
