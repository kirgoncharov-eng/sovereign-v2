import { RES_CONFIG } from '../game/data.ts';
import { leaderRating, securityRelation, warningSignals } from '../game/engine.ts';
import type { GameState, ResourceKey } from '../game/types.ts';

const EFFECT: Record<ResourceKey, string> = {
  politicalCapital: 'Аппарату всё труднее проводить ваши решения.',
  economy: 'У государства остаётся мало экономического запаса.',
  military: 'Силовой аппарат ослаблен. Его сила и лояльность — разные показатели.',
  externalReputation: 'Внешние партнёры всё меньше доверяют вашей власти.',
  internalLegitimacy: 'Общество всё меньше признаёт ваше право управлять.',
  personalResource: 'Вы истощены: проводить решения становится труднее.',
};

export function warningDetails(gs: GameState) {
  return warningSignals(gs).map(s => {
    const resource = RES_CONFIG.find(r => r.key === s.id);
    const previous = resource ? gs.prevResources?.[resource.key]
      : s.id === 'security' ? gs.prevFactions && securityRelation(gs.prevFactions)
      : gs.prevFactions && gs.prevResources && leaderRating(gs.prevFactions, gs.prevResources);
    const sources = resource ? gs.lastTurn?.sources?.[resource.key]?.filter(([, d]) => d < 0) ?? [] : [];
    return { ...s, label: resource?.prompt ?? (s.id === 'rating' ? 'Рейтинг вашей партии' : 'Отношение силового лагеря'),
      unit: s.id === 'rating' ? '%' : resource ? '/100' : '',
      explanation: resource ? EFFECT[resource.key] : s.id === 'rating' ? 'Низкая поддержка увеличивает угрозу потери власти.' : 'Силовики настроены против вас: растёт риск переворота.',
      previous: previous ?? null, sources,
      factions: s.id === 'security' ? gs.factions.filter(f => f.bloc === 'security').map(f => ({ name:f.name, relation:f.relation })) : [],
    };
  });
}
