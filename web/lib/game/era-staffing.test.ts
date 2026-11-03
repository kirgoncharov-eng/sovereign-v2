import test from 'node:test';
import assert from 'node:assert/strict';
import { eraText } from './alternate-world.ts';
import { CHANNELS, FREAKS } from '../content/staffing.ts';
import { PRESS_QUESTIONS } from '../content/press.ts';

// #310, E06: язык 1978 года — без поисковиков, слайдов, олигархов, холдингов и ток-шоу.
const ANACHRONISM = /топ запросов|слайд|олигарх|холдинг|ток-шоу|(?<![\p{L}])акции/u;

test('1978: кадровые карточки и ведущие на пресс-конференции говорят языком своей эпохи', () => {
  const staffing = [
    ...FREAKS.flatMap(freak => [freak.title, freak.bio]),
    ...Object.values(CHANNELS).flatMap(channel => [channel.label, channel.how, channel.receipt, ...channel.bios]),
  ];
  for (const line of staffing) assert.doesNotMatch(eraText(line), ANACHRONISM, line);
  for (const question of PRESS_QUESTIONS) assert.doesNotMatch(eraText(question.who), ANACHRONISM, question.who);
  assert.equal(eraText('пятеро генералов и один олигарх'), 'пятеро генералов и один директор концерна');
});

test('1978: квитанция настоящего назначения тоже говорит языком эпохи; архив сохраняет прежнюю', async () => {
  const { classicApi } = await import('./classic.ts');
  const { createInitialState, seededRandom } = await import('./engine.ts');
  const { DESK_FROM } = await import('./desk-timing.ts');
  const { POOL_TURNS, candidatePool, hireAdvisor, staffingBlocked } = await import('./staffing.ts');
  const { ALTERNATE_COUNTRY } = await import('./alternate-world.ts');
  const receipts = async (country: string) => {
    const found: Record<string, string> = {};
    for (let seed = 1; seed <= 30 && Object.keys(found).length < 2; seed++) {
      const base = createInitialState(country, 'debut', 'pragmatist', await classicApi.setup(country, 'debut', 'pragmatist', seed), seededRandom(seed));
      for (let year = 0; year < 4; year++) {
        const state = { ...base, turn: DESK_FROM + year * POOL_TURNS, arc: null,
          resources: { politicalCapital: 90, economy: 90, military: 90, externalReputation: 90, internalLegitimacy: 90, personalResource: 90 } };
        for (const candidate of candidatePool(state)) {
          if (!['oligarch', 'relative'].includes(candidate.channel) || found[candidate.channel] || staffingBlocked(state, candidate)) continue;
          found[candidate.channel] = hireAdvisor(state, candidate.id).staffing!.receipt!;
        }
      }
    }
    return found;
  };
  const historical = await receipts(ALTERNATE_COUNTRY);
  assert.deepEqual(Object.keys(historical).sort(), ['oligarch', 'relative']);
  for (const receipt of Object.values(historical)) assert.doesNotMatch(receipt, ANACHRONISM, receipt);
  const archive = await receipts('Беларусь');
  assert.ok(Object.values(archive).some(receipt => ANACHRONISM.test(receipt)), 'архивные квитанции не переписаны');
});
