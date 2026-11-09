// #404: в Неманской республике 1978 года нет советской «милиции» и дореволюционных «уездов», «костёлов», «купцов».
// Силовой лагерь — Служба порядка («полиция, армия и управление безопасности»), земля делится на области и районы.
// Сторож читает только данные кампании 1978 года: архивные страны пишутся на языке своей эпохи и сюда не входят.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALTERNATE_ARC, ALTERNATE_EVENTS, ALTERNATE_LAWS, ALTERNATE_RANDOM_EVENTS } from './alternate-history.ts';
import { ALTERNATE_COUNCIL, ALTERNATE_COUNCIL_HEADLINES, ALTERNATE_EARLY_THREAD } from './alternate-history-extras.ts';
import { ADVISOR_DIALOGUE } from './advisor-dialogue.ts';
import { PILOT_ODDITIES, PILOT_SWANS, PILOT_TAILS } from './black-swans.ts';
import { HISTORICAL_CALL_TOPICS } from './historical-calls.ts';
import { HISTORICAL_DELAYED_LABELS, HISTORICAL_ECHOES } from './historical-echoes.ts';
import { HISTORICAL_SCENES } from './historical-scenes.ts';
import { INVESTIGATION_DEBATES } from './investigation-debates.ts';
import { INVESTIGATION_DIALOGUE } from './investigation-dialogue.ts';
import { PRESS_1978_TEXT } from './press-1978.ts';
import { TERM_FINALE, TERM_MEMORY } from './term-finale.ts';
import { HISTORICAL_DEBATES } from '../game/presidential-story.ts';

const FOREIGN_WORDS = /милиц|уезд|костёл|костел|купц|купеч/iu;

const strings = (value: unknown): string[] => typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(strings)
  : value && typeof value === 'object' ? [...Object.keys(value), ...Object.values(value).flatMap(strings)] : [];

test('словарь мира 1978 года: полиция и районы, без «милиции», «уездов», «костёлов» и «купцов»', () => {
  const sources = {
    ALTERNATE_EVENTS, ALTERNATE_RANDOM_EVENTS, ALTERNATE_LAWS, ALTERNATE_ARC, ALTERNATE_COUNCIL, ALTERNATE_COUNCIL_HEADLINES,
    ALTERNATE_EARLY_THREAD, ADVISOR_DIALOGUE, HISTORICAL_DEBATES, INVESTIGATION_DEBATES, INVESTIGATION_DIALOGUE,
    HISTORICAL_ECHOES, HISTORICAL_DELAYED_LABELS, HISTORICAL_SCENES, HISTORICAL_CALL_TOPICS, PRESS_1978_TEXT,
    TERM_MEMORY, TERM_FINALE, PILOT_SWANS, PILOT_TAILS, PILOT_ODDITIES,
  };
  for (const [name, data] of Object.entries(sources)) {
    const texts = strings(data);
    assert.ok(texts.length > 0, `${name}: сторож видит текст`);
    for (const text of texts) assert.doesNotMatch(text, FOREIGN_WORDS, `${name}: «${text}»`);
  }
});
