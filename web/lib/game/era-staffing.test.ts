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
