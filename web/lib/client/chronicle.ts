// «Хроника срока» (#298): тот же движок 1978 года, но срок читается одной непрерывной хроникой.
// Между решениями время течёт само: исполнение подписи, голоса людей, пресса, отклики прежних решений.
// На решении история стоит и ждёт. Здесь только представление уже разрешённых ходов: ни тиков, ни скрытых факторов.
import { budgetChoice, callChoice, callReply, approachWorks, classicApi, customizeLeader, pressChoice } from '../game/classic.ts';
import { createInitialState, hashSeed, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { COUNTRIES, END_TYPES, TERM } from '../game/data.ts';
import { MONTHS_GEN, turnDate, type TurnDate } from '../game/calendar.ts';
import { newspaperName } from '../game/newspaper-editions.ts';
import { splitQuarter } from '../game/turn-report.ts';
import { APPROACHES, CALL_ENDINGS, type Approach } from '../content/calls.ts';
import { withoutHeadline } from './brief.ts';
import { personalBeat, type PersonalMemory } from './chronicle-personal.ts';
import type { Choice, DifficultyId, GameState, IdeologyId, ResourceKey } from '../game/types.ts';

export type LineKind = 'opening' | 'speech' | 'signed' | 'scene' | 'voice' | 'paper' | 'press' | 'letter' | 'echo'
  | 'personal' | 'ledger' | 'fall';

export interface ChronicleLine {
  id: string;
  kind: LineKind;
  text: string;
  who?: string;   // газета, издание, автор письма или речи
  date: { year: number; month: number; day: number };
}

export interface ChronicleStart {
  seed: number;
  diff: DifficultyId;
  bio: string;
  ideo: IdeologyId;
}

const BIOS = ['officer', 'economist', 'lawyer', 'diplomat', 'mayor'];
const IDEOLOGIES: IdeologyId[] = ['liberal', 'nationalist', 'pragmatist', 'leftist'];

/** Не выбранное начало: биография и взгляды выпадают по зерну, как в настоящей жизни. */
export function startFromSeed(seed: number, diff: DifficultyId = 'debut'): ChronicleStart {
  const pick = <T,>(list: T[], salt: number) => list[Math.abs(Math.floor(seededRandom(seed * 31 + salt)() * list.length)) % list.length];
  return { seed, diff, bio: pick(BIOS, 1), ideo: pick(IDEOLOGIES, 2) };
}

export async function newTerm(start: ChronicleStart): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, start.diff, start.ideo, start.seed);
  const base = createInitialState(ALTERNATE_COUNTRY, start.diff, start.ideo, intro, seededRandom(start.seed), 'classic', start.bio);
  return customizeLeader(base, { bio: start.bio, ideo: start.ideo });
}

/** Следующее дело на столе. */
export async function nextCase(state: GameState): Promise<GameState> {
  return startEvent(state, await classicApi.event(state));
}

