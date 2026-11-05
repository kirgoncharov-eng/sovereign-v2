import test from 'node:test';
import assert from 'node:assert/strict';
import { lawCampNames } from './law-camps.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { FACTIONS_DATA } from '../game/data.ts';
import type { Faction } from '../game/types.ts';

const factions = (country: string) => FACTIONS_DATA[country].map(faction => ({ ...faction, relation: 0 }) as Faction);

test('1978: карточка закона называет лагеря так же, как остальные экраны', () => {
  const state = { country: ALTERNATE_COUNTRY, factions: factions(ALTERNATE_COUNTRY) };
  const names = lawCampNames(state, ['business', 'west', 'russia']);
  assert.deepEqual(names, ['Промышленная палата', 'Торговый союз', 'Российская делегация']);
  for (const name of lawCampNames(state, state.factions.map(faction => faction.bloc)))
    assert.doesNotMatch(name, /^(бизнес|либералы|регионы|Россия|торговые партнёры)$/);
});

test('архив: прежние общие ярлыки блоков', () => {
  const state = { country: 'Беларусь', factions: factions('Беларусь') };
  assert.deepEqual(lawCampNames(state, ['business', 'liberal', 'regional']), ['бизнес', 'либералы', 'регионы']);
});
