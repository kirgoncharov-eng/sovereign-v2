import test from 'node:test';
import assert from 'node:assert/strict';
import { chancery, energyProgress, governmentProposals, healthFirstLetter, programReport, reserveShortage, splitChancery } from './quarter-letters.ts';
import { classicApi } from '../game/classic.ts';
import { createInitialState, resolveTurn, seededRandom, startEvent } from '../game/engine.ts';
import { ALTERNATE_COUNTRY } from '../game/alternate-world.ts';
import { openDeskWhenDue } from '../game/desk-timing.ts';
import { interveneWorld, livingActions } from '../game/living-world.ts';
import { presidentialMessages } from '../client/presidential-inbox.ts';
import type { GameState } from '../game/types.ts';

test('строка канцелярии: пункты со строчной, компетенция без имени в именительном падеже', () => {
  assert.equal(chancery(['восстановлено 30% сети', 'Компетенция Роман Яровой: 2/3', 'Адаптация оборудования задерживает подключение', null]),
    ' Канцелярия: восстановлено 30% сети · компетенция руководителя 2/3 · адаптация оборудования задерживает подключение.');
  assert.equal(chancery([]), '');
});

test('человек говорит своими словами, подпись — после кавычек, без точки внутри', () => {
  const report = energyProgress('Роман Яровой', 30, 'Бригады работают на заводских линиях.', []);
  assert.match(report, /^«Бригады работают на заводских линиях» — Роман Яровой\. Канцелярия: восстановлено 30% сети\.$/);
  assert.match(programReport('Вера Рудницкая', 22, ['Координатор Вера Рудницкая: качество работы 2/3',
    'Регионы затягивают выделение участков'], 'running'), /^«Работа идёт, но мешает вот что: регионы затягивают выделение участков» — Вера Рудницкая\./);
  assert.match(governmentProposals('Вера Рудницкая', 4), /четыре ещё не начаты/);
});

test('в папке строка канцелярии отделяется от речи человека', () => {
  assert.deepEqual(splitChancery('«Работа идёт по плану» — Вера Рудницкая. Канцелярия: выполнено 22%.'),
    { voice: '«Работа идёт по плану» — Вера Рудницкая.', chancery: 'Канцелярия: выполнено 22%.' });
  assert.deepEqual(splitChancery('Директор энергосети просит заменить узлы.'), { voice: 'Директор энергосети просит заменить узлы.', chancery: null });
});

test('письмо о больницах называет занятость губернатора только при его назначении на энергосеть (#310, C04)', () => {
  const busy = healthFirstLetter('Нина Жук', 'Павел Острин', true), free = healthFirstLetter('Нина Жук', 'Павел Острин', false);
  assert.match(busy, /губернатор уже ведёт энергосеть/);
  assert.doesNotMatch(free, /энергосет/);
  assert.match(free, /Местная власть может помочь с назначениями\. Можно временно перевести врачей/);
});

test('закрытое поручение называет ресурс и порог', () => {
  assert.equal(reserveShortage('economy', 1), 'Не хватает экономики: после подписи останется 1, а запас ниже 5 не тратится');
});

async function lettersOf(country: string, seed: number): Promise<string[]> {
  let state: GameState = createInitialState(country, 'coalition', 'pragmatist',
    await classicApi.setup(country, 'coalition', 'pragmatist', seed), seededRandom(seed));
  const texts: string[] = [];
  for (let turn = 0; turn < 20 && !state.ended; turn++) {
    state = openDeskWhenDue(state);
    state = startEvent(state, await classicApi.event(state));
    texts.push(...presidentialMessages(state).map(message => message.text));
    // Назначения исполнителей — чтобы в папке были доклады исполнения, а не только напоминания.
    const order = livingActions(state).find(action => !action.blocked && /^(appoint|health:appoint):/.test(action.id));
    if (order) state = interveneWorld(state, order.id);
    const choice = state.currentEvent!.choices[turn % state.currentEvent!.choices.length];
    state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
  }
  return texts;
}

test('письма папки 1978 года — без правил игры и ссылок на прежние панели; архив пишет по-прежнему', async () => {
  const letters = (await Promise.all([2, 3, 7].map(seed => lettersOf(ALTERNATE_COUNTRY, seed)))).flat();
  assert.ok(letters.length > 20, `писем: ${letters.length}`);
  for (const text of letters) {
    assert.doesNotMatch(text, /читать (письмо )?бесплатно|чтение свободно|Правительство →|после следующего решения в кабинете/, text);
    assert.doesNotMatch(text, /Предложения не требуют|ещё не запущено|\.» —/, text);
  }
  assert.ok(letters.some(text => text.includes('Канцелярия:')));
  const archive = await lettersOf('Беларусь', 2);
  assert.ok(archive.some(text => text.startsWith('Директор энергосети просит заменить изношенные узлы')));
});