const dateOf = (state: GameState, turn: number): TurnDate => turnDate(state.seed, COUNTRIES[state.country].startYear, turn);
const plain = (d: TurnDate) => ({ year: d.year, month: d.month, day: d.day });
const dayNumber = (d: { year: number; month: number; day: number }) => Date.UTC(d.year, d.month, d.day) / 86_400_000;
const fromDayNumber = (n: number) => {
  const d = new Date(n * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
};

export const dateLabel = (date: ChronicleLine['date'], withYear = false) =>
  `${date.day} ${MONTHS_GEN[date.month]}${withYear ? ` ${date.year}` : ''}`;

const paragraphs = (text: string) => String(text ?? '').split(/\n\n+/).map(part => part.trim()).filter(Boolean);

/** Начало срока: кто вы и что вам досталось. Текст — из движка, ничего не придумываем. */
export function openingLines(state: GameState): ChronicleLine[] {
  const date = plain(dateOf(state, 0));
  const situation = state.situation.replace(/^Альтернативная история\.\s*/, '');
  return [
    { id: 'open-who', kind: 'opening', date, text: `${state.leader.name}. ${state.leader.bio}` },
    ...paragraphs(situation).map((text, i) => ({ id: `open-${i}`, kind: 'opening' as const, date, text })),
    { id: 'open-speech', kind: 'speech', date, who: 'Из речи при вступлении в должность', text: `«${state.speech.trim()}»` },
  ];
}

const RES_NAME: Record<ResourceKey, string> = {
  politicalCapital: 'влияние', economy: 'экономика', military: 'силовики',
  externalReputation: 'репутация', internalLegitimacy: 'легитимность', personalResource: 'личный ресурс',
};

const DANGER = 15;

const deltaList = (res: Partial<Record<ResourceKey, number>>) => (Object.keys(RES_NAME) as ResourceKey[])
  .filter(key => res[key])
  .map(key => `${RES_NAME[key]} ${res[key]! > 0 ? '+' : '−'}${Math.abs(res[key]!)}`);

function ledger(before: GameState, after: GameState): string {
  const changes = deltaList(Object.fromEntries((Object.keys(RES_NAME) as ResourceKey[])
    .map(key => [key, after.resources[key] - before.resources[key]])));
  const summary = changes.length ? `К концу квартала: ${changes.join(', ')}.` : 'К концу квартала опоры власти не сдвинулись.';
  // Предсказуемую угрозу видно заранее: опора у порога падения названа прямо.
  const low = (Object.keys(RES_NAME) as ResourceKey[]).filter(key => after.resources[key] <= DANGER);
  return low.length && !after.ended
    ? `${summary} Опасно мало: ${low.map(key => `${RES_NAME[key]} — ${after.resources[key]}`).join(', ')}.` : summary;
}

/**
 * Хроника квартала между решением на столе в `before` и следующим делом. Строки датированы днями между двумя решениями:
 * сначала то, что сделала подпись, затем голоса и газеты, затем отклики прежних решений — отдельно от последней подписи.
 */
export function quarterLines(before: GameState, after: GameState, memory: PersonalMemory): { lines: ChronicleLine[]; memory: PersonalMemory } {
  const report = after.lastTurn;
  if (!report) return { lines: [], memory };
  const from = dateOf(before, before.turn), to = dateOf(after, after.turn);
  const quarter = splitQuarter(withoutHeadline(report.narrative, report.headline));
  const body: Omit<ChronicleLine, 'date' | 'id'>[] = [
    ...paragraphs(quarter.own).map(text => ({ kind: 'scene' as const, text })),
    ...report.reactions.map(text => ({ kind: 'voice' as const, text })),
    { kind: 'paper', who: newspaperName(after.country, after.seed, after.turn), text: report.headline },
    ...(report.press ?? []).map(item => ({ kind: 'press' as const, who: item.outlet, text: item.headline })),
    ...(report.letters ?? []).map(letter => ({ kind: 'letter' as const, who: letter.from, text: letter.text })),
    ...quarter.other.map(text => ({ kind: 'echo' as const, text })),
  ];
  // Личная строка — среди событий квартала, а не приписка в конце; первая ночь — сразу после первой подписи.
  const personal = after.ended ? { text: null, memory } : personalBeat({ before, after, month: to.month }, memory);
  if (personal.text) {
    const at = personal.first ? 0 : 1 + hashSeed(after.seed, 'personal-at', after.turn) % Math.max(1, body.length);
    body.splice(Math.min(at, body.length), 0, { kind: 'personal', text: personal.text });
  }
  body.push({ kind: 'ledger', text: ledger(before, after) });
  const start = dayNumber(from), span = Math.max(0, dayNumber(to) - start);
  const lines: ChronicleLine[] = [
    { id: `q${before.turn}-signed`, kind: 'signed', date: plain(from), text: report.choiceText },
    ...body.map((line, i) => ({ ...line, id: `q${before.turn}-${i}`,
      date: personal.first && i === 0 ? plain(from) : fromDayNumber(start + Math.round((i + 1) * span / (body.length + 1))) })),
  ];
  return { lines, memory: personal.memory };
}

// ── Варианты решения ─────────────────────────────────────────────────────────
// Обычное дело — его варианты. Бюджет, пресс-конференция и звонок в игре собираются отдельными экранами;
// здесь те же функции движка (budgetChoice, pressChoice, callChoice) с простыми шагами.

export interface Option { key: string; text: string; hint?: string }

export type Step =
  | { kind: 'choice'; options: Option[] }
  | { kind: 'press'; question: number; asked: string; who: string; options: Option[] }
  | { kind: 'call-approach'; demand: string; options: Option[] }
  | { kind: 'call-ending'; reply: string; approach: Approach; options: Option[] };

export const BUDGET_PRESETS: { key: string; text: string; alloc: Record<string, number>; debt: boolean }[] = [
  { key: 'even', text: 'Поровну на все пять статей, без долгов', alloc: { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, debt: false },
  { key: 'people', text: 'Пенсии и пособия вперёд и занять ещё 3 млрд', alloc: { army: 2, social: 5, economy: 2, apparatus: 2, culture: 2 }, debt: true },
  { key: 'build', text: 'Дороги и заказы заводам, остальным — по минимуму', alloc: { army: 2, social: 2, economy: 4, apparatus: 1, culture: 1 }, debt: false },
];

// У бюджетного набора движок не пишет подсказку: цена видна из самой сделки — сразу и через три квартала, если взят долг.
function budgetHint(choice: Choice): string {
  const now = deltaList(choice.deal?.res ?? {}), later = choice.deal?.later;
  return [now.length ? `Сразу: ${now.join(', ')}.` : 'Опоры не сдвинутся.',
    later ? `Через ${later.turns} квартала: ${deltaList(later.res).join(', ')}.` : ''].filter(Boolean).join(' ');
}

const budgetOf = (state: GameState, preset: (typeof BUDGET_PRESETS)[number]): Choice =>
  ({ ...budgetChoice(state, preset.alloc, preset.debt), text: `Бюджет года: ${preset.text.toLowerCase()}` });

const unique = (options: Option[]) => options.filter((option, i) => options.findIndex(other => other.text === option.text) === i);

/** Первый шаг решения по делу на столе. */
export function firstStep(state: GameState): Step {
  const event = state.currentEvent!;
  if (event.press) return pressStep(state, []);
  if (event.call && !event.call.negotiation) {
    return { kind: 'call-approach', demand: event.call.demand, options: APPROACHES.map(a => ({ key: a.id, text: a.text })) };
  }
  if (event.budget) {
    return { kind: 'choice', options: [
      ...BUDGET_PRESETS.map(preset => ({ key: `budget:${preset.key}`, text: preset.text, hint: budgetHint(budgetOf(state, preset)) })),
      { key: event.choices[0].id, text: event.choices[0].text, hint: event.choices[0].hint },
    ] };
  }
  return { kind: 'choice', options: unique(event.choices.map(choice => ({ key: choice.id, text: choice.text, hint: choice.hint }))) };
}

export function pressStep(state: GameState, picks: number[]): Step {
  const questions = state.currentEvent!.press!.questions;
  const question = questions[picks.length];
  return { kind: 'press', question: picks.length, asked: question.text, who: question.who,
    options: question.answers.map((answer, i) => ({ key: String(i), text: answer.text })) };
}

export function callEndingStep(state: GameState, approach: Approach): Step {
  const call = state.currentEvent!.call!;
  return { kind: 'call-ending', approach, reply: callReply(state.seed, call, approach, approachWorks(call.trait, approach)),
    options: CALL_ENDINGS.map(ending => ({ key: ending.id, text: ending.text })) };
}

const withChoice = (state: GameState, choice: Choice): GameState =>
  ({ ...state, currentEvent: { ...state.currentEvent!, choices: [choice, ...state.currentEvent!.choices.slice(1)] } });

async function sign(state: GameState, choice: Choice | null, id: string): Promise<GameState> {
  const ready = choice ? withChoice(state, choice) : state;
  const choiceId = choice ? choice.id : id;
  return resolveTurn(ready, choiceId, await classicApi.consequence(ready, choiceId));
}

/** Подпись обычного варианта или бюджетного набора. */
export async function signOption(state: GameState, key: string): Promise<GameState> {
  const preset = key.startsWith('budget:') ? BUDGET_PRESETS.find(p => `budget:${p.key}` === key) : undefined;
  return preset ? sign(state, budgetOf(state, preset), '') : sign(state, null, key);
}

export const signPress = (state: GameState, picks: number[]) => sign(state, pressChoice(state, picks), '');
export const signCall = (state: GameState, approach: Approach, ending: (typeof CALL_ENDINGS)[number]['id']) =>
  sign(state, callChoice(state, approach, ending), '');

// ── Конец срока ──────────────────────────────────────────────────────────────

/** Хроника кончается с падением власти или после выборов в конце первого срока. */
export const termOver = (state: GameState) => !!state.ended || state.turn >= TERM;

export async function memoir(state: GameState) {
  const lastVote = state.elections.at(-1);
  // Дожившему срок движок вердикта не пишет (без endType он считает партию провалом): итог — переизбрание.
  const finished = state.ended ? state : { ...state, endType: lastVote?.outcome === 'won' ? 'reelected' as const : 'mandate' as const };
  const verdict = await classicApi.ending(finished);
  return {
    fall: state.ended && verdict.fallNarrative
      ? { id: 'fall', kind: 'fall' as const, date: plain(dateOf(state, state.turn)), text: verdict.fallNarrative } : null,
    years: `${COUNTRIES[state.country].startYear}–${state.year}`,
    outcome: END_TYPES[finished.endType ?? 'collapse'],
    title: verdict.title,
    verdict: verdict.verdict,
    epitaph: verdict.epitaph,
  };
}
