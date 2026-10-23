// Бот-игрок для замеров кампании 1978 (#213, #251): держится своего стиля или дороги, но видит цену варианта и бережёт опоры.
// Общий для scripts/tree.ts и scripts/initiatives-balance.ts, чтобы замеры до и после изменения играли одним и тем же ботом.
import { budgetChoice, callChoice, pressChoice } from "../lib/game/classic.ts";
import { choiceEffects, seededRandom } from "../lib/game/engine.ts";
import { RESOURCE_KEYS } from "../lib/game/data.ts";
import type { ActionTag, Choice, GameState } from "../lib/game/types.ts";

const CRISIS = 30;
const DANGER = 15;

export const STYLES: Record<string, ActionTag[]> = {
  honest: ["anticorruption", "reform", "dialogue"],
  police: ["security", "repress"],
  dealer: ["elite_deal", "investment"],
  populist: ["social", "propaganda"],
  delay: ["delay"],
  austerity: ["austerity", "investment"],
  patriot: ["patriotism", "pro_russia", "security"],
  random: [],
};

// Три дороги (#221): игрок держится лагерей, а не тегов — открытость, порядок или сделка.
export const LANES: Record<string, string[]> = {
  open: ["liberal", "west"],
  order: ["security", "nationalist"],
  deal: ["business", "regional"],
};

// Стиль задаёт предпочтение, но игрок видит цену: риск варианта растёт с тем, насколько глубоко опора уйдёт ниже кризиса,
// а у края обвала (ниже DANGER) — втрое быстрее. Иначе на «Кризисе», где почти всё ниже 30, бот не отличал бы 24 от 6.
// Случайный стиль (без тегов) выбирает наугад среди почти самых безопасных вариантов — как игрок без системы.
export function choose(state: GameState, choices: Choice[], style: ActionTag[], lane?: string[]): Choice {
  const breaks = (choice: Choice) => {
    const delta = choiceEffects(state, choice).resources as Record<string, number>;
    // Отложенную цену сделки игрок видит в подсказке и обязательствах — бот тоже её учитывает.
    const later = (choice.deal?.later?.res ?? {}) as Record<string, number>;
    const after = (key: string) => state.resources[key as keyof GameState["resources"]] + (delta[key] ?? 0) + Math.min(0, later[key] ?? 0);
    return RESOURCE_KEYS.reduce((risk, key) => risk + Math.max(0, CRISIS - after(key)) / 5 + Math.max(0, DANGER - after(key)) * 0.4, 0);
  };
  if (lane) {
    const camps = (choice: Choice) => {
      const relation = choiceEffects(state, choice).factionRel;
      return state.factions.filter(group => lane.includes(group.bloc)).reduce((sum, group) => sum + (relation[group.id] ?? 0), 0);
    };
    const score = (choice: Choice) => camps(choice) - breaks(choice) * 20;
    return choices.reduce((best, choice) => (score(choice) > score(best) ? choice : best));
  }
  if (!style.length) {
    const safe = choices.filter(choice => breaks(choice) <= Math.min(...choices.map(breaks)) + 1);
    return safe[Math.floor(seededRandom(state.seed + state.turn * 7919)() * safe.length)];
  }
  // Смысл варианта — его теги и политические теги: «Оплатить зарплату в обмен на проверку» — это и забота, и борьба с коррупцией.
  const meaning = (choice: Choice) => new Set([...choice.tags, ...(choice.politicalTags ?? [])]);
  const score = (choice: Choice) => [...meaning(choice)].filter(tag => style.includes(tag)).length * 3 - breaks(choice) * 5;
  return choices.reduce((best, choice) => (score(choice) > score(best) ? choice : best));
}

// Ход бота по открытому делу: бюджет, звонок и пресс-конференция решаются своими правилами, у условий срока — путь «идти на выборы».
export function botTurn(state: GameState, style: string): { state: GameState; choice: Choice } {
  const current = state.currentEvent!;
  const options = current.special?.kind === "terms" ? current.choices.filter(choice => choice.path === "run") : current.choices;
  let choice = choose(state, options.length ? options : current.choices, STYLES[style] ?? [], LANES[style]);
  if (current.budget) choice = budgetChoice(state, { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, false);
  else if (current.call && !current.call.negotiation) choice = callChoice(state, "numbers", style === "delay" ? "later" : "deal");
  else if (current.press) choice = pressChoice(state, [0, 0, 0]);
  if (current.budget || (current.call && !current.call.negotiation) || current.press) {
    state = { ...state, currentEvent: { ...current, choices: [choice, current.choices[1] ?? current.choices[0]] } };
  }
  return { state, choice };
}
