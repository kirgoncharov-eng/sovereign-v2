import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstStep, newTerm, nextCase, programOf, quarterLines, signCall, signOption, signPress, startFromSeed, takeOffice } from './chronicle.ts';
import { lifeBeat } from './chronicle-life.ts';
import { EMPTY_PERSONAL, type PersonalMemory } from './chronicle-personal.ts';
import { LIFE_1978, type LifeBand, type LifePlace } from '../content/life-1978.ts';
import { TERM } from '../game/data.ts';
import type { DifficultyId, GameState } from '../game/types.ts';

const textsOf = (place: LifePlace) => [...Object.values(place.first), ...Object.values(place.up), ...Object.values(place.down), ...Object.values(place.same)];
const bandOf = (place: LifePlace, value: number): LifeBand => value < place.low ? 'low' : value > place.high ? 'high' : 'mid';

test('образец жизни за воротами: три места, у каждого десять разных строк без обращения к игроку', () => {
  assert.equal(LIFE_1978.length, 3);
  const all = LIFE_1978.flatMap(textsOf);
  assert.equal(new Set(all).size, 30);
  const turns = LIFE_1978.flatMap(place => place.turns);
  assert.equal(new Set(turns).size, turns.length, 'в один квартал срока — одно место');
  // Первая сессия и кварталы выборов остаются без нового слоя.
  for (const turn of turns) assert.ok(turn >= 3 && turn <= TERM && turn !== 10 && turn !== 20, `квартал ${turn}`);
  for (const place of LIFE_1978) {
    assert.ok(place.low < place.high);
    const anchor = textsOf(place)[0].split(' ').slice(0, 2).join(' ');
    for (const text of textsOf(place)) {
      assert.match(text, /^(?:В|У|На|От|Кинотеатр)\s/, 'строка начинается с места');
      assert.ok(text.length <= 260, `коротко: ${text.length} — ${text}`);
      assert.doesNotMatch(text, /(?<![\p{L}])(?:вы|вас|вам|вами|ваш\p{L}*|президент\p{L}*)(?![\p{L}])/iu, `не о президенте: ${text}`);
      assert.ok(text.includes('столов') || text.includes('«Неман»') || text.includes('Заводской улице'), `место названо: ${anchor}`);
    }
  }
});

test('строка выбирается по уровню опоры и по тому, что место уже рассказало', () => {
  const canteen = LIFE_1978.find(place => place.id === 'canteen')!;
  const at = (turn: number, economy: number) => ({ turn, ended: false, resources: { economy, military: 44, internalLegitimacy: 50 } }) as unknown as GameState;
  const [q1, q2, q3, q4] = canteen.turns;

  const first = lifeBeat(at(q1, 33), EMPTY_PERSONAL, false);
  assert.equal(first.text, canteen.first.mid);
  assert.deepEqual(first.memory.used, [], 'личные строки и жизнь страны помнятся раздельно');

  const worse = lifeBeat(at(q2, 20), first.memory, false);
  assert.equal(worse.text, canteen.down.low);
  const same = lifeBeat(at(q3, 22), worse.memory, false);
  assert.equal(same.text, canteen.same.low);
  const silent = lifeBeat(at(q4, 21), same.memory, false);
  assert.equal(silent.text, null, 'третий квартал на том же уровне — нового факта нет');
  // Следующий срок: то же место помнит прошлое и отзывается на перемену.
  const better = lifeBeat(at(TERM + q1, 50), silent.memory, false);
  assert.equal(better.text, canteen.up.high);

  // Чужой квартал, квартал с фоном или выборами, конец правления — место молчит и ничего не запоминает.
  assert.deepEqual(lifeBeat(at(q1 + 1, 33), EMPTY_PERSONAL, false), { text: null, memory: EMPTY_PERSONAL });
  assert.deepEqual(lifeBeat(at(q1, 33), EMPTY_PERSONAL, true), { text: null, memory: EMPTY_PERSONAL });
  assert.deepEqual(lifeBeat({ ...at(q1, 33), ended: true } as GameState, EMPTY_PERSONAL, false), { text: null, memory: EMPTY_PERSONAL });

  // Вернувшись на прежний уровень прежним путём, место не повторяет уже сказанное.
  let memory: PersonalMemory = EMPTY_PERSONAL;
  const told: string[] = [];
  for (const [index, economy] of [33, 20, 33, 20, 33, 20, 33, 20].entries()) {
    const beat = lifeBeat(at(Math.floor(index / 4) * TERM + canteen.turns[index % 4], economy), memory, false);
    memory = beat.memory;
    if (beat.text) told.push(beat.text);
  }
  assert.deepEqual(told, [canteen.first.mid, canteen.down.low, canteen.up.mid]);
});

