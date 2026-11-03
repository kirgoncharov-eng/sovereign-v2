import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseNarrative } from './collapse-narrative.ts';
import { classicApi } from './classic.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { memoir } from '../client/chronicle.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';

async function base(country = ALTERNATE_COUNTRY) {
  return createInitialState(country, 'debut', 'pragmatist', await classicApi.setup(country, 'debut', 'pragmatist', 7), seededRandom(7));
}

test('истощение лидера не рассказывается как пустая казна; несколько причин сохранены', async () => {
  const original = await base();
  const state = { ...original, endType: 'collapse' as const,
    resources: { ...original.resources, economy: 19, internalLegitimacy: 92, personalResource: 4 } };
  const text = collapseNarrative(state)!;
  assert.match(text, /Лидер измотан/);
  assert.doesNotMatch(text, /Казна пуста|зарплат|свет/);
  for (const name of ['Анна Ладина', 'Антон Кленов']) {
    const leader = { ...state.leader, name };
    const named = { ...state, leader, ended: true };
    assert.ok(collapseNarrative(named)!.includes(`${name} подписывает последний указ`));
    const page = await memoir(named);
    assert.ok(page.fall!.text.includes(`${name} подписывает последний указ`), 'реальные мемуары согласованы');
  }
  const both = collapseNarrative({ ...state, resources: { ...state.resources, economy: 0 } })!;
  assert.match(both, /Казна пуста/);
  assert.match(both, /Лидер измотан/);
  assert.equal(collapseNarrative({ ...state, endType: 'coup' }), null);
  assert.equal(collapseNarrative({ ...state, country: 'Беларусь' }), null);
  assert.equal(collapseNarrative({ ...state, resources: original.resources }), null);
});

test('последняя подпись берёт причину после расчёта; прежнее сохранение и мемуары объясняют тот же исход', async () => {
  const original = await base();
  const ready = { ...original, resources: { ...original.resources, personalResource: 9 } };
  const state = startEvent(ready, { title: 'Последняя подпись', description: 'Документ', source: 'Кабинет',
    isCritical: false, affectedFactions: [], randomEvent: null,
    choices: [{ id: 'a', text: 'Подписать', hint: '', tags: [], resolvesCrisis: null, deal: { pure: true, res: { personalResource: -6 } } }] });
  const narration = await classicApi.consequence(state, 'a');
  assert.match(narration.powerLoss!, /Лидер измотан/);
  const after = resolveTurn(state, 'a', narration);
  assert.equal(after.endType, 'collapse');
  assert.equal(after.resources.personalResource, 4);
  const old = { ...after, powerLoss: 'Государство перестало работать: бюджетникам не платят.' };
  const restored = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: old }))!.state;
  assert.ok(restored);
  const page = await memoir(restored);
  assert.match(page.fall!.text, /Лидер измотан/);
  assert.doesNotMatch(page.fall!.text, /бюджетникам/);
  assert.deepEqual(restored.resources, after.resources);
});
