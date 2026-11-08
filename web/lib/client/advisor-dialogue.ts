import { ADVISOR_DIALOGUE, type AdvisorDialogue } from '../content/advisor-dialogue.ts';
import { hasInvestigationDebate } from '../content/investigation-debates.ts';
import { INVESTIGATION_DIALOGUE, type InvestigationDialogue } from '../content/investigation-dialogue.ts';
import { campOf, isDisloyal } from '../game/advisors.ts';
import { isFemaleName } from '../game/engine.ts';
import { executionProfile } from '../game/execution-risk.ts';
import { advisorOutlook, sourceFor, unifiedResolution } from './advisor-outlook.ts';
import type { Choice, GameState } from '../game/types.ts';

/** Целое авторское предложение; неизвестный слот не превращается в видимый технический текст. */
export function fillAdvisorSpeech(text: string, values: Record<string, string>): string | null {
  let missing = false;
  const result = text.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    if (!(key in values)) { missing = true; return ''; }
    return values[key];
  });
  return missing ? null : result;
}
export function advisorDialogue(state: GameState, choice: Choice, data: AdvisorDialogue = ADVISOR_DIALOGUE,
  investigations: InvestigationDialogue = INVESTIGATION_DIALOGUE) {
  if (!unifiedResolution(state) || choice.advisor || choice.deal?.pure) return [];
  if (state.currentEvent?.card === 'alt_wages' && !executionProfile(state, choice)) return [];
  const index = state.currentEvent?.choices.findIndex(option => option.id === choice.id) ?? -1;
  // У эпизодов интриги нет карточки: разговор о расследовании ищется по тексту варианта, как в INVESTIGATION_DEBATES.
  const authored = hasInvestigationDebate(state) ? investigations[choice.text] : data[state.currentEvent?.card ?? '']?.[index];
  const forecast = advisorOutlook(state, choice);
  if (!authored || !forecast) return [];
  const values: Record<string, string> = { risk: forecast.risk.text, ...(state.arc ? { target: state.arc.target } : {}) };
  for (const [key, estimate] of Object.entries(forecast.success.resources)) values[`success.${key}`] = estimate.text;
  for (const [key, estimate] of Object.entries(forecast.failure?.resources ?? {})) values[`failure.${key}`] = estimate.text;
  forecast.later.forEach((effect, i) => {
    for (const [key, estimate] of Object.entries(effect.resources)) values[`later.${i}.${key}`] = estimate!.text;
  });
  return Object.entries(authored).flatMap(([id, tones]) => {
    const person = state.advisors.find(advisor => advisor.id === id);
    if (!person) return [];
    const camp = campOf(state, person);
    const lobby = isDisloyal(person, state) && camp ? tones.lobby?.[camp.bloc] : undefined;
    const template = lobby ?? (person.skill === 1 ? tones.weak : tones.strong);
    if (!template) return [];
    const slots = { ...values, name: person.name, а: isFemaleName(person.name) ? 'а' : '' };
    const text = fillAdvisorSpeech(template, slots);
    if (!text) return [];
    const challenge = tones.challenge;
    const previous = challenge && state.advisors.find(advisor => advisor.id === challenge.after);
    const correction = person.skill >= 2 && previous?.skill === 1 && challenge
      ? fillAdvisorSpeech(challenge.text, slots) : null;
    return [{ source: sourceFor(state, id), text, ...(correction ? { correction } : {}) }];
  });
}
