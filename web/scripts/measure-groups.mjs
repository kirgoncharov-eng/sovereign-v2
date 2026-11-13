// Повторяемый замер пилота и полное сравнение архивных/Daily партий с базой PR.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { newTerm, nextCase, signChoice, startFromSeed } from '../lib/client/chronicle.ts';
import { livingActions, interveneWorld } from '../lib/game/living-world.ts';
import { planTurn } from '../lib/game/engine.ts';
import { parseSave } from '../lib/client/save.ts';
import { SAVE_VERSION } from '../lib/game/data.ts';
const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const out = resolve(arg('out', '/tmp/groups-measure.json'));
const baseline = arg('baseline', '');
const texts = [], runs = [];
let saves = 0, turns = 0, compatible = 0, comparedTurns = 0;
async function play(seed, diff, route, record) {
  let s = await newTerm(startFromSeed(seed, diff));
  let previous = '';
  while (!s.ended && s.turn < 20) {
    s = await nextCase(s);
    const g = s.world?.groups;
    if (g) {
      const desired = g.phase === 'offer' ? ({ support: 'back', conditions: 'conditions', delegate: 'delegate' })[route]
        : g.phase === 'dispute' ? 'fuel' : g.phase === 'bargain' ? 'shared' : null;
      const action = route !== 'silence' && livingActions(s).find(a => a.id === `groups:${g.phase}:${desired}` && !a.blocked);
      if (action) s = interveneWorld(s, action.id);
    }
    const choice = [...s.currentEvent.choices].sort((a, b) => {
      const score = c => { const p = planTurn(s, c.id); return Math.min(...Object.values(p.resources)) + p.chance * 5; };
      return score(b) - score(a);
    })[0];
    s = await signChoice(s, choice.id);
    const raw = JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: s });
    const loaded = parseSave(raw);
    assert.ok(loaded, `${seed}/${diff}/${route}/turn ${s.turn}`);
    assert.deepEqual(loaded.state, JSON.parse(raw).state);
    if (record) {
      saves++; turns++;
      const text = s.world?.groups?.text;
      if (text && text !== previous) { texts.push(`${seed} / ${diff} / ${route} / квартал ${s.turn}\n${text}`); previous = text; }
    }
    s = loaded.state;
  }
  return s;
}
for (const seed of [3, 7, 19, 24]) for (const diff of ['debut', 'coalition', 'crisis', 'ruins']) {
  for (const route of ['support', 'conditions', 'delegate', 'silence']) {
    const first = await play(seed, diff, route, true), repeated = await play(seed, diff, route, false);
    assert.deepEqual(repeated, first, 'полный повтор партии детерминирован');
    runs.push({ seed, diff, route, turn: first.turn, phase: first.world?.groups?.phase ?? null,
      outcome: first.world?.groups?.outcome ?? null, ended: first.endType });
  }
}
if (baseline) {
  const load = (root, path) => import(pathToFileURL(resolve(root, path)).href);
  const currentEngine = await load('.', 'lib/game/engine.ts'), oldEngine = await load(baseline, 'lib/game/engine.ts');
  const currentApi = (await load('.', 'lib/game/classic.ts')).classicApi;
  const oldApi = (await load(baseline, 'lib/game/classic.ts')).classicApi;
  for (const country of ['Беларусь', 'Украина', 'Грузия', 'Молдова', 'Армения', 'Казахстан', 'Беларусь · 1978']) {
    for (const seed of [3, 19]) for (const diff of ['debut', 'crisis']) {
      const fresh = async (engine, api) => {
        const s = engine.createInitialState(country, diff, 'pragmatist', await api.setup(country, diff, 'pragmatist', seed), engine.seededRandom(seed));
        if (country.endsWith('1978')) s.daily = '2026-11-13';
        return s;
      };
      let a = await fresh(currentEngine, currentApi), b = await fresh(oldEngine, oldApi);
      while (!a.ended && a.turn < 20) {
        a = currentEngine.startEvent(a, await currentApi.event(a));
        b = oldEngine.startEvent(b, await oldApi.event(b));
        assert.deepEqual(a, b, 'старое дело совпадает');
        const id = a.currentEvent.choices[0].id;
        a = currentEngine.resolveTurn(a, id, await currentApi.consequence(a, id));
        b = oldEngine.resolveTurn(b, id, await oldApi.consequence(b, id));
        assert.deepEqual(a, b, 'полное состояние архива/Daily совпадает'); comparedTurns++;
      }
      compatible++;
    }
  }
}
const summary = { runs: runs.length, turns, saves, deterministicRepeats: runs.length, compatible, comparedTurns,
  outcomes: runs.reduce((counts, run) => { const key = run.outcome ?? run.phase ?? 'not-started'; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {}), details: runs };
await writeFile(out, JSON.stringify(summary, null, 2));
await writeFile(out.replace(/\.json$/, '') + '-text.txt', texts.join('\n\n'));
console.log(JSON.stringify({ ...summary, details: undefined }, null, 2));
