// Вопрос пресс-конференции о собственной подписи: журналист называет решение, которое вы подписали, и лагерь,
// которому оно дорого обошлось. Три ответа стоят по-разному, и цена зависит от того, сколько раз этот лагерь
// уже был задет (#142).
import { CALL_TEXT } from "../content/calls.ts";
import { PRESS_TEXT } from "../content/press.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import type { Faction, GameState, HistoryEntry, PressAnswer, PressQuestion, SpecialKind } from "./types.ts";

// Базовый вопрос в пуле называется так; в событии он получает id «sign_<лагерь>»: о каждом лагере спрашивают раз.
export const SIGNATURE_QUESTION_ID = "sign";
const SIGNATURE_PREFIX = `${SIGNATURE_QUESTION_ID}_`;
export const askedSignatures = (askedIds: Iterable<string>): Set<string> =>
  new Set([...askedIds].filter(id => id.startsWith(SIGNATURE_PREFIX)).map(id => id.slice(SIGNATURE_PREFIX.length)));
export const SIGNATURE_SECONDS = 25;

// Лагерь недоволен, если отношение к вам не выше этого порога.
const DISCONTENT_AT_MOST = 10;
// С такого числа задевших решений недовольство считается накопившимся: цена ответов меняется.
const REPEAT_FROM = 3;
// Особые дела — не подписи под делом: пресс-конференция, звонок, бюджет, вопрос о сроках. Движок отмечает их в истории
// (`special`); у записей из сохранений до этой отметки остаются известные тексты выбора, включая бюджет «Хроники».
const NOT_SIGNATURES = new Set<SpecialKind>(["press", "call", "budget", "terms"]);
const LEGACY_SPECIAL_CHOICES = new Set(["Ответить на вопросы журналистов", "Утвердить бюджет на год", "Разговор по защищённой линии",
  PRESS_TEXT.skip.text, CALL_TEXT.hangup.text]);
const CHRONICLE_BUDGET = "Бюджет года:";
const isSpecial = (entry: HistoryEntry) => entry.special
  ? NOT_SIGNATURES.has(entry.special)
  : LEGACY_SPECIAL_CHOICES.has(entry.choice) || entry.choice.startsWith(CHRONICLE_BUDGET);

export interface SignatureCase {
  entry: HistoryEntry;
  camp: Faction;
  hurtCount: number;
}

const isSignature = (entry: HistoryEntry) => entry.success !== false && !!entry.hurt?.length && !isSpecial(entry);

// Самая свежая подпись, задевшая лагерь, который сейчас недоволен. Только партия 1978 года: у архивных стран набор
// вопросов не меняется.
export function signatureCase(state: GameState, skip: ReadonlySet<string> = new Set()): SignatureCase | null {
  if (state.country !== ALTERNATE_COUNTRY || state.daily) return null;
  const history = state.history ?? [];
  for (const entry of [...history].reverse()) {
    if (!isSignature(entry)) continue;
    const camp = state.factions.find(group => entry.hurt!.includes(group.id) && group.relation <= DISCONTENT_AT_MOST && !skip.has(group.id));
    if (camp) return { entry, camp, hurtCount: history.filter(item => isSignature(item) && item.hurt!.includes(camp.id)).length };
  }
  return null;
}

const bare = (text: string) => text.trim().replace(/[.!?…]+$/, "");

// Решения в деле записаны инфинитивом («Изъять журнал выдачи…»): тогда журналист говорит по-человечески —
// «Вы распорядились изъять журнал выдачи…». Иначе цитирует подпись дословно.
const INFINITIVE = /^\S+(ть|ти|чь|ться|тись)(\s|$)/i;
function whatYouDid(choice: string): string {
  const act = bare(choice);
  return INFINITIVE.test(act) ? `Вы распорядились ${act[0].toLowerCase()}${act.slice(1)}.` : `Вы подписали: „${act}“.`;
}

// Названия лагерей бывают и во множественном числе: «Областные советы», «Независимые редакции».
const isPlural = (name: string) => /^\S+(ые|ие)\s/.test(name);
// «уже пятым ударом»; дальше десятого счёт теряет смысл для речи — «очередным».
const ORDINAL_INSTRUMENTAL = ["", "", "вторым", "третьим", "четвёртым", "пятым", "шестым", "седьмым", "восьмым", "девятым", "десятым"];

export function signatureQuestion(state: GameState, skip: ReadonlySet<string> = new Set()): PressQuestion | null {
  const found = signatureCase(state, skip);
  if (!found) return null;
  const { entry, camp, hurtCount } = found;
  const bloc = camp.bloc;
  const repeated = hurtCount >= REPEAT_FROM;
  const plural = isPlural(camp.name);
  const complaint = hurtCount > 1
    ? `${camp.name} ${plural ? "считают" : "считает"} это уже ${ORDINAL_INSTRUMENTAL[hurtCount] ?? "очередным"} ударом по своим людям.`
    : `${camp.name} ${plural ? "называют" : "называет"} это ударом по своим людям.`;
  const text = `${whatYouDid(entry.choice)} ${complaint} Будете стоять на своём?`;
  const concede: PressAnswer = {
    tone: "honest", text: "«Упрёк справедлив: платят за это их люди. На этой неделе я встречусь с ними»",
    res: { politicalCapital: -2, internalLegitimacy: 1 }, rel: { [bloc]: repeated ? 5 : 3 },
    stake: repeated ? "Встреча стоит политкапитала; лагерь, задетый не первый раз, это оценит."
      : "Встреча стоит политкапитала, зато лагерь смягчится.",
  };
  const stand: PressAnswer = {
    tone: "hard", text: "«Решение остаётся в силе. Я понимаю, кому оно неудобно, и буду объяснять столько, сколько потребуется»",
    res: { politicalCapital: 2 }, rel: { [bloc]: repeated ? -4 : -2 },
    stake: repeated ? "Политкапитал растёт, но терпение лагеря на исходе." : "Политкапитал растёт, но лагерь останется обижен.",
  };
  const deflect: PressAnswer = {
    tone: "evasive", text: "«Это решение готовили министерства. Детали — к ним»",
    res: { internalLegitimacy: -2 }, rel: { [bloc]: -1 },
    stake: "Политкапитал цел, но прятаться за министров — значит терять доверие.",
    after: "В министерствах этот ответ запомнят: виноватыми выставили их.",
  };
  return { id: SIGNATURE_PREFIX + camp.id, who: "Корреспондент делового издания", topic: "вашем распоряжении", text, seconds: SIGNATURE_SECONDS,
    answers: [concede, stand, deflect] };
}
