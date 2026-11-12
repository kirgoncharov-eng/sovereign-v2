// Предвыборное слово до подписи (#425): вариант, который перечеркнёт обещание или продвинет его, говорит об этом заранее.
// На столе `/game` это показывали `PromiseLines`; на экране резолюции 1978 года и в хронике подсказки не было,
// и о нарушенном обещании игрок узнавал из ведомости. Правила те же, что у `stepPromises`: теги обязательства варианта.
import { commitmentTags } from '../game/engine.ts';
import { promiseDef } from '../game/promises.ts';
import type { Choice, GameState } from '../game/types.ts';

export interface PromiseWarning {
  /** Обещания «никогда», которые эта подпись нарушит сразу — даже если решение сорвут. */
  breaks: string[];
  /** Обещания, к которым исполненное решение сделает шаг: название и счёт после шага. */
  advances: { title: string; progress: number; count: number }[];
}

export function promiseWarning(game: Pick<GameState, 'promises' | 'country'>, choice: Choice): PromiseWarning {
  const tags = commitmentTags(choice);
  const breaks: string[] = [], advances: PromiseWarning['advances'] = [];
  for (const promise of game.promises ?? []) {
    const def = promiseDef(promise.id, game.country);
    if (!def || promise.status !== 'open') continue;
    if (def.goal.kind === 'never' && def.goal.tags.some(tag => tags.includes(tag))) breaks.push(def.title);
    if (def.goal.kind === 'tags' && def.goal.tags.some(tag => tags.includes(tag))) {
      advances.push({ title: def.title, progress: promise.progress + 1, count: def.goal.count });
    }
  }
  return { breaks, advances };
}
