import test from 'node:test';
import assert from 'node:assert/strict';
import { DEEDS, ELECTION_NIGHT, ELECTION_NIGHT_AGAIN_1978, HISTORICAL_PRESS_ELECTION_NIGHT, INTERCUTS, historicalOutsiderPool, outsiderKind } from './roles.ts';

const SIDES = { warm: INTERCUTS.outsider.warm, cold: INTERCUTS.outsider.cold, pro: DEEDS.outsider.pro, con: DEEDS.outsider.con };
const MOVEMENT = /митинг|площад|сбор подписей|[\s«]акци|сторонник|актив|послами|улица|плакат/;
const PRESS = /публикаци|расследовани|статью|номер|полос|корреспондент/;

test('1978: редактор газеты не созывает митингов, лидер движения не ведёт публикаций (#310, E03)', () => {
  assert.equal(outsiderKind('journalist'), 'press');
  assert.equal(outsiderKind('opp_leader'), 'movement');
  assert.equal(outsiderKind('nat_leader'), 'movement');
  for (const [side, pool] of Object.entries(SIDES) as [keyof typeof SIDES, string[]][]) {
    const press = historicalOutsiderPool(pool, 'journalist', side);
    const movement = historicalOutsiderPool(pool, 'opp_leader', side);
    assert.ok(press.length >= 2 && movement.length >= 2, `${side}: у каждого места есть выбор`);
    for (const line of press) assert.doesNotMatch(line, MOVEMENT, `редактор: ${line}`);
    for (const line of movement) assert.doesNotMatch(line.replace('{role}', ''), PRESS, `движение: ${line}`);
    for (const line of [...press, ...movement]) assert.doesNotMatch(line, /в эфире впервые/, `эфир не у газеты и не у движения: ${line}`);
  }
});

test('архив и прочие места получают прежний список строк', () => {
  for (const [side, pool] of Object.entries(SIDES) as [keyof typeof SIDES, string[]][]) {
    for (const id of ['interior', 'oligarch', 'amb_russia', 'patriarch', 'diaspora']) {
      assert.equal(historicalOutsiderPool(pool, id, side), pool);
    }
  }
});

test('1978: в ночь выборов редактор встречает итоги как газета, без лагеря и сторонников', () => {
  for (const line of Object.values(HISTORICAL_PRESS_ELECTION_NIGHT).flat()) {
    assert.doesNotMatch(line, MOVEMENT);
    assert.doesNotMatch(line, /своего лагеря/);
    assert.match(line, /номер|полос/);
  }
});

test('вторые выборы срока в 1978 году: у каждой роли своя реплика, не повторяющая первую (#441)', () => {
  const first = new Set([...Object.values(ELECTION_NIGHT).flatMap(groups => Object.values(groups).flat()), ...Object.values(HISTORICAL_PRESS_ELECTION_NIGHT).flat()]);
  const again = Object.values(ELECTION_NIGHT_AGAIN_1978).flatMap(groups => Object.values(groups));
  assert.equal(again.length, 14);
  assert.equal(new Set(again).size, again.length);
  for (const outcome of ['won', 'lost'] as const) {
    assert.deepEqual(Object.keys(ELECTION_NIGHT_AGAIN_1978[outcome]).sort(), [...Object.keys(ELECTION_NIGHT[outcome]), 'press'].sort());
  }
  for (const line of again) {
    assert.ok(!first.has(line), line);
    assert.ok(line.includes('{name}, {role}'), `имя и должность подставляет движок: ${line}`);
    // Говорящий может быть женщиной: без глаголов прошедшего времени и «сам/сама» при имени.
    assert.doesNotMatch(line, /\{role\},? (?:\p{L}+(?:ал|ил|ел|ёл|ял|ла)\b|сама?\b)/u, line);
    assert.doesNotMatch(line, /(?<![\p{L}])сама?(?![\p{L}])/u, line);
  }
});
