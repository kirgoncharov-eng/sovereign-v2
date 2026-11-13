import { advisorSigningState, usesAdvisorOutlook } from "./advisor-outlook.ts";
// «Хроника срока» (#298): тот же движок 1978 года, но срок читается одной непрерывной хроникой.
// Между решениями время течёт само: исполнение подписи, голоса людей, пресса, отклики прежних решений.
// На решении история стоит и ждёт. Здесь только представление уже разрешённых ходов: ни тиков, ни скрытых факторов.
import { budgetChoice, callChoice, callReply, approachWorks, classicApi, customizeLeader, freshLeaderName, pressChoice } from '../game/classic.ts';
import { conveneCouncil, createInitialState, hashSeed, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { openDeskWhenDue } from '../game/desk-timing.ts';
import { interveneWorld, type WorldDispatch } from '../game/living-world.ts';
import { confirmInitiative, initiativeOptions, type InitiativeId } from '../game/initiatives.ts';
import { applyDossier, hireAdvisor, type DossierAction } from '../game/staffing.ts';
import { initiativeBlockReason } from './initiative-note.ts';
import { initPromises, offeredPromises } from '../game/promises.ts';
import { secretaryInventory } from '../game/secretary.ts';
import { replyToLetter } from '../game/stories.ts';
import { COUNTRIES, END_TYPES, TERM } from '../game/data.ts';
import { MONTHS_GEN, turnDate, type TurnDate } from '../game/calendar.ts';
import { newspaperName } from '../game/newspaper-editions.ts';
import { splitQuarter } from '../game/turn-report.ts';
import { APPROACHES, CALL_ENDINGS, type Approach } from '../content/calls.ts';
import { ELECTION_NIGHT, ELECTION_NIGHT_AGAIN_1978, HISTORICAL_PRESS_ELECTION_NIGHT } from '../content/roles.ts';
import { MEANWHILE } from '../content/reactions.ts';
import { leadsWithHeadline } from './brief.ts';
import { presidentialMessages, readPresidentialMessages } from './presidential-inbox.ts';
import { personalBeat, type PersonalMemory } from './chronicle-personal.ts';
import { quarterLedger } from './chronicle-ledger.ts';
import { countryLines } from './chronicle-country.ts';
import { factoryQuarterReports } from './factory-mandate.ts';
import type { Choice, DifficultyId, GameState, IdeologyId, ResourceKey } from '../game/types.ts';

// 'vote' — блок выборов; 'country' — фон квартала; 'notice' — короткое сообщение с ярлыком в `who` (#426).
// Старый клиент рисует незнакомый вид строки как сцену: снимок ленты читается в обе стороны.
export type LineKind = 'opening' | 'speech' | 'signed' | 'scene' | 'voice' | 'paper' | 'press' | 'letter' | 'echo'
  | 'personal' | 'ledger' | 'fall' | 'report' | 'secretary' | 'vote' | 'country' | 'notice';

export interface ChronicleLine {
  id: string;
  kind: LineKind;
  text: string;
  who?: string;   // газета, издание, автор письма или речи
  date: { year: number; month: number; day: number };
  /** Только до печати: короткая строка вместо полной, если лента уже рассказывала это дословно. `withoutRepeats` её снимает. */
  again?: string;
  /** Только до печати: пояснение, которое дописывается к строке один раз за срок. `withoutRepeats` его снимает. */
  once?: string;
}

export interface ChronicleStart {
  seed: number;
  diff: DifficultyId;
  bio: string;
  ideo: IdeologyId;
}

const BIOS = ['officer', 'economist', 'lawyer', 'diplomat', 'mayor'];
const IDEOLOGIES: IdeologyId[] = ['liberal', 'nationalist', 'pragmatist', 'leftist'];

/** Готовый выбор анкеты по умолчанию: биография и взгляды по зерну. Игрок меняет их в анкете ЦИК. */
export function startFromSeed(seed: number, diff: DifficultyId = 'debut'): ChronicleStart {
  const pick = <T,>(list: T[], salt: number) => list[Math.abs(Math.floor(seededRandom(seed * 31 + salt)() * list.length)) % list.length];
  return { seed, diff, bio: pick(BIOS, 1), ideo: pick(IDEOLOGIES, 2) };
}

/** Кандидат до анкеты: то же состояние, что `/game` собирает в `Setup` для партии 1978 года. */
export async function newTerm(start: ChronicleStart): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, start.diff, start.ideo, start.seed);
  const base = createInitialState(ALTERNATE_COUNTRY, start.diff, start.ideo, intro, seededRandom(start.seed), 'classic', start.bio);
  return customizeLeader(base, { bio: start.bio, ideo: start.ideo });
}

