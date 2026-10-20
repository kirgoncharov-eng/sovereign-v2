// Истории людей во времени: какая история идёт, кто её герой и какое сообщение приходит в этом ходу.
// Всё выводится из зерна партии, номера хода и текущего состояния, поэтому одинаково считается
// в браузере и при проверке «Дела дня» на сервере. Единственное, что хранится, — ответы игрока
// на письма в кампании 1978 года (#156): их нет в «Деле дня» и в архивных странах.
import { STORIES, type LetterKind, type Story, type StoryContext } from "../content/stories.ts";
import { STORY_REPLIES, type ReplyOption, type StoryReplies } from "../content/story-replies.ts";
import { roleGroup } from "../content/roles.ts";
import { ALTERNATE_COUNTRY } from "./alternate-world.ts";
import { applyDeltas, clampRel, hashSeed, isFemaleName, loyaltyLabel } from "./engine.ts";
import type { Figure, GameState, LetterReply } from "./types.ts";

// Первые два хода — только дело и газета; истории начинаются с третьего.
export const STORY_FIRST_TURN = 3;
// Новая история — раз в четыре хода, сообщения одной истории — через ход.
export const STORY_GAP = 4;
export const STORY_STEP = 2;
const WARM = 20, COLD = -20;

export interface StoryLetter {
  kind: LetterKind; from: string; role?: string; text: string; story: string; departs?: string;
  hero?: string; replies?: LetterReply[];
}

// Кто подходит на роль героя по должности. От интриги не зависит, чтобы порядок историй не менялся
// посреди партии, когда в новом сроке появляется новый антагонист.
const candidates = (state: GameState, story: Story) => state.keyFigures
  .filter(f => roleGroup(f.id) === story.who && (!story.ids || story.ids.includes(f.id)))
  .sort((a, b) => hashSeed(state.seed, story.id, a.id) - hashSeed(state.seed, story.id, b.id));

// Чья это история сейчас: первый подходящий человек, кроме антагониста интриги.
function heroOf(state: GameState, story: Story): Figure | null {
  if (story.who === "self") return null;
  return candidates(state, story).find(f => f.name !== state.arc?.target) ?? null;
}

// Ответы на письма есть только в обычной партии кампании 1978 года.
function repliesFor(state: GameState, story: Story): StoryReplies | undefined {
  return state.country === ALTERNATE_COUNTRY && !state.daily ? STORY_REPLIES[story.id] : undefined;
}

// Герой отвеченной истории закреплён ответом — по должности и по имени (#182).
// undefined — ответа нет, герой выбирается как обычно; null — человек ушёл с поста (преемник, сделка),
// и его личная история на этом кончается: продолжение не переходит к тому, кто занял место.
function pinnedHero(state: GameState, story: Story): Figure | null | undefined {
  const answer = state.storyReplies?.[story.id];
  if (!answer?.hero) return undefined;
  const figure = state.keyFigures.find(item => item.id === answer.hero);
  if (!figure) return null;
  return answer.heroName === undefined || figure.name === answer.heroName ? figure : null;
}

// Герою ответа не мешает и смена антагониста интриги в новом сроке.
function storyHero(state: GameState, story: Story): Figure | null {
  const pinned = pinnedHero(state, story);
  return pinned === undefined ? heroOf(state, story) : pinned;
}

// Какой ответ дан на эту историю и действует ли он для шага `index`.
function answerFor(state: GameState, story: Story, index: number): ReplyOption | undefined {
  const replies = repliesFor(state, story);
  const answer = state.storyReplies?.[story.id];
  if (!replies || !answer || index <= replies.step) return undefined;
  return replies.options.find(option => option.id === answer.reply);
}

// Порядок историй в партии — свой для каждого зерна; истории без героя в этой стране пропускаются.
export function storyOrder(state: GameState): Story[] {
  return [...STORIES]
    .sort((a, b) => hashSeed(state.seed, "story", a.id) - hashSeed(state.seed, "story", b.id))
    .filter(story => story.who === "self" || candidates(state, story).length > 0);
}

