import test from 'node:test';
import assert from 'node:assert/strict';
import { feminineSurname, surnameBase } from './surnames.ts';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from './engine.ts';
import { openDeskWhenDue } from './desk-timing.ts';
import { candidatePool, hireAdvisor, staffingBlocked } from './staffing.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
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

// Порядок «открыть дело → назначить советника → подписать»: преемник уже объявлен в деле, его фамилия занята (#250, coalition/50).
test('1978: назначение до подписи не берёт фамилию преемника, объявленного в открытом деле', async () => {
  for (const seed of [50, ...Array.from({ length: 19 }, (_, index) => index + 1)]) {
    let state = createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', seed),
      seededRandom(seed));
    for (let turn = 0; turn < 20 && !state.ended; turn++) {
      state = openDeskWhenDue(state);
      state = startEvent(state, await classicApi.event(state));
      const candidate = candidatePool(state).find(entry => staffingBlocked(state, entry) === null);
      if (candidate) {
        state = hireAdvisor(state, candidate.id);
        state = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state }))!.state;
      }
      const heirs = state.currentEvent!.choices.flatMap(choice => (choice.deal?.replace ? [choice.deal.replace] : []));
      const where = `coalition/${seed}, ход ${turn + 1}`;
      for (const heir of heirs) {
        const namesake = people(state).filter(name => name !== heir && surnameBase(name) === surnameBase(heir));
        assert.deepEqual(namesake, [], `${where}: преемник ${heir}`);
      }
      const choice = state.currentEvent!.choices[(turn + 1) % state.currentEvent!.choices.length];
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
      const bases = people(state).map(surnameBase);
      assert.equal(new Set(bases).size, bases.length, `${where}: после подписи`);
    }
  }
});
