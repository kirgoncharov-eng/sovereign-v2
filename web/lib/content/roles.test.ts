import test from 'node:test';
import assert from 'node:assert/strict';
import { DEEDS, INTERCUTS, historicalOutsiderPool, outsiderKind } from './roles.ts';

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
