import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, dateline } from './classic.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { WEATHER_ANY, WEATHER_BY_SEASON } from '../content/frame.ts';
import { historicalSceneText } from '../content/historical-scenes.ts';

// #310: в партии 1978 года погода не повторяется подряд и за первый срок встречается не больше двух раз.
const WEATHER = [...new Set([...WEATHER_ANY, ...Object.values(WEATHER_BY_SEASON).flat()])].map(historicalSceneText);
// Подстановка столицы ({capital:ins} → «Минском») меняет строку, поэтому сверяем части вокруг слота.
const matches = (line: string, entry: string) => entry.split(/\{[^}]+\}/).every(part => line.includes(part));

test('1978: погода первого срока без повторов подряд и не чаще двух раз', async () => {
  for (const seed of [1, 2, 3, 7, 11, 21, 42]) {
    const base = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
      await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed), seededRandom(seed));
    const seen: string[] = [];
    for (let turn = 1; turn < 20; turn++) {
      const line = dateline({ ...base, turn }, 'beat');
      const weather = WEATHER.find(entry => matches(line, entry));
      assert.ok(weather, line);
      seen.push(weather);
    }
    for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `зерно ${seed}: повтор подряд`);
    const counts = seen.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map<string, number>());
    assert.ok(Math.max(...counts.values()) <= 2, `зерно ${seed}: ${JSON.stringify([...counts])}`);
  }
});
