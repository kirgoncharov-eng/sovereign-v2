import test from 'node:test';
import assert from 'node:assert/strict';
import { feminineSurname, surnameBase } from './surnames.ts';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from './engine.ts';
import { openDeskWhenDue } from './desk-timing.ts';
import { candidatePool } from './staffing.ts';
import type { DifficultyId, GameState } from './types.ts';

test('женская форма и основа фамилии согласованы для всех окончаний пула', () => {
  const cases: [string, string][] = [['Кленов', 'Кленова'], ['Гордеев', 'Гордеева'], ['Лесин', 'Лесина'], ['Горский', 'Горская'],
    ['Рудницкий', 'Рудницкая'], ['Яровой', 'Яровая'], ['Луговой', 'Луговая'], ['Борич', 'Борич'], ['Жук', 'Жук']];
  for (const [male, female] of cases) {
    assert.equal(feminineSurname(male), female);
    assert.equal(surnameBase(`Ольга ${female}`), male);
    assert.equal(surnameBase(`Леонид ${male}`), male);
  }
});

// Все люди партии с фамилией: одинаковое полное имя — один и тот же человек в двух списках (губернатор и в папке, и среди фигур).
function people(state: GameState): string[] {
  return [...new Set([state.leader.name, ...state.advisors.map(a => a.name), ...state.keyFigures.map(f => f.name),
    ...(state.world?.people.map(p => p.name) ?? []), ...(state.world?.secretary ? [state.world.secretary.name] : []),
    ...candidatePool(state).map(c => c.name)])];
}

test('1978: за срок ни у кого нет мужской фамилии при женском имени и чужой фамилии антагониста — 60 партий', async () => {
  for (const diff of ['coalition', 'debut', 'crisis'] as DifficultyId[]) for (let seed = 1; seed <= 20; seed++) {
    let state = createInitialState(ALTERNATE_COUNTRY, diff, 'pragmatist', await classicApi.setup(ALTERNATE_COUNTRY, diff, 'pragmatist', seed),
      seededRandom(seed));
    for (let turn = 0; turn < 20 && !state.ended; turn++) {
      state = openDeskWhenDue(state);
      state = startEvent(state, await classicApi.event(state));
      const names = people(state);
      const where = `${diff}/${seed}, ход ${turn + 1}`;
      for (const name of names) assert.doesNotMatch(name, /^(Нина|Вера|Ольга|Лидия) \S+ой$/, `${where}: ${name}`);
      const bases = names.map(surnameBase);
      const repeated = names.filter((_, index) => bases.indexOf(bases[index]) !== index);
      assert.deepEqual(repeated, [], `${where}: фамилия повторяется`);
      const choice = state.currentEvent!.choices[turn % state.currentEvent!.choices.length];
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    }
  }
});