// ── Анкета ЦИК ───────────────────────────────────────────────────────────────
// Те же поля и функции, что на экране вступления `/game` (`PresidentialOpening`): имя, биография, взгляды, обещания.

/** Другое имя кандидата: тот же ряд имён, что у кнопки на экране вступления. */
export const renameCandidate = (state: GameState, step: number) =>
  customizeLeader(state, { name: freshLeaderName(state, false, step) });

/** Биография или взгляды кандидата. Портрет следует за биографией, как в `/game`. */
export const fillForm = (state: GameState, field: { bio?: string; ideo?: IdeologyId }) => customizeLeader(state, field);

/** Обещания предвыборной программы: пять на выбор, три предложены. */
export const programOf = (state: GameState) => offeredPromises(state.seed, state.ideo);

const daysBefore = (state: GameState, days: number) => fromDayNumber(dayNumber(plain(dateOf(state, 0))) - days);

/** Выдвижение: ЦИК принимает документы кандидата за шесть недель до выборов; выборы — за три недели до вступления. */
export const candidacyLines = (state: GameState): ChronicleLine[] => [
  { id: 'cik-open', kind: 'opening', date: daysBefore(state, 63),
    text: 'Центральная избирательная комиссия Неманской республики принимает документы кандидатов в президенты. До выборов шесть недель.' },
];

/** Кампания и ночь подсчёта — подача, а не расчёт: партия начинается с того же состояния, что в `/game`. */
export const electionLines = (state: GameState): ChronicleLine[] => [
  { id: 'cik-campaign', kind: 'scene', date: daysBefore(state, 61),
    text: 'Документы приняты. Шесть недель агитации: районные дома культуры, заводские проходные, вечерний эфир республиканского радио.' },
  { id: 'cik-night', kind: 'scene', date: daysBefore(state, 21),
    text: `Ночь подсчёта вы проводите в штабе партии «${state.leader.party}». Сводки из областей приходят до утра.` },
  { id: 'cik-result', kind: 'paper', date: daysBefore(state, 20), who: newspaperName(state.country, state.seed, 0),
    text: `ЦИК объявил итоги выборов: президент республики — ${state.leader.name}` },
];

/** Победа и вступление в должность: обещания и стол — как в `/game` после экрана вступления. */
export const takeOffice = (state: GameState, promises: string[]): GameState =>
  openDeskWhenDue({ ...state, promises: initPromises(promises, state.resources) });

