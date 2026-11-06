// #359: архив/Daily совпадают целиком, в обычной партии добавляются только записи контроля.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const baseline = process.argv.find(arg => arg.startsWith('--base='))?.slice(7);
if (!baseline) throw new Error('Нужен --base=<checkout main/web>');
const modules = async tree => ({
  classic: await import(pathToFileURL(resolve(tree, 'lib/game/classic.ts'))),
  engine: await import(pathToFileURL(resolve(tree, 'lib/game/engine.ts'))),
});
const current = await modules(root), old = await modules(baseline);
const { COUNTRIES } = await import('../lib/game/data.ts');
const alternate = 'Беларусь · 1978';
const observed = { archive: 0, ordinary: 0, daily: 0, turns: 0, hashes: [] };
const strip = state => {
  const copy = structuredClone(state);
  for (const entry of copy.history) delete entry.factoryMandate;
  return copy;
};

async function fresh(modules, country, seed, daily) {
  const state = modules.engine.createInitialState(country, 'debut', 'pragmatist',
    await modules.classic.classicApi.setup(country, 'debut', 'pragmatist', seed), modules.engine.seededRandom(seed));
  return daily ? { ...state, daily: '2026-11-06' } : state;
}
async function step(modules, state, first) {
  state = modules.engine.startEvent(state, await modules.classic.classicApi.event(state));
  const event = state.currentEvent;
  let choice = event.choices[state.turn === 0 ? first : 0];
  if (event.budget) choice = modules.classic.budgetChoice(state, { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, false);
  else if (event.call && !event.call.negotiation) choice = modules.classic.callChoice(state, 'numbers', 'deal');
  else if (event.press) choice = modules.classic.pressChoice(state, [0, -1, 2]);
  if (event.budget || event.call && !event.call.negotiation || event.press)
    state = { ...state, currentEvent: { ...event, choices: [choice, event.choices[1]] } };
  return modules.engine.resolveTurn(state, choice.id, await modules.classic.classicApi.consequence(state, choice.id));
}

for (const country of Object.keys(COUNTRIES)) for (const seed of [1, 7, 21]) {
  const modes = country === alternate ? ['ordinary', 'daily'] : ['archive'];
  for (const mode of modes) for (const first of country === alternate ? [0, 1, 2] : [0]) {
    let a = await fresh(current, country, seed, mode === 'daily');
    let b = await fresh(old, country, seed, mode === 'daily');
    assert.deepEqual(a, b);
    while (!a.ended && a.turn < 10) {
      a = await step(current, a, first);
      b = await step(old, b, first);
      assert.deepEqual(mode === 'ordinary' ? strip(a) : a, b, `${country}/${mode}/${seed}/${first}/${a.turn}`);
      if (mode !== 'ordinary') assert.ok(a.history.every(entry => !entry.factoryMandate));
      observed.turns++;
    }
    observed[mode]++;
    observed.hashes.push(createHash('sha256').update(JSON.stringify(mode === 'ordinary' ? strip(a) : a)).digest('hex'));
  }
}
console.log(JSON.stringify(observed, null, 2));
