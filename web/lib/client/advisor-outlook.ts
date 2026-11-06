// Доклад не заглядывает в бросок исполнения: только зерно, дело и текущий состав команды.
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { ADVISOR_ROLES, RESOURCE_KEYS } from '../game/data.ts';
import { authoredDebate, isPresidentialDiscussion } from '../game/presidential-story.ts';
import { hashSeed, loyaltyOf, saboteurOf, successChance } from '../game/engine.ts';
import { isDisloyal, loyaltyWord } from '../game/advisors.ts';
import { executionProfile } from '../game/execution-risk.ts';
import { RESOURCE_TITLE } from '../content/resource-names.ts';
import type { AdvisorNews, Choice, GameState, ResourceKey } from '../game/types.ts';
import { choiceOutcomes } from './choice-outcomes.ts';

export interface OutlookSource { id: string; name: string; role: string; skill: 0 | 1 | 2 | 3; loyalty: string }
export interface Estimate { value: number; text: string; source: OutlookSource; known: boolean }
const PROFILE: Record<ResourceKey, string> = {
  economy: 'economist', military: 'security', externalReputation: 'diplomat',
  internalLegitimacy: 'strategist', politicalCapital: 'strategist', personalResource: 'strategist',
};
export const signedEstimate = (n: number) => n === 0 ? '0' : `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
export const hardOutlook = (state: Pick<GameState, 'diff'>) => state.diff === 'crisis' || state.diff === 'ruins';
export const usesAdvisorOutlook = (state: Pick<GameState, 'country' | 'daily'>) => state.country === ALTERNATE_COUNTRY && !state.daily;
export function unifiedResolution(state: GameState) {
  const event = state.currentEvent;
  return usesAdvisorOutlook(state) && !!event && !event.call && !event.press && !event.budget;
}

export function resolutionOptions(state: GameState): Choice[] {
  const event = state.currentEvent;
  if (!event) return [];
  return [...event.choices, ...(event.council ?? []).filter(choice => !event.choices.some(original => original.id === choice.id))];
}

/** Новый экран уже обсуждает исходные подписи. Это то же бесплатное обсуждение, что прежний совет. */
export function advisorSigningState(state: GameState): GameState {
  if (!unifiedResolution(state) || !isPresidentialDiscussion(state)
    || resolutionOptions(state).length > state.currentEvent!.choices.length) return state;
  return { ...state, currentEvent: { ...state.currentEvent!, council: state.currentEvent!.choices } };
}
export function sourceFor(state: GameState, id: string): OutlookSource {
  const person = state.advisors.find(member => member.id === id);
  return person ? { id, name: person.name, role: person.role, skill: person.skill, loyalty: loyaltyWord(loyaltyOf(person)) }
    : { id, name: 'Канцелярия', role: 'советник не назначен', skill: 0, loyalty: '' };
}
export function resolutionPeople(state: GameState, choice: Choice) {
  const index = state.currentEvent?.choices.findIndex(original => original.id === choice.id
    && JSON.stringify(original) === JSON.stringify(choice)) ?? -1;
  const lines = index < 0 ? undefined : authoredDebate(state, index);
  return { proponent: lines?.[0] ? sourceFor(state, lines[0][0]) : null,
    critic: lines?.[1] ? sourceFor(state, lines[1][0]) : null };
}
export function riskSourceFor(state: GameState, choice: Choice): OutlookSource {
  const id = choice.advisor?.id ?? resolutionPeople(state, choice).proponent?.id
    ?? ADVISOR_ROLES.find(role => role.domain.some(tag => choice.tags.includes(tag)))?.id ?? 'strategist';
  return sourceFor(state, id);
}

// Один вердикт на дело и человека, общий для всех вариантов/опор. Имя отделяет преемника от прежнего советника.
export function optimisticCase(state: GameState, source: OutlookSource): boolean {
  if (!source.skill || source.skill === 3) return false;
  const key = state.currentEvent?.card ?? state.currentEvent?.title ?? '';
  const sample = hashSeed(state.seed, 'advisor-outlook', key, state.turn, source.id, source.name) % 4;
  return sample < (source.skill === 1 ? 2 : 1);
}
export function estimateDelta(state: GameState, source: OutlookSource, value: number, known = false): Estimate {
  let said = value;
  if (hardOutlook(state) && !known && value <= -4 && optimisticCase(state, source)) {
    said = -Math.max(1, Math.round(Math.abs(value) * (source.skill === 1 ? 0.5 : 0.75)));
  }
  const magnitude = Math.abs(said), count = magnitude >= 8 ? 3 : magnitude >= 4 ? 2 : 1;
  const text = known ? signedEstimate(said) : !source.skill ? '?'
    : hardOutlook(state) || source.skill === 3 ? signedEstimate(said)
    : !said ? '0' : (said > 0 ? '▲' : '▼').repeat(source.skill === 1 ? 1 : count);
  return { value: said, text, source, known };
}
export function advisorOutlook(state: GameState, choice: Choice) {
  if (!usesAdvisorOutlook(state)) return null;
  const ready = advisorSigningState(state), raw = choiceOutcomes(ready, choice);
  if (!raw) return null;
  const sources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, sourceFor(state, PROFILE[key])])) as Record<ResourceKey, OutlookSource>;
  const riskSource = riskSourceFor(state, choice);
  const outcome = (branch: typeof raw.success, failure = false) => ({
    resources: Object.fromEntries(RESOURCE_KEYS.map(key => [key, estimateDelta(state, failure ? riskSource : sources[key],
      branch.resources[key] ?? 0, key === 'personalResource' && (branch.resources[key] ?? 0) <= 0
        || key === 'economy' && !!choice.deal?.pure && (choice.deal.res?.economy ?? 0) < 0)])) as Record<ResourceKey, Estimate>,
    camps: branch.camps.map(camp => {
      const bloc = state.factions.find(faction => faction.name === camp.name)?.bloc;
      const id = bloc === 'security' ? 'security' : bloc === 'business' ? 'economist'
        : bloc === 'west' || bloc === 'russia' ? 'diplomat' : 'strategist';
      return { name: camp.name, estimate: estimateDelta(state, failure ? riskSource : sourceFor(state, id), camp.delta) };
    }),
  });
  let percent = raw.failurePercent;
  if (hardOutlook(state) && percent >= 25 && optimisticCase(state, riskSource)) {
    percent = Math.max(1, Math.round(percent * (riskSource.skill === 1 ? 0.5 : 0.75)));
  }
  const riskText = !riskSource.skill ? '?' : hardOutlook(state) || riskSource.skill === 3 ? `${percent}%`
    : riskSource.skill === 1 ? (percent ? 'надёжно' : 'нет') : percent === 0 ? 'нет'
    : percent < 20 ? 'низкий' : percent < 40 ? 'умеренный' : 'высокий';
  let reason = riskSource.skill === 3 ? raw.reason : null;
  if (riskSource.skill === 3 && raw.failure) {
    const profile = executionProfile(ready, choice);
    const harmful = ready.advisors.filter(advisor => isDisloyal(advisor, ready) && !advisor.dossier);
    const saboteur = profile ? harmful.find(advisor => profile.coordinators.includes(advisor.id)) : saboteurOf(ready, choice);
    if (saboteur) {
      // Учитываем предел шанса: у нижней границы саботаж может добавить меньше десяти пунктов.
      const restrained = { ...ready, advisors: ready.advisors.map(advisor => harmful.includes(advisor)
        ? { ...advisor, dossier: { fact: '', turn: ready.turn } } : advisor) };
      const points = Math.round((successChance(restrained, choice) - successChance(ready, choice)) * 100);
      if (points > 0) reason = [reason, `Из риска срыва ${points} п. п. — ${saboteur.name} тянет с бумагами.`].filter(Boolean).join(' ');
    }
  }
  return { sources, people: resolutionPeople(state, choice), success: outcome(raw.success),
    failure: raw.failure ? outcome(raw.failure, true) : null,
    failureOmitted: !!raw.failure && !hardOutlook(state) && riskSource.skill === 1,
    risk: { text: riskText, value: percent, source: riskSource,
      reason },
    payment: (choice.deal?.res?.economy ?? 0) < 0 ? choice.deal!.res!.economy! : null,
    later: raw.later.map((effect, index) => ({ ...effect,
      resources: Object.fromEntries(RESOURCE_KEYS.filter(key => effect.res[key]).map(key => [key,
        estimateDelta(state, sources[key], effect.res[key]!,
          index === raw.later.length - 1 && !!choice.deal?.later && key === 'economy'),
      ])) as Partial<Record<ResourceKey, Estimate>>,
    })),
  };
}

/** Сверяем прямое действие выбранной ветви, а не шум квартала и не удачу одного броска с вероятностью. */
export function reviewAdvisorOutlook(state: GameState, choice: Choice, success: boolean) {
  if (!unifiedResolution(state)) return null;
  const forecast = advisorOutlook(state, choice)!, raw = choiceOutcomes(state, choice)!;
  const truth = success ? raw.success : raw.failure;
  const reported = success ? forecast.success : forecast.failure;
  if (!truth || !reported) return null;
  const news = new Map<string, AdvisorNews>();
  const lines: string[] = [];
  const omitted = !success && forecast.failureOmitted;
  for (const key of RESOURCE_KEYS) {
    const claim = reported.resources[key], actual = truth.resources[key] ?? 0;
    if (claim.known || !claim.source.skill || !actual && !claim.value) continue;
    const label = RESOURCE_TITLE[key];
    let verdict: string;
    if (omitted) verdict = 'промах';
    else if (hardOutlook(state) || claim.source.skill === 3) {
      const error = Math.abs(claim.value - actual);
      verdict = error === 0 ? 'точно' : error <= 2 ? 'почти' : 'промах';
    } else verdict = 'точно'; // Направление/ступень силы сравнивается в том же формате, что до подписи.
    const source = claim.source;
    const row = news.get(source.id) ?? { id: source.id, loyalty: 0, right: 0, wrong: 0, reason: null };
    if (verdict === 'точно') row.right++; else row.wrong++;
    news.set(source.id, row);
    lines.push(`${source.name} · ${label}: ${omitted ? 'не обсуждали' : claim.text} → ${signedEstimate(actual)} — ${verdict}.`);
  }
  return { lines: [hardOutlook(state) ? 'Обещали — вышло' : omitted ? 'Чего не было в докладах' : 'Доклад — результат', ...lines],
    news: [...news.values()] };
}
