// Вопрос пресс-конференции о собственной подписи: журналист называет решение, которое вы подписали, и лагерь,
// которому оно дорого обошлось. Три ответа стоят по-разному, и цена зависит от того, сколько раз этот лагерь
// уже был задет (#142).
import { CALL_TEXT } from "../content/calls.ts";
import { PRESS_TEXT } from "../content/press.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import type { Faction, GameState, HistoryEntry, PressAnswer, PressQuestion } from "./types.ts";

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
// Записи особых дел (пресс-конференция, звонок, бюджет) — не подписи под делом.
const SPECIAL_CHOICES = new Set(["Ответить на вопросы журналистов", "Утвердить бюджет на год", "Разговор по защищённой линии",
  PRESS_TEXT.skip.text, CALL_TEXT.hangup.text]);

export interface SignatureCase {
  entry: HistoryEntry;
  camp: Faction;
  hurtCount: number;
}

const isSignature = (entry: HistoryEntry) => entry.success !== false && !!entry.hurt?.length && !SPECIAL_CHOICES.has(entry.choice);

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

export function signatureQuestion(state: GameState, skip: ReadonlySet<string> = new Set()): PressQuestion | null {
  const found = signatureCase(state, skip);
  if (!found) return null;
  const { entry, camp, hurtCount } = found;
  const bloc = camp.bloc;
  const repeated = hurtCount >= REPEAT_FROM;
  const signed = `По делу „${bare(entry.title)}“ вы подписали решение: „${bare(entry.choice)}“.`;
  const text = hurtCount > 1
    ? `${signed} Это уже ${hurtCount}-е решение, задевшее лагерь „${camp.name}“. В этом лагере говорят, что с ними не считаются. Вы стоите на своём?`
    : `${signed} С тех пор лагерь „${camp.name}“ считает, что это решение ударило по нему. Вы стоите на своём?`;
  const stand: PressAnswer = {
    tone: "hard", text: "«Решение подписано сознательно, и я его не отзываю. Цена известна; объяснять буду столько, сколько нужно»",
    res: { politicalCapital: 2 }, rel: { [bloc]: repeated ? -4 : -2 },
    stake: repeated ? "Выигрываете в политкапитале, но лагерь задет не впервые: его терпение на исходе."
      : "Выигрываете в политкапитале; лагерь останется недоволен.",
  };
  const concede: PressAnswer = {
    tone: "honest", text: "«Цену этого решения заплатил лагерь, и упрёк справедлив. На этой неделе я встречусь с его представителями»",
    res: { politicalCapital: -2, internalLegitimacy: 1 }, rel: { [bloc]: repeated ? 5 : 3 },
    stake: repeated ? "Встреча стоит политкапитала; лагерь, задетый не впервые, оценит, что его услышали."
      : "Встреча стоит политкапитала, но смягчит лагерь.",
  };
  const deflect: PressAnswer = {
    tone: "evasive", text: "«Решение готовили в ведомствах, подробности вам дадут министры»",
    res: { internalLegitimacy: -2 }, rel: { [bloc]: -1 },
    stake: "Политкапитал цел, но ссылка на ведомства стоит доверия.",
    after: "Министры слышат, что их выставили виноватыми, и это запоминают.",
  };
  return { id: SIGNATURE_PREFIX + camp.id, who: "Корреспондент делового издания", topic: "вашей подписи", text, seconds: SIGNATURE_SECONDS,
    answers: [concede, stand, deflect] };
}
