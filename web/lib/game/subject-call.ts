// Предметный звонок первого срока 1978 года (#310, P05): варианты задаёт предмет разговора, а не тон.
// Работает только на втором звонке хода 16 для лагерей, у которых есть SUBJECT_CALLS.
// Остальные темы, второй срок, «Дело дня» и архивные страны сохраняют прежний звонок (callChoice).
import { CALL_TEXT } from '../content/calls.ts';
import { HISTORICAL_CALL_TOPICS } from '../content/historical-calls.ts';
import { SUBJECT_CALLS, type SubjectOption } from '../content/subject-calls.ts';
import { traitOf } from './people.ts';
import type { Choice, Faction, Figure, GameEvent, GameState, ResourceDelta } from './types.ts';

const RESOURCE_NAMES: Record<keyof GameState['resources'], string> = {
  politicalCapital: 'политкапитал', economy: 'экономика', military: 'силовики',
  externalReputation: 'репутация за рубежом', internalLegitimacy: 'легитимность', personalResource: 'личный ресурс',
};

const signed = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);

// Цена в подсказке собирается из тех же чисел, что уходят в движок, — расхождение невозможно.
export function priceText(res: ResourceDelta): string {
  const parts = (Object.keys(RESOURCE_NAMES) as (keyof typeof RESOURCE_NAMES)[])
    .filter(key => res[key]).map(key => `${RESOURCE_NAMES[key]} ${signed(res[key]!)}`);
  if (!parts.length) return 'Без прямых расходов.';
  const text = parts.join(', ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

// Отношения лагерей, которых касается вариант: свой лагерь собеседника и затронутые соседи.
function campRelations(state: GameState, faction: Faction, option: SubjectOption): Record<string, number> {
  const out: Record<string, number> = option.camp ? { [faction.id]: option.camp } : {};
  for (const [bloc, value] of Object.entries(option.others ?? {})) {
    for (const group of state.factions) if (group.bloc === bloc && group.id !== faction.id && value) out[group.id] = value;
  }
  return out;
}

function relationText(state: GameState, name: string, figure: number, camps: Record<string, number>): string {
  const groups = Object.entries(camps).map(([id, value]) => `«${state.factions.find(group => group.id === id)!.name}» ${signed(value)}`);
  const parts = [figure ? `${name} ${signed(figure)}` : '', ...groups].filter(Boolean);
  return parts.length ? `Отношение: ${parts.join(', ')}.` : '';
}

export function subjectCall(
  state: GameState, slot: number, caller: Figure, faction: Faction, description: string,
): (GameEvent & { cardId: string }) | null {
  const content = SUBJECT_CALLS[faction.bloc];
  const topic = HISTORICAL_CALL_TOPICS[faction.bloc];
  if (!content || !topic) return null;
  const name = (text: string) => text.replaceAll('{name}', caller.name);
  const trait = traitOf(state.seed, caller, faction.bloc);
  const choice = (id: string, option: SubjectOption): Choice => {
    const camps = campRelations(state, faction, option);
    return {
      id, text: option.text, tags: option.tags, politicalTags: option.tags, resolvesCrisis: null,
      hint: [priceText(option.res), relationText(state, caller.name, option.figure, camps), name(option.terms)]
        .filter(Boolean).join(' '),
      scene: name(option.scene), sceneFail: name(option.scene),
      headline: name(option.headline), headlineFail: name(option.headline),
      deal: {
        pure: true, figure: caller.id, figureRel: option.figure, res: option.res,
        ...(Object.keys(camps).length ? { factionRel: camps } : {}),
        later: { turns: option.report.turns ?? 1, label: option.report.label, res: option.report.res, story: name(option.report.story) },
      },
    };
  };
  const [first, second, third] = content.options;
  return {
    cardId: `call:${slot}:${caller.id}`, title: CALL_TEXT.title, source: 'Защищённая линия',
    description, isCritical: false,
    affectedFactions: [...new Set([first, second, third, content.refuse]
      .flatMap(option => Object.keys(campRelations(state, faction, option))).concat(faction.id))],
    choices: [choice('a', first), choice('b', second), choice('c', third), choice('d', content.refuse), choice('e', content.later)],
    council: null, randomEvent: null,
    special: { kind: 'call', figure: caller.id, faction: faction.id },
    call: { figure: caller.id, trait, demand: topic.demand, negotiation: 'subject',
      context: `${caller.name} добавляет: ${content.voice[trait]} ${content.situation}` },
  };
}
