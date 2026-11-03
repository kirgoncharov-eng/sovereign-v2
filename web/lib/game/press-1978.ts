// Пресса 1978 года (#310, E04; образец и словарь приняты Кириллом в #340).
// Одна строка за квартал, только когда есть факт: срыв → выборы → бюджет → пресс-конференция → лагерь ±4 →
// экономика ±3 → репутация ±3 → строки нет. Всё берётся из уже рассчитанного хода: RNG, цены и исходы не трогаем.
import { CAMP_OUTLET, CAMP_STANCE, PRESS_1978_OUTLETS, PRESS_1978_TEXT as T } from '../content/press-1978.ts';
import type { SpecialAct } from '../content/reactions.ts';
import type { Election, Faction, GameState, Resources } from './types.ts';

export interface PressLine { outlet: string; headline: string }

export interface Press1978Input {
  before: GameState;
  headline: string;
  success: boolean;
  act: SpecialAct | null;
  election: Election | null;
  finale: boolean;
  factions: Faction[];
  resources: Resources;
}

const CAMP_SHIFT = 4;
const MONEY_SHIFT = 3;
const REPUTATION_SHIFT = 3;

const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);
const joinNames = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} и ${names.at(-1)}`;
const points = (n: number) => {
  const tail = n % 100, last = n % 10;
  return tail >= 11 && tail <= 14 ? 'пунктов' : last === 1 ? 'пункт' : last >= 2 && last <= 4 ? 'пункта' : 'пунктов';
};
// Тема вопроса записана в предложном падеже и обращена к президенту: «вашей подписи». Газета пишет о нём в третьем лице.
const OWN: [RegExp, string][] = [[/(?<![\p{L}])вашем(?![\p{L}])/gu, 'своём'], [/(?<![\p{L}])вашей(?![\p{L}])/gu, 'своей'],
  [/(?<![\p{L}])ваших(?![\p{L}])/gu, 'своих'], [/(?<![\p{L}])вашего(?![\p{L}])/gu, 'своего'], [/(?<![\p{L}])вашим(?![\p{L}])/gu, 'своим']];
const thirdPerson = (topic: string) => OWN.reduce((text, [pattern, own]) => text.replace(pattern, own), topic);
// Перед гласной — «об»: «об обещаниях».
const about = (topic: string) => `${/^[аоуэиАОУЭИ]/.test(topic) ? 'об' : 'о'} ${thirdPerson(topic)}`;

function campShifts(before: GameState, factions: Faction[]) {
  return before.factions.flatMap(group => {
    const after = factions.find(entry => entry.id === group.id);
    return after && CAMP_STANCE[group.id] ? [{ id: group.id, name: group.name, delta: after.relation - group.relation }] : [];
  });
}

export function press1978(input: Press1978Input): PressLine[] {
  const { before, headline, success, act, election, finale, factions, resources } = input;
  // У развязки срока свой текст; прессу к ней не пристёгиваем.
  if (finale) return [];
  const civil = (text: string): PressLine[] => [{ outlet: PRESS_1978_OUTLETS.civil, headline: text }];
  const fact = sentence(headline);

  if (election) {
    const tail = election.outcome === 'won'
      ? T.electionSecond.replace('{name}', election.top.name).replace('{share}', String(election.top.share))
      : T.electionRuling.replace('{share}', String(election.leader));
    return civil(`${fact} ${tail}`);
  }
  if (!success) return civil(`${fact} ${T.failed}`);

  const camps = campShifts(before, factions);
  if (act === 'budget') {
    const gainers = camps.filter(camp => camp.delta >= MONEY_SHIFT).map(camp => camp.name);
    const losers = camps.filter(camp => camp.delta <= -MONEY_SHIFT).map(camp => camp.name);
    const split = gainers.length && losers.length
      ? T.budgetSplit.replace('{gainers}', joinNames(gainers)).replace('{losers}', joinNames(losers))
      : gainers.length ? T.budgetGain.replace('{gainers}', joinNames(gainers))
        : losers.length ? T.budgetLoss.replace('{losers}', joinNames(losers)) : '';
    return civil([T.budget, split].filter(Boolean).join(' '));
  }
  if (act === 'press') {
    const topics = (before.currentEvent?.press?.questions ?? []).slice(0, 2).map(question => about(question.topic));
    return civil(topics.length ? T.press.replace('{topics}', topics.join(' и ')) : fact);
  }

  const moved = camps.filter(camp => Math.abs(camp.delta) >= CAMP_SHIFT)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.delta - b.delta)[0];
  if (moved) {
    const stance = CAMP_STANCE[moved.id][moved.delta < 0 ? 'against' : 'for'];
    return [{ outlet: PRESS_1978_OUTLETS[CAMP_OUTLET[moved.id] ?? 'civil'], headline: `${fact} ${moved.name} ${stance}.` }];
  }
  const money = resources.economy - before.resources.economy;
  if (Math.abs(money) >= MONEY_SHIFT) {
    const n = Math.abs(money);
    const text = (money < 0 ? T.moneyLoss : T.moneyGain).replace('{n}', String(n)).replace('{points}', points(n));
    return [{ outlet: PRESS_1978_OUTLETS.business, headline: `${fact} ${text}` }];
  }
  const reputation = resources.externalReputation - before.resources.externalReputation;
  if (Math.abs(reputation) >= REPUTATION_SHIFT) {
    return [{ outlet: PRESS_1978_OUTLETS.trade, headline: `${fact} ${reputation > 0 ? T.reputationUp : T.reputationDown}` }];
  }
  return [];
}
