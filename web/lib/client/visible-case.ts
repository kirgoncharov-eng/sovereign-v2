// Что игрок видит под делом — текстом, для чтения партии глазами (scripts/read-run.ts, навык text-review).
// Повторяет развилку стола (SovereignGame.jsx) и хроники (Chronicle.tsx): обычная партия 1978 года идёт через экран
// резолюции ResolutionChoices, остальные — через прежний блок: варианты с подсказкой, спор советников или разговор в кабинете (#396).
import { debate } from '../game/forecasts.ts';
import { hasPresidentialCouncil, isPresidentialDiscussion, presidentialConversation } from '../game/presidential-story.ts';
import { hasInvestigationDebate } from '../content/investigation-debates.ts';
import { RESOURCE_TITLE } from '../content/resource-names.ts';
import type { GameState, ResourceKey } from '../game/types.ts';
import { advisorDialogue } from './advisor-dialogue.ts';
import { advisorOutlook, hardOutlook, resolutionOptions, signedEstimate, unifiedResolution, type Estimate, type OutlookSource } from './advisor-outlook.ts';
import { quarterDeadline } from './initiative-note.ts';

// Спор скрыт, если открыт совет, обсуждение подписи или разговор о расследовании — как на столе.
export const debateVisible = (state: GameState) => !unifiedResolution(state)
  && !hasPresidentialCouncil(state) && !isPresidentialDiscussion(state) && !hasInvestigationDebate(state);

const resources = (estimates: Partial<Record<ResourceKey, Estimate>>) => {
  const shown = Object.entries(estimates).filter(([, estimate]) => estimate!.value !== 0);
  return shown.length ? shown.map(([key, estimate]) => `${RESOURCE_TITLE[key as ResourceKey]} ${estimate!.text}`).join(' · ') : 'без перемены';
};
// Звёзды компетентности видны только на лёгких сложностях — как в ResolutionChoices.
const source = (who: OutlookSource, hard: boolean) => `${who.name}${!hard && who.skill > 0 ? ` ${'★'.repeat(who.skill)}` : ''}`;

// Экран резолюции: каждый вариант раскрыт — справка, риск и речи советников, без подсказки `hint` (её этот экран не показывает).
function resolutionLines(state: GameState): string[] {
  const hard = hardOutlook(state);
  return resolutionOptions(state).flatMap((choice, index) => {
    const forecast = advisorOutlook(state, choice);
    if (!forecast) return [`  · Вариант ${index + 1}: ${choice.text}`];
    const { proponent, critic } = forecast.people;
    const people = proponent ? ` (предлагает ${proponent.name}${critic ? ` · возражает ${critic.name}` : ''})` : '';
    const lines = [`  · Вариант ${index + 1}: ${choice.text}${people}`, `      исполнят: ${resources(forecast.success.resources)}`];
    if (forecast.failure) lines.push(`      срыв: ${forecast.failureOmitted ? 'не обсуждали' : resources(forecast.failure.resources)}`);
    for (const effect of forecast.later) {
      lines.push(`      позже, ${quarterDeadline(state, effect.due)}: ${resources(effect.resources)} — «${effect.label}». `
        + (effect.onFailure ? 'Сохраняется при срыве.' : 'При исполнении.'));
    }
    if (forecast.payment !== null) lines.push(`      по договору: казна ${signedEstimate(forecast.payment)}`);
    lines.push(`      риск: ${forecast.risk.text} · ${source(forecast.risk.source, hard)}`);
    if (forecast.risk.reason) lines.push(`      ${forecast.risk.reason}`);
    for (const speech of advisorDialogue(state, choice)) {
      lines.push(`      🗣 ${source(speech.source, hard)}, ${speech.source.role.toLowerCase()}: «${speech.text}»`);
      if (speech.correction) lines.push(`         ↳ «${speech.correction}»`);
    }
    return lines;
  });
}

// Прежний блок под делом: варианты с подсказкой; спор советников (⚖) или разговор в кабинете (🗣 Вариант N).
function deskLines(state: GameState): string[] {
  const choices = state.currentEvent!.choices;
  const lines = choices.map(choice => `  · ${choice.text} — ${choice.hint}`);
  if (debateVisible(state)) debate(state)?.forEach(take => lines.push(`  ⚖ ${take.name}, ${take.role.toLowerCase()}: «${take.text}»`));
  else choices.forEach((_, index) => presidentialConversation(state, index)
    .forEach(line => lines.push(`  🗣 Вариант ${index + 1}: ${line.name}, ${line.role.toLowerCase()}: «${line.text}»`)));
  return lines;
}

/** Строки под обычным делом (не звонок, не бюджет, не пресс-конференция) — то, что игрок видит до подписи. */
export function visibleCaseLines(state: GameState): string[] {
  if (!state.currentEvent) return [];
  return unifiedResolution(state) ? resolutionLines(state) : deskLines(state);
}
