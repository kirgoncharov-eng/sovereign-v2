// Истории людей во времени: какая история идёт, кто её герой и какое сообщение приходит в этом ходу.
// Ничего не хранит в сохранении: всё выводится из зерна партии, номера хода и текущего состояния,
// поэтому одинаково считается в браузере и при проверке «Дела дня» на сервере.
import { STORIES, type LetterKind, type Story, type StoryContext } from "../content/stories.ts";
import { roleGroup } from "../content/roles.ts";
import { hashSeed, isFemaleName } from "./engine.ts";
import type { Figure, GameState } from "./types.ts";

// Первые два хода — только дело и газета; истории начинаются с третьего.
export const STORY_FIRST_TURN = 3;
// Новая история — раз в четыре хода, сообщения одной истории — через ход.
export const STORY_GAP = 4;
export const STORY_STEP = 2;
const WARM = 20, COLD = -20;

export interface StoryLetter { kind: LetterKind; from: string; role?: string; text: string; story: string }

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
    const step = story.steps[offset / STORY_STEP];
    if (!step) return;
    const hero = heroOf(state, story);
    if (story.who !== "self" && !hero) return; // единственный подходящий человек сейчас — антагонист
    const text = step.text(contextOf(state, hero));
    if (!text) return;
    letters.push({
      kind: step.kind, story: story.id, text: bySex(text, hero),
      from: hero?.name ?? story.sender ?? "",
      ...(hero ? { role: hero.role } : {}),
    });
  });
  return letters;
}
