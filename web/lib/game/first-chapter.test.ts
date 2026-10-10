import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newChapter, decideChapter, chapterOptions, goalMet, keptPromise, restoreChapter, serializeChapter } from './first-chapter.ts';
import { chapterStory } from './first-chapter-story.ts';
import { worldPerson } from './living-world.ts';

test('every reachable chapter path ends at eight quarters; facts and replay remain consistent', async t => {
  const base = await newChapter();
  let endings = 0, fulfilled = 0, broken = 0;
  const goals = new Set();
  function visit(c: typeof base) {
    const before = JSON.stringify(c);
    assert.ok(chapterStory(c).paragraphs.every(p => !/undefined|NaN/.test(p)));
    assert.deepEqual(restoreChapter(base, serializeChapter(c)), c);
    if (c.stage === 'end') {
      endings++; assert.equal(c.game.turn, 8); assert.equal(c.game.world!.lastTick, 8);
      assert.equal(c.game.world!.health!.aftermath!.phase, 'settled');
      if (goalMet(c)) goals.add(c.goal);
      if (c.promise) { if (keptPromise(c)) fulfilled++; else broken++; }
      return;
    }
    const options = chapterOptions(c).filter(o => !o.blocked);
    assert.ok(options.length, `no available option at ${c.stage}`);
    for (const option of options) visit(decideChapter(c, option.id));
    assert.equal(JSON.stringify(c), before, 'input mutated');
  }
  visit(base);
  t.diagnostic(`${endings} complete decision paths; ${fulfilled} fulfilled and ${broken} broken public promises`);
  assert.ok(endings > 1000); assert.ok(fulfilled > 0 && broken > 0);
  assert.deepEqual([...goals].sort(), ['lasting', 'reach', 'reserve']);
});
test('phone changes real executors and relations; deferred price is charged once', async () => {
  let c = await newChapter();
  for (const id of ['goal:lasting', 'health:appoint:doctor', 'health:fund']) c = decideChapter(c, id);
  const start = c.game.resources.politicalCapital;
  const minister = decideChapter(c, 'contract:minister');
  assert.equal(minister.game.world!.health!.executor, 'healthMinister');
  assert.equal(minister.game.resources.politicalCapital, start - 1);
  assert.equal(worldPerson(minister.game, 'doctor')!.relation, worldPerson(c.game, 'doctor')!.relation - 10);
  const year = decideChapter(minister, 'keep');
  assert.equal(year.game.resources.politicalCapital, start - 3); assert.equal(year.debtPaid, true);
  const press = decideChapter(year, 'press:responsibility');
  assert.equal(press.game.turn, 4);
  const follow = decideChapter(press, 'honest');
  assert.equal(follow.game.resources.politicalCapital, year.game.resources.politicalCapital); assert.equal(follow.game.turn, 5);
  const doctor = decideChapter(c, 'contract:doctor');
  assert.equal(doctor.game.world!.health!.executor, 'doctor'); assert.equal(doctor.game.world!.health!.cover, true);
});
test('false saves and out-of-scene choices are rejected', async () => {
  const base = await newChapter();
  for (const value of ['{}', '{', JSON.stringify({ version: 7, decisions: [] }), JSON.stringify({ version: 1, decisions: ['contract:doctor'] }), JSON.stringify({ version: 1, decisions: Array(11).fill('goal:reach') })]) assert.equal(restoreChapter(base, value), null);
  assert.throws(() => decideChapter(base, 'health:fund'));
});
