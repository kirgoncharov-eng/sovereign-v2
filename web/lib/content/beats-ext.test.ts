import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_EXT, BEAT_MEMORY, beatExtension } from './beats-ext.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';

const FINALE = 'Четвёртый экземпляр';

async function atFinale(flags: string[], seed = 21) {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed);
  const base = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, seededRandom(seed));
  return { ...base, turn: 15, arc: { ...base.arc!, flags: ['ok:case', ...flags], done: [1, 3, 7, 12] } };
}

test('финал интриги: директор, пришедший без приглашения, говорит сам — и рычаг объясняет обе кнопки (#310, E07)', async () => {
  const state = await atFinale([]);
  const event = await classicApi.event(state);
  assert.equal(event.title, FINALE);
  const target = state.arc.target;
  assert.ok(event.description.includes(`${target} входит, не дождавшись`), event.description);
  assert.match(event.description, /кто подпишет ведомость\?/);
  assert.match(event.description, /Если кресло останется за мной/);
  assert.doesNotMatch(event.description, /\{[a-z]+\}|Из приёмной сообщают/);
  assert.deepEqual(event.choices.slice(0, 2).map(choice => choice.text),
    ['Отделить государственный долг и убрать директора', 'Заключить соглашение о возврате средств']);
});

test('финал помнит прошлые удачи интриги только по флагам ok:, без провалов и чужих эпизодов', async () => {
  const plain = beatExtension(FINALE, [])!;
  assert.equal(plain, BEAT_EXT[FINALE]);
  for (const line of BEAT_MEMORY[FINALE]) {
    const remembered = beatExtension(FINALE, [line.flag])!;
    const [lead] = remembered.split('\n\n');
    assert.ok(lead.endsWith(line.text), `память в первом абзаце: ${line.flag}`);
    const intentOnly = line.flag.replace(/^ok:/, '');
    assert.equal(beatExtension(FINALE, [intentOnly]), plain, `провал ${intentOnly} не вспоминается как удача`);
  }
  const both = beatExtension(FINALE, ['ok:witness', 'ok:trace'])!;
  assert.ok(both.indexOf('главный бухгалтер') < both.indexOf('журнал выдачи'), 'порядок строк — порядок эпизодов');
  assert.equal(beatExtension('Последний расчёт', ['ok:witness']), BEAT_EXT['Последний расчёт']);
  assert.equal(beatExtension('Нет такого эпизода', ['ok:witness']), undefined);

  const state = await atFinale(['witness', 'ok:witness', 'protect', 'ok:protect']);
  const event = await classicApi.event(state);
  assert.match(event.description, /Список переводов, который передал главный бухгалтер/);
  assert.match(event.description, /Имени архивиста директор так и не узнал/);
});