const contextOf = (state: GameState, hero: Figure | null): StoryContext => ({
  mood: !hero ? "neutral" : hero.relation >= WARM ? "warm" : hero.relation <= COLD ? "cold" : "neutral",
  res: state.resources,
  crisis: state.activeCrises.length > 0 || Object.values(state.resources).some(v => v < 20),
});

// {sex:он|она} — по имени героя; остальные слоты заполняет общий fill.
const bySex = (text: string, hero: Figure | null) =>
  text.replace(/\{sex:([^|}]*)\|([^}]*)\}/g, (_, male, female) => (hero && isFemaleName(hero.name) ? female : male));

// Сообщения, которые приходят в итоге хода `turn` (номер хода после решения).
export function storyLetters(state: GameState, turn = state.turn + 1): StoryLetter[] {
  if (turn < STORY_FIRST_TURN) return [];
  const letters: StoryLetter[] = [];
  storyOrder(state).forEach((story, k) => {
    const offset = turn - (STORY_FIRST_TURN + k * STORY_GAP);
    if (offset < 0 || offset % STORY_STEP) return;
    const index = offset / STORY_STEP;
    const step = story.steps[index];
    if (!step) return;
    const hero = storyHero(state, story);
    if (story.who !== "self" && !hero) return; // единственный подходящий человек сейчас — антагонист
    // Ответ игрока решает ветку вместо отношения героя; у ответа могут быть и свои тексты.
    const answer = answerFor(state, story, index);
    const context = answer ? { ...contextOf(state, hero), mood: answer.mood } : contextOf(state, hero);
    const own = answer?.steps?.[index]?.(context);
    const text = own === undefined ? step.text(context) : own;
    if (!text) return;
    const replies = repliesFor(state, story);
    const offer = replies && replies.step === index && !state.storyReplies?.[story.id] ? replies.options : [];
    letters.push({
      kind: step.kind, story: story.id, text: bySex(text, hero),
      from: hero?.name ?? story.sender ?? "",
      ...(hero ? { role: hero.role } : {}),
      ...(hero && step.departs?.(context) ? { departs: hero.id } : {}),
      ...(offer.length ? {
        ...(hero ? { hero: hero.id } : {}),
        replies: offer.map(({ id, text, cost, relation }) => ({ id, text, cost, ...(relation ? { relation } : {}) })),
      } : {}),
    });
  });
  return letters;
}

// Ответ на письмо итога хода (#156): цена списывается сразу, история запоминает ответ и героя.
// Отвечать можно, пока письмо на виду, — один раз на историю.
export function replyToLetter(state: GameState, storyId: string, replyId: string): GameState {
  const letter = state.lastTurn?.letters?.find(item => item.story === storyId && item.replies?.length);
  const option = STORY_REPLIES[storyId]?.options.find(item => item.id === replyId);
  if (!letter || !option || state.daily || state.ended || state.country !== ALTERNATE_COUNTRY) {
    throw new Error("На это письмо сейчас нельзя ответить");
  }
  if (state.storyReplies?.[storyId]) throw new Error("Ответ на это письмо уже отправлен");
  const hero = letter.hero ? state.keyFigures.find(figure => figure.id === letter.hero) : undefined;
  // Подпись отношения меняется вместе с числом: «нейтрал» +15 → «союзник», как после решения хода.
  const relation = hero && option.relation ? clampRel(hero.relation + option.relation) : undefined;
  return {
    ...state,
    resources: applyDeltas(state.resources, option.cost),
    keyFigures: relation === undefined ? state.keyFigures : state.keyFigures.map(figure => figure.id !== hero!.id ? figure
      : { ...figure, relation, loyalty: loyaltyLabel(relation) }),
    storyReplies: { ...state.storyReplies, [storyId]: {
      reply: option.id, turn: state.turn, ...(hero ? { hero: hero.id, heroName: hero.name } : {}),
    } },
  };
}