async function term(seed: number, diff: DifficultyId, pick: number) {
  const candidate = await newTerm(startFromSeed(seed, diff));
  let state = takeOffice(candidate, programOf(candidate).suggested);
  let memory: PersonalMemory = EMPTY_PERSONAL;
  const quarters: { before: GameState; after: GameState; texts: string[]; life: string[] }[] = [];
  const known = new Set(LIFE_1978.flatMap(textsOf));
  while (!state.ended && state.turn < TERM) {
    state = await nextCase(state);
    const before = state, step = firstStep(state);
    if (step.kind === 'press') state = await signPress(state, state.currentEvent!.press!.questions.map(() => 0));
    else if (step.kind === 'call-approach') state = await signCall(state, 'numbers', 'deal');
    else state = await signOption(state, step.options[Math.min(pick, step.options.length - 1)].key);
    const quarter = quarterLines(before, state, memory);
    memory = quarter.memory;
    const country = quarter.lines.filter(line => line.kind === 'country').map(line => line.text);
    quarters.push({ before, after: state, texts: country, life: country.filter(text => known.has(text)) });
  }
  return quarters;
}

test('в настоящих партиях: не больше строки за квартал, не в первой сессии, не рядом с фоном и выборами, без повторов', async () => {
  let lines = 0;
  for (const [seed, diff, pick] of [[7, 'debut', 0], [21, 'debut', 1], [7, 'coalition', 1], [3, 'crisis', 2]] as const) {
    const quarters = await term(seed, diff, pick);
    const told: string[] = [];
    for (const { before, after, texts, life } of quarters) {
      assert.ok(life.length <= 1, `${seed}/${diff}: ход ${before.turn}`);
      if (!life.length) continue;
      lines++;
      assert.ok(after.turn >= 3, 'первые два квартала — без нового слоя');
      assert.equal(texts.length, 1, 'в квартале с фоном страны место молчит');
      assert.equal(after.lastTurn?.election ?? null, null, 'в квартал выборов место молчит');
      const place = LIFE_1978.find(entry => textsOf(entry).includes(life[0]))!;
      assert.ok(place.turns.includes(((after.turn - 1) % TERM) + 1));
      // Строка говорит правду об опоре: её уровень к концу квартала — тот, что в тексте.
      const band = bandOf(place, after.resources[place.resource]);
      const fits = [place.first[band], place.same[band], band !== 'low' ? place.up[band] : '', band !== 'high' ? place.down[band] : ''];
      assert.ok(fits.includes(life[0]), `${seed}/${diff} ход ${before.turn}: ${place.id} при ${after.resources[place.resource]} — ${life[0]}`);
      told.push(life[0]);
    }
    assert.equal(new Set(told).size, told.length, `${seed}/${diff}: строки не повторяются`);
  }
  assert.ok(lines >= 12, `в четырёх партиях строк жизни: ${lines}`);
});

test('архив и «Дело дня» жизни 1978 года не получают', async () => {
  const candidate = await newTerm(startFromSeed(7, 'debut'));
  const office = takeOffice(candidate, programOf(candidate).suggested);
  const known = new Set(LIFE_1978.flatMap(textsOf));
  for (const state of [{ ...office, country: 'Казахстан' }, { ...office, daily: '2026-11-13' }] as GameState[]) {
    const before = { ...state, turn: 2 }, after = { ...state, turn: 3, lastTurn: office.lastTurn ?? ({ narrative: '', reactions: [], headline: '', choiceText: '' } as unknown as GameState['lastTurn']) };
    const quarter = after.lastTurn ? quarterLines(before, after, EMPTY_PERSONAL) : { lines: [], memory: EMPTY_PERSONAL };
    assert.ok(!quarter.lines.some(line => known.has(line.text)));
    assert.equal(quarter.memory.life, undefined);
  }
});