/** Следующее дело на столе. Газета прошлого квартала уже закрыта, как после «Следующего хода» в `/game`. */
export async function nextCase(state: GameState): Promise<GameState> {
  const closed = { ...state, lastTurn: null };
  return startEvent(closed, await classicApi.event(closed));
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

const deltaList = (res: Partial<Record<ResourceKey, number>>) => (Object.keys(RES_NAME) as ResourceKey[])
  .filter(key => res[key])
  .map(key => `${RES_NAME[key]} ${res[key]! > 0 ? '+' : '−'}${Math.abs(res[key]!)}`);

// Доклады поручений и правительства за квартал. Письмо, которое ждёт ответа, придёт остановкой, а не строкой.
function reports(before: GameState, after: GameState) {
  const waiting = new Set(presidentialMessages(after).filter(message => message.needsReply).map(message => message.token));
  return (after.world?.dispatches ?? [])
    .filter(dispatch => dispatch.turn > before.turn && dispatch.turn <= after.turn && !waiting.has(dispatch.id));
}

function withoutReportEchoes(echoes: string[], dispatches: WorldDispatch[]): string[] {
  // Движок сохраняет доклад и в dispatches, и в рассказе квартала. В хронике он уже есть отдельной строкой.
  // Убираем только точные повторы его абзацев: соседние новости министра и другие отклики остаются (#313, C01).
  // Письма, ожидающие ответа, не входят в dispatches выше, поэтому их рассказ здесь не пропадает.
  const reported = new Set(dispatches.flatMap(dispatch => paragraphs(dispatch.text)));
  return echoes.filter(text => !reported.has(text.replace(/^(?:Из промышленного региона\.|Районные больницы\.)\s*/, '')));
}

// Сцена уже сообщила результат. Из газетной строки убираем только точное повторение заголовка;
// оценка редакции и самостоятельные новости остаются. Без сцены это правило не применяется.
function pressAfterScene(text: string, headline: string): string {
  const fact = headline.trim().replace(/[.!?…]+$/, '');
  if (!fact || !text.startsWith(fact)) return text;
  const rest = text.slice(fact.length);
  if (rest && !/^[.!?…](?:\s|$)/u.test(rest)) return text;
  return rest.replace(/^[.!?…]\s*/u, '').trim();
}

// Только срочное начало заводской истории: выплата/запрос документов — в день подписи,
// обещанный аванс — в пятницу. Переоборудование и остальные дела по-прежнему занимают часть квартала.
function factoryExecutionDay(before: GameState, after: GameState, start: number): number | null {
  if (before.country !== ALTERNATE_COUNTRY || before.daily) return null;
  const event = before.currentEvent, report = after.lastTurn;
  const route = event?.choices.findIndex(choice => choice.text === report?.choiceText) ?? -1;
  if (!report || route < 0) return null;
  if (event?.card === 'alt_wages') return route < 2 ? start : null;
  if (event?.beat?.arcId !== 'alt_contracts' || event.beat.turn !== 1) return null;
  if (event.title === 'Опись из заводской бухгалтерии') {
    // Директору прямо дали неделю; при ошибочном обыске расчётные листы не выдавали два дня.
    return start + (route === 2 ? 7 : route === 1 && !report.success ? 2 : 0);
  }
  if (event.title === 'Три копии одного договора') return start + (route === 0 && !report.success ? 1 : 0);
  const delayedAdvance = event.title === 'Приложение к российскому заказу';
  if (delayedAdvance && route === 2 && report.success) {
    return start + (5 - new Date(start * 86_400_000).getUTCDay() + 7) % 7;
  }
  const archive = delayedAdvance || event.title === 'Дело выданного аванса';
  return start + (archive && route === 1 && !report.success ? 1 : 0);
}

// ── Что есть что в абзацах «В том же квартале» (#426) ───────────────────────────
const ELECTION_PARAGRAPH = /^(?:Парламентские|Президентские) выборы\./;
const ELECTION_PRESS = /(?:Второе место — «|У партии власти — )/;
const PROGRAM_PARAGRAPH = /^(?:Из промышленного региона\.|Районные больницы\.)/;
// Подсказка интерфейса стола: в ленте ответ даётся остановкой, а не «в резолюции этого письма».
const DESK_HINT = /\s*Ответ можно подписать в резолюции этого письма\./g;
/** Ярлык строки «В том же квартале»: последствие прежней подписи, доклад региона или просто жизнь квартала. */
export const QUARTER_LIFE = 'В том же квартале';
export const FROM_REGIONS = 'Из регионов';

type Draft = Omit<ChronicleLine, 'date' | 'id'> & { day?: 'vote' | 'eve' | 'scene' };

// Связка времени в начале строки привязывает её к сцене, а не к середине квартала (#435):
// «Почти в ту же минуту…» через неделю после сцены читается как ошибка. «Наутро» — следующий день.
const SAME_DAY = [...MEANWHILE.filter(lead => lead !== 'Наутро'), 'Вечером'];
const sceneOffset = (text: string): number | null =>
  text.startsWith('Наутро ') ? 1 : SAME_DAY.some(lead => text.startsWith(`${lead} `)) ? 0 : null;

// Голос, газетная строка, отклик и строка приёмной звучат один раз за срок: дословный повтор читается как сбой (#426).
// Сцена подписи, выборы, письма, доклады и сообщения с ярлыком не отбрасываются: это факты квартала.
const ONCE: LineKind[] = ['voice', 'press', 'echo', 'secretary'];
const onceKey = (line: Pick<ChronicleLine, 'kind' | 'text'>) => ONCE.includes(line.kind) ? line.text.trim() : null;
// Факт квартала повторяется (тот же фон, тот же невыполненный доклад) — лента называет его, но не пересказывает
// теми же словами (#310, C01): фон страны печатается короткой строкой, пояснение и причина — один раз.
const sentencesOf = (text: string) => text.split(/(?<=[.!?…»])\s+/).map(part => part.trim()).filter(Boolean);
const CAUSE_TAIL = /\s*Причина(?: остаётся прежней)?: ([^]+)$/;
const CAUSE_LABEL = /Причина(?: остаётся прежней)?: /;
const tellsCause = (line: Pick<ChronicleLine, 'kind'>) => line.kind === 'echo' || line.kind === 'report';
// Причину невыполненной программы и пояснение правила лента помнит по предложениям.
const remembered = (line: Pick<ChronicleLine, 'kind' | 'text'>) =>
  line.kind === 'notice' || tellsCause(line) ? sentencesOf(line.text.replace(CAUSE_LABEL, '')) : [];

/** Предложения, которые лента уже печатала, — чтобы новый квартал их не повторял. */
export const toldInChronicle = (lines: Pick<ChronicleLine, 'kind' | 'text'>[]) => new Set(lines.flatMap(line => [
  ...(onceKey(line) ? [onceKey(line)!] : []),
  ...(line.kind === 'country' ? [line.text.trim()] : []),
  ...remembered(line),
]));

/** Строки квартала без дословных повторов уже напечатанного и друг друга. */
export function withoutRepeats<T extends Pick<ChronicleLine, 'kind' | 'text' | 'again' | 'once'>>(lines: T[], told: ReadonlySet<string>): T[] {
  const seen = new Set(told);
  return lines.flatMap(source => {
    const { again, once, ...rest } = source;
    let line = rest as T;
    const key = onceKey(line);
    if (key !== null) {
      if (seen.has(key)) return [];
      seen.add(key);
    }
    if (line.kind === 'country') {
      const full = line.text.trim();
      if (seen.has(full) && again) line = { ...line, text: again };
      seen.add(full);
    }
    if (once) {
      if (!seen.has(once)) line = { ...line, text: `${line.text} ${once}` };
      seen.add(once);
    }
    // «Причина: …» в конце доклада, уже названная теми же словами, второй раз не печатается.
    const cause = tellsCause(line) ? line.text.match(CAUSE_TAIL) : null;
    if (cause) {
      const without = line.text.replace(CAUSE_TAIL, '').trim();
      if (without && sentencesOf(cause[1]).every(sentence => seen.has(sentence))) line = { ...line, text: without };
    }
    for (const sentence of remembered(line)) seen.add(sentence);
    return [line];
  });
}

// Реплика ночи выборов узнаётся по неизменным частям своего шаблона: имя и должность в ней подставлены движком.
const NIGHT_PARTS = [...Object.values(ELECTION_NIGHT).flatMap(groups => Object.values(groups).flat()), ...Object.values(HISTORICAL_PRESS_ELECTION_NIGHT).flat(),
  ...Object.values(ELECTION_NIGHT_AGAIN_1978).flatMap(groups => Object.values(groups))]
  .map(template => template.split(/\{[^}]+\}/).map(part => part.trim().replace(/^[,.:]\s*|\s*[,:]$/g, '')).filter(part => part.length >= 12))
  .filter(parts => parts.length > 0);
