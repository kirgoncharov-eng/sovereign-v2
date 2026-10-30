// Вопрос пресс-конференции об обещании: журналист читает не шаблон, а то, что президент сказал на митинге
// и что с тех пор сделано. Три ответа — признать, показать сделанное, снять обещание — стоят по-разному,
// и «показать» работает, только если есть что показывать (#142).
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { RES_CONFIG } from "./data.ts";
import { promiseDef } from "./promises.ts";
import type { PressAnswer, PressQuestion, PromiseState, GameState } from "./types.ts";
import type { PromiseDef } from "../content/promises.ts";

export const PLEDGE_QUESTION_ID = "pledge";
// Вопрос длиннее обычных: на чтение цитаты митинга и три ответа нужно больше стандартных 15 секунд.
export const PLEDGE_SECONDS = 30;

export interface PledgeCase {
  promise: PromiseState;
  def: PromiseDef;
  broken: boolean;
  // Есть ли что предъявить: исполненные решения или ресурс, почти дотянувший до порога.
  proved: boolean;
  status: string;
}

const resourceName = (key: string) => (RES_CONFIG.find(config => config.key === key)?.prompt ?? key).toLowerCase();

function describeProgress(promise: PromiseState, def: PromiseDef, state: GameState): { proved: boolean; status: string } {
  const goal = def.goal;
  if (goal.kind === "tags") {
    return { proved: promise.progress > 0, status: `исполнено ${promise.progress} из ${goal.count}` };
  }
  if (goal.kind === "resource") {
    const now = state.resources[goal.key], target = promise.target ?? now;
    return { proved: now >= target - 2, status: `${resourceName(goal.key)} сейчас ${now}, нужно ${target}` };
  }
  return { proved: false, status: "обещание нарушено" };
}

// Какое обещание спросят: самое свежее нарушенное, иначе открытое, от которого дальше всего до исполнения.
// Только партия 1978 года: у архивных стран набор вопросов не меняется.
export function pledgeCase(state: GameState): PledgeCase | null {
  if (state.country !== ALTERNATE_COUNTRY || state.daily) return null;
  const cases: PledgeCase[] = [];
  for (const promise of state.promises ?? []) {
    const def = promiseDef(promise.id, state.country);
    if (!def || promise.status === "kept") continue;
    if (promise.status === "open" && def.goal.kind === "never") continue; // держится само, пока не нарушено
    cases.push({ promise, def, broken: promise.status === "broken", ...describeProgress(promise, def, state) });
  }
  const broken = cases.filter(item => item.broken).sort((a, b) => (b.promise.turn ?? 0) - (a.promise.turn ?? 0));
  if (broken.length) return broken[0];
  const gap = (item: PledgeCase) => item.def.goal.kind === "tags" ? item.def.goal.count - item.promise.progress : 99;
  return [...cases].sort((a, b) => gap(b) - gap(a))[0] ?? null;
}

export function pledgeQuestion(state: GameState): PressQuestion | null {
  const item = pledgeCase(state);
  if (!item) return null;
  const { def, broken, proved, promise } = item;
  const bloc = def.bloc;
  // Цитата внутри реплики журналиста — в «лапках»: «…„…“…».
  const quoted = `На митинге вы пообещали: „${def.pitch.replace(/\.$/, "")}“.`;
  const text = broken
    ? `${quoted} Это обещание нарушено. Что вы скажете тем, кому оно давалось?`
    : `${quoted} Сейчас: ${item.status}. Обещание ещё в силе?`;
  const renounce: PressAnswer = {
    tone: "evasive", renounce: broken ? undefined : promise.id,
    text: broken ? "«То обещание давалось в других условиях. Условия изменились»" : "«Условия изменились. Это обещание я снимаю: страна важнее лозунга»",
    res: { internalLegitimacy: broken ? -2 : -1, politicalCapital: 1 }, rel: { [bloc]: broken ? -2 : -3 },
    stake: broken ? "Вопрос закрывается дёшево, но те, кому оно давалось, не простят."
      : "Обещание закрывается без исполнения: вы выигрываете в политкапитале, теряете доверие тех, кому оно давалось.",
    after: "Представитель лагеря с места напоминает дословную фразу митинга. В зале её уже записали.",
  };
  const prove: PressAnswer = proved
    ? { tone: "hard", text: "«Вот что уже сделано. Протоколы открыты, проверяйте каждое решение»",
        res: { politicalCapital: 2, internalLegitimacy: 1 }, rel: { [bloc]: 2 },
        stake: "Есть что предъявить: выигрываете в политкапитале и у тех, кому обещано." }
    : { tone: "hard", text: broken ? "«Часть работы сделана. Протоколы открыты, проверяйте каждое решение»" : "«Работа идёт. Протоколы открыты, проверяйте каждое решение»",
        res: { internalLegitimacy: -2 }, rel: { [bloc]: -2 },
        stake: "Показывать почти нечего: журналист сверит слова с протоколами, и расхождение заметят.",
        after: "Журналист открывает протоколы: решений, о которых говорит президент, в них нет. Слова расходятся с бумагой." };
  const admit: PressAnswer = {
    tone: "honest",
    text: broken ? "«Слово не удержано. Это на мне, и оправдываться я не буду»"
      : "«Обещание в силе, но пока сделано меньше, чем нужно. Спрашивайте с меня к сроку»",
    res: broken ? { internalLegitimacy: 3, politicalCapital: -2 } : { internalLegitimacy: 2, politicalCapital: -1 },
    rel: { [bloc]: broken ? 3 : 2 },
    stake: broken ? "Признание стоит политкапитала, зато ему поверят." : "Признание стоит немного политкапитала; спрос к сроку остаётся на вас.",
  };
  return { id: PLEDGE_QUESTION_ID, who: "Корреспондентка независимого издания", topic: "данном слове", text, seconds: PLEDGE_SECONDS,
    answers: [admit, prove, renounce] };
}
