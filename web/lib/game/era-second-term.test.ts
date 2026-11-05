import test from 'node:test';
import assert from 'node:assert/strict';
import { ALTERNATE_COUNTRY, ALTERNATE_SHARED_CARDS, ALTERNATE_SHARED_LAWS, campaignCopy, eraText } from './alternate-world.ts';
import { EVENT_CARDS } from '../content/events.ts';
import { ARCS } from '../content/arcs.ts';
import { FAIL_A } from '../content/fail-a.ts';
import { FAIL_B } from '../content/fail-b.ts';
import { CARD_HEADLINES } from '../content/headlines-cards.ts';
import { COUNCIL_HEADLINES } from '../content/headlines-council.ts';
import { SCENES } from '../content/scenes.ts';
import { COUNCIL_A } from '../content/council-a.ts';
import { COUNCIL_B } from '../content/council-b.ts';
import { BEAT_FAILS } from '../content/fail-beats.ts';
import { BEAT_EXT } from '../content/beats-ext.ts';
import { LAWS } from '../content/laws.ts';
import * as BEAT_HEADLINE_TEXT from '../content/headlines-beats.ts';
import * as REACTIONS from '../content/reactions.ts';
import * as PROMISE_TEXT from '../content/promises.ts';
import * as NEWSPAPER from '../content/newspaper.ts';
import * as FRAME from '../content/frame.ts';
import * as ECHO_TEXT from '../content/echoes.ts';
import * as ROLES from '../content/roles.ts';
import * as CALLS from '../content/calls.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';

// #310, P03: общая колода второго срока, законы и интриги приходят в 1978 год из общих шаблонов.
// Телевидение, распечатки, экраны и санкции в 1978 году есть; карманных телефонов, серверов и офшоров — нет.
const ANACHRONISM = new RegExp([
  'личн\\p{L}* телефон', 'на телефон', 'телефон\\p{L}* отбира', 'телеком', 'офшор', 'энергокомпани', 'бизнес-ассоциац',
  'бизнесмен', 'флешк', 'сервер', 'олигарх', 'госкорпорац', 'пресс-релиз', 'тендер', 'нацбанк', 'VIP', 'ипотек', 'спецназ',
  'стартап', 'брюссел', 'западн\\p{L}+ партн',
].join('|'), 'iu');
// «Запад» как сущность — с прописной; направление «на запад» в текстах 1978 года остаётся.
const WEST = /(?<![\p{L}])Запад(?![\p{L}])/u;

const strings = (value: unknown): string[] => typeof value === 'string' ? [value]
  : Array.isArray(value) ? value.flatMap(strings)
    : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

// Тексты, которые партия 1978 года получает после первого срока: карточки, законы, интриги и их провалы.
function reachable(): string[] {
  const cards = EVENT_CARDS.filter(card => ALTERNATE_SHARED_CARDS.has(card.id));
  const byCard = [FAIL_A, FAIL_B, CARD_HEADLINES, COUNCIL_HEADLINES, SCENES, COUNCIL_A, COUNCIL_B]
    .flatMap(table => [...ALTERNATE_SHARED_CARDS].map(id => (table as Record<string, unknown>)[id]));
  const laws = LAWS.filter(law => ALTERNATE_SHARED_LAWS.has(law.id));
  const arcs = ARCS.filter(arc => !arc.countries || arc.countries.includes(ALTERNATE_COUNTRY));
  const keys = new Set(strings(arcs));
  const beats = [BEAT_FAILS, BEAT_EXT].flatMap(table => Object.entries(table).filter(([key]) => keys.has(key)).map(([, text]) => text));
  // Общие модули без привязки к стране: отклики, обещания, иностранная пресса, эхо, звонки, заголовки интриг.
  const shared = [BEAT_HEADLINE_TEXT, REACTIONS, PROMISE_TEXT, NEWSPAPER, FRAME, ECHO_TEXT, ROLES, CALLS];
  return strings([cards, byCard, laws, arcs, beats, shared]);
}

test('1978: вторая колода, законы и интриги говорят языком своей эпохи', () => {
  const lines = reachable();
  assert.ok(lines.length > 1500, `проверяется вся достижимая колода, а не пустой список: ${lines.length}`);
  const found = lines.map(line => eraText(line)).filter(line => ANACHRONISM.test(line) || WEST.test(line));
  assert.deepEqual(found, []);
});

test('1978: замены сохраняют род, число и смысл сцены', () => {
  assert.equal(eraText('Олигарх выставил счёт'), 'Директор концерна выставил счёт');
  assert.equal(eraText('Открытый аукцион: телеком продан дороже ожиданий'), 'Открытый аукцион: телефонный концерн продан дороже ожиданий');
  assert.equal(eraText('Телеком ушёл «своим» покупателям'), 'Телефонный концерн ушёл «своим» покупателям');
  assert.equal(eraText('Нацбанк поднял ставку: курс остановился'), 'Национальный банк поднял ставку: курс остановился');
  assert.equal(eraText('Каналы олигарха ударили по семье президента'), 'Газеты концерна ударили по семье президента');
  assert.equal(eraText('Голодающего задержали — Запад негодует'), 'Голодающего задержали — Торговый союз негодует');
  // Направления и прилагательные не трогаем: «с запада», «западная техника».
  assert.equal(eraText('мазут с запада'), 'мазут с запада');
  assert.equal(eraText('Армия переходит на западную технику'), 'Армия переходит на западную технику');
});

test('архив: шесть стран получают общие тексты без замен эпохи', () => {
  const lines = reachable();
  for (const country of ['Беларусь', 'Казахстан', 'Молдова']) assert.deepEqual(campaignCopy(lines, country), lines);
  assert.ok(lines.some(line => ANACHRONISM.test(line)), 'исходные шаблоны архива не переписаны');
});

// Заголовки и тексты резолюций 1978 года служат ключами истории (иллюстрации, закон первого срока, память финала).
test('1978: авторские заголовки и резолюции не меняются заменами эпохи', () => {
  const keys = ALTERNATE_EVENTS.flatMap(card => [card.title, ...card.choices.map(choice => choice.text)]);
  assert.ok(keys.length > 60);
  assert.deepEqual(keys.filter(key => eraText(key) !== key), []);
});