const isElectionNightLine = (text: string) => NIGHT_PARTS.some(parts => parts.every(part => text.includes(part)));

/**
 * Хроника квартала между решением на столе в `before` и следующим делом. Строки датированы днями между двумя решениями:
 * сначала выборы, если они были, затем то, что сделала подпись, голоса и газеты, жизнь страны и отклики прежних решений.
 */
export function quarterLines(before: GameState, after: GameState, memory: PersonalMemory): { lines: ChronicleLine[]; memory: PersonalMemory } {
  const report = after.lastTurn;
  if (!report) return { lines: [], memory };
  const dispatches = reports(before, after);
  const from = dateOf(before, before.turn), to = dateOf(after, after.turn);
  const start = dayNumber(from), span = Math.max(0, dayNumber(to) - start);
  const execution = factoryExecutionDay(before, after, start);
  // В газете заголовок стоит над текстом, а в хронике — после сцены. Поэтому сцена сохраняет своё начало, иначе следующая фраза
  // («На ней…», «Вместо него…») остаётся без опоры, а совпавший заголовок не печатается второй раз (#310, C02).
  const quarter = splitQuarter(report.narrative);
  const headlineTold = leadsWithHeadline(report.narrative, report.headline);
  const historical = before.country === ALTERNATE_COUNTRY && !before.daily;
  const election = historical ? report.election : null;
  const ownParagraphs = paragraphs(quarter.own);
  // Ночь президентских выборов движок ставит первым абзацем газеты, парламентских — под «В том же квартале».
  // В ленте выборы — отдельный блок одного дня: заголовок, итог, второе место и первый ночной звонок (#426).
  const voteInOwn = election ? ownParagraphs.findIndex(text => ELECTION_PARAGRAPH.test(text)) : -1;
  const voteInOther = election && voteInOwn < 0 ? quarter.other.findIndex(text => ELECTION_PARAGRAPH.test(text)) : -1;
  const voteText = voteInOwn >= 0 ? ownParagraphs[voteInOwn] : voteInOther >= 0 ? quarter.other[voteInOther] : null;
  // Парламентская ночь: сразу за итогом движок ставит слова самого близкого человека о результате.
  const voteCall = voteInOther >= 0 ? quarter.other[voteInOther + 1] ?? null : null;
  // Президентская ночь: тот же звонок стоит среди абзацев газеты после итогов срока.
  const nightCall = voteInOwn >= 0 ? ownParagraphs.findIndex((text, i) => i > voteInOwn && isElectionNightLine(text)) : -1;
  // В ночь президентских выборов доклад программы стоит и среди абзацев газеты, и отдельной строкой: оставляем доклад.
  const scenes = withoutReportEchoes(ownParagraphs.filter((_, i) => i !== voteInOwn && i !== nightCall), dispatches);
  const other = quarter.other.filter((_, i) => voteInOther < 0 || (i !== voteInOther && i !== voteInOther + 1));
  const sceneTellsResult = historical && scenes.length > 0;
  const press: Draft[] = (report.press ?? []).flatMap((item): Draft[] => {
    // Газета о выборах печатается целиком: сцена дела о них не рассказывала.
    if (voteText && ELECTION_PRESS.test(item.headline)) return [{ kind: 'press', who: item.outlet, text: item.headline, day: 'vote' }];
    const text = sceneTellsResult ? pressAfterScene(item.headline, report.headline) : item.headline;
    return text ? [{ kind: 'press', who: item.outlet, text }] : [];
  });
  const votePress = press.filter(line => line.day === 'vote');
  const told = historical ? countryLines(before, after) : { own: [], background: [], deadline: [], quarter: [] };
  // Срок обещаний — выборы: что сдержано и что нет, страна узнаёт в ту же ночь.
  const vote: Draft[] = voteText ? [
    { kind: 'vote', text: voteText, day: 'vote' },
    ...votePress,
    ...told.deadline.map(line => ({ ...line, day: 'vote' as const })),
    ...(voteCall ? [{ kind: 'scene' as const, text: voteCall, day: 'vote' as const }] : []),
    ...(nightCall >= 0 ? [{ kind: 'scene' as const, text: ownParagraphs[nightCall], day: 'vote' as const }] : []),
  ] : [];
  const matured = (report.matured ?? []).flatMap(pending => pending.story ? [pending.story] : []);
  const echoes = withoutReportEchoes(other, dispatches).map(raw => {
    const text = raw.replace(DESK_HINT, '').trim();
    // Отклик — только последствие прежней подписи; доклад региона и жизнь квартала называются своими именами.
    const who = !historical || text.startsWith('Аукается ') || matured.some(story => text.endsWith(story)) ? undefined
      : PROGRAM_PARAGRAPH.test(text) ? FROM_REGIONS : QUARTER_LIFE;
    return { kind: 'echo' as const, text, ...(who ? { who } : {}) };
  }).filter(line => line.text).reduce<Draft[]>((merged, line) => {
    // «Причина: …» — продолжение доклада региона, а не отдельная новость квартала.
    const previous = merged.at(-1);
    if (previous?.who === FROM_REGIONS && line.text.startsWith('Причина: ')) merged[merged.length - 1] = { ...previous, text: `${previous.text} ${line.text}` };
    else merged.push(line);
    return merged;
  }, []);
  // Квартал, в котором власть кончилась: сначала решение и отклики на него, развязка — последней (#435).
  // Иначе преемник «выслушивает новость» о вашей резолюции уже после собственной победы.
  const closing = after.ended && !voteText && scenes.length > 1 ? scenes.slice(1) : [];
  const opening = closing.length ? scenes.slice(0, 1) : scenes;
  const body: Draft[] = [
    ...vote,
    ...opening.map(text => ({ kind: 'scene' as const, text })),
    // Закон и обещание, решённые этой подписью, — тем же днём, что её сцена.
    ...told.own.map(line => ({ ...line, day: 'scene' as const })),
    // Голоса со связкой времени («Вечером…», «Наутро…») стоят первыми: они о дне решения.
    ...report.reactions.map(text => ({ kind: 'voice' as const, text }))
      .sort((a, b) => Number(sceneOffset(b.text) !== null) - Number(sceneOffset(a.text) !== null)),
    ...(headlineTold || sceneTellsResult || voteText ? [] : [{ kind: 'paper' as const, who: newspaperName(after.country, after.seed, after.turn), text: report.headline }]),
    ...press.filter(line => line.day !== 'vote'),
    ...told.background,
    ...(report.letters ?? []).filter(letter => !letter.replies?.length)
      .map(letter => ({ kind: 'letter' as const, who: letter.from, text: letter.text })),
    ...dispatches.map(dispatch => ({ kind: 'report' as const, who: dispatch.title, text: dispatch.text })),
    ...factoryQuarterReports(before, after).map(dispatch => ({ kind: 'report' as const, who: dispatch.title, text: dispatch.text })),
    ...echoes,
    ...(voteText ? [] : told.deadline),
    ...closing.map(text => ({ kind: 'scene' as const, text })),
    ...told.quarter,
  ];
  // Личная строка — среди событий квартала, а не приписка в конце; первая ночь — сразу после первой подписи.
  const personal = after.ended ? { text: null, memory } : personalBeat({ before, after, month: to.month }, memory);
  if (personal.text) {
    // Канун выборов — последняя строка квартала: голосование открывает следующий.
    const eve = personal.memory.used.at(-1) === 'election-eve';
    const morning = scenes.findIndex((text, i) => i > 0 && text.startsWith('Наутро '));
    const at = eve ? body.length
      : personal.first ? execution === start ? vote.length + (morning < 0 ? scenes.length : morning) : 0
        : 1 + vote.length + hashSeed(after.seed, 'personal-at', after.turn) % Math.max(1, body.length - vote.length);
    body.splice(Math.min(at, body.length), 0, { kind: 'personal', text: personal.text, ...(eve ? { day: 'eve' as const } : {}) });
  }
  if (usesAdvisorOutlook(before) && report.forecasts?.length) body.push({ kind: 'report', who: report.forecasts[0], text: report.forecasts.slice(1).join('\n') });
  body.push({ kind: 'ledger', text: quarterLedger(before, after) });
  // Выборы — на следующий день после подписи; остальное делит оставшиеся дни квартала.
  const voteDay = Math.min(start + span, start + 1);
  const tiedTo = (line: Draft) => line.day === 'scene' ? 0
    : !line.day && (line.kind === 'scene' || line.kind === 'voice') ? sceneOffset(line.text) : null;
  // Дни квартала делят только строки без привязки: привязанные к сцене и к выборам своей очереди не занимают.
  const spread = body.filter(line => !line.day && (!historical || tiedTo(line) === null)).length;
  // Пресс-конференция, бюджет и звонок — сами и есть подпись: их сцена стоит в день подписи, а не через недели (#435).
  const act = before.currentEvent;
  const signedScene = historical && !voteText && !!(act?.press || act?.budget || act?.call)
    ? body.findIndex(line => line.kind === 'scene' && !line.day) : -1;
  let previous = start, order = 0, sceneDay: number | null = null;
  const lines: ChronicleLine[] = [
    { id: `q${before.turn}-signed`, kind: 'signed', date: plain(from), text: report.choiceText },
    ...body.map((draft, i) => {
      const { day, ...line } = draft;
      // Строка со связкой времени («Почти в ту же минуту…», «Наутро…») датируется по сцене квартала, а не по своему месту в очереди.
      const tied = historical && sceneDay !== null ? tiedTo(draft) : null;
      if (!day && tied === null) order++;
      const scheduled = day === 'vote' ? voteDay
        : day === 'eve' ? start + span - 1
          : personal.first && line.kind === 'personal' ? start
            : line.kind === 'scene' && execution !== null ? execution + (line.text.startsWith('Наутро ') ? 1 : 0)
              : i === signedScene ? start
                : tied !== null ? sceneDay! + tied
                  : start + Math.round(order * span / (spread + 1));
      previous = Math.max(previous, Math.min(start + span, scheduled));
      if (line.kind === 'scene') sceneDay = previous;
      return { ...line, id: `q${before.turn}-${i}`, date: fromDayNumber(previous) };
    }),
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

// Подпись закрывает квартал так же, как в `/game`: итог хода, затем стол открывается, когда пришёл его срок.
async function sign(state: GameState, choice: Choice | null, id: string): Promise<GameState> {
  const ready = advisorSigningState(choice ? withChoice(state, choice) : state);
  const choiceId = choice ? choice.id : id;
  return openDeskWhenDue(resolveTurn(ready, choiceId, await classicApi.consequence(ready, choiceId)));
}

/** Подпись обычного варианта или бюджетного набора. */
export async function signOption(state: GameState, key: string): Promise<GameState> {
  const preset = key.startsWith('budget:') ? BUDGET_PRESETS.find(p => `budget:${p.key}` === key) : undefined;
  return preset ? sign(state, budgetOf(state, preset), '') : sign(state, null, key);
}

/** Вариант дела по id — обычный, предложенный советом или выбранный в разговоре: как `choose` в `/game`. */
export const signChoice = (state: GameState, id: string) => sign(state, null, id);

/** Бюджет, собранный по статьям и с долгом или без, — тем же `budgetChoice`, что экран бюджета в `/game`. */
export const signBudget = (state: GameState, alloc: Record<string, number>, debt: boolean) => sign(state, budgetChoice(state, alloc, debt), '');

/** Совет по делу: предложения советников ложатся на стол рядом с вариантами, как в `/game`. */
export const convene = (state: GameState, proposals: Choice[]) => conveneCouncil(state, proposals);

export const signPress = (state: GameState, picks: number[]) => sign(state, pressChoice(state, picks), '');
export const signCall = (state: GameState, approach: Approach, ending: (typeof CALL_ENDINGS)[number]['id']) =>
  sign(state, callChoice(state, approach, ending), '');

// ── Остановки между подписями ────────────────────────────────────────────────
// Ответы на обращения — те же функции, что у панелей папки `/game`: interveneWorld и replyToLetter.

/** Обращение открыто: прочитано, как при открытии письма в папке. */
export const openLetter = (state: GameState, person: string, key: string) => readPresidentialMessages(state, person, key);

/** Ответ на обращение или предложение — действие поручений, секретаря или правительства. */
export const actOnLetter = (state: GameState, actionId: string) => interveneWorld(state, actionId);

/** Ответ на письмо человека из газеты квартала. */
export const answerStory = (state: GameState, story: string, reply: string) => replyToLetter(state, story, reply);

/** Секретарь приносит дела квартала: её строка перед первой остановкой. Без неё — строка канцелярии. */
export function secretaryLine(state: GameState): ChronicleLine | null {
  const text = secretaryInventory(state);
  if (!text) return null;
  return { id: `q${state.turn}-secretary`, kind: 'secretary', who: state.world?.secretary?.present ? state.world.secretary.name : 'Канцелярия',
    date: plain(dateOf(state, state.turn)), text };
}

// ── Справка: распоряжения в любой момент ─────────────────────────────────────
// Те же действия, что из шапки и разделов `/game`: инициатива опоры, назначение из резерва, досье советника.

/** Инициатива из окна опоры — с той же проверкой, что `signInitiative` в `/game`. */
export function signInitiative(state: GameState, id: string): GameState {
  const option = initiativeOptions(state).find(entry => entry.id === id);
  if (!option) throw new Error('Это распоряжение больше недоступно');
  const blocked = initiativeBlockReason(state, option);
  if (blocked) throw new Error(blocked);
  return confirmInitiative(state, id as InitiativeId);
}

export const hire = (state: GameState, candidateId: string) => hireAdvisor(state, candidateId);
export const actOnDossier = (state: GameState, advisorId: string, action: DossierAction) => applyDossier(state, advisorId, action);

// ── Конец срока ──────────────────────────────────────────────────────────────

/** Хроника кончается вместе с властью, как партия в `/game`: после переизбрания идёт второй срок. */
export const termOver = (state: GameState) => !!state.ended;

/** Первый срок прожит: для сравнения с другими президентами того же января. */
export const firstTermOver = (state: GameState) => !!state.ended || state.turn >= TERM;

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
