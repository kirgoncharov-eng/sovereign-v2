import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, callChoice, callEvent } from './classic.ts';
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { journalistCall, journalistContext, journalistReply } from './journalist-call.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';

const radio = ALTERNATE_EVENTS.find(card => card.id === 'alt_radio')!;
const save = (state: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state });
async function fixture(controlled = false, seed = 1): Promise<GameState> {
  const state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
    await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed), seededRandom(seed));
  return { ...state, turn: 10, arc: null,
    resources: { ...state.resources, economy: 60, politicalCapital: 60, personalResource: 60 },
    history: [{ year: 1979, title: radio.title, choice: radio.choices[controlled ? 2 : 1].text,
      success: true, headline: '', historianNote: '' }],
  };
}
async function answer(state: GameState, id: string) {
  const current = startEvent(state, callEvent(state)!);
  const before = JSON.stringify(current);
  const plan = planTurn(current, id);
  const result = resolveTurn(current, id, await classicApi.consequence(current, id));
  assert.equal(JSON.stringify(current), before, 'решение не мутирует исходное состояние');
  assert.deepEqual(result.resources, plan.resources);
  assert.equal(result.lastTurn!.success, true, 'цена поручения не зависит от скрытого броска');
  const loaded = parseSave(save(result));
  assert.ok(loaded, 'поручение переживает сохранение');
  assert.deepEqual(loaded.state.pending, result.pending);
  return loaded.state;
}
async function report(state: GameState) {
  const next = startEvent(state, await classicApi.event(state));
  const result = resolveTurn(next, next.currentEvent!.choices[0].id,
    await classicApi.consequence(next, next.currentEvent!.choices[0].id));
  assert.equal(result.pending.filter(entry => entry.event === 'Корреспондент не вернулся в редакцию').length, 0);
  assert.ok(parseSave(save(result)));
  return result;
}

test('первый звонок встречается естественно; другой срок, Daily, архив и уже звонящий человек сохраняют прежние правила', async () => {
  for (const seed of [1, 7, 21, 42]) {
    const state = await fixture(false, seed);
    const event = await classicApi.event(state);
    assert.equal(event.call?.negotiation, 'journalist');
    assert.equal(event.call?.figure, 'journalist');
    assert.equal(event.choices.length, 4);
    assert.ok(parseSave(save(startEvent(state, event))));
    assert.equal(journalistCall({ ...state, daily: '2026-10-15' }, 11, new Set()), null);
    assert.equal(journalistCall({ ...state, country: 'Беларусь' }, 11, new Set()), null);
    assert.equal(journalistCall(state, 17, new Set()), null);
    assert.equal(journalistCall(state, 11, new Set(['journalist'])), null);
    assert.equal(journalistCall({ ...state, turn: 0 }, 11, new Set()), null);
    assert.equal(journalistCall({ ...state, keyFigures: [] }, 11, new Set()), null);
    assert.throws(() => callChoice(startEvent(state, event), 'offer', 'deal'), /конкретное/);
  }
});

test('публичная проверка исполняет предметное обещание; освобождение и отказ дают разные судьбы и цены', async () => {
  const state = await fixture();
  for (const id of ['a', 'b', 'c', 'd']) {
    const signed = await answer(state, id);
    const pending = signed.pending.find(entry => entry.event === 'Корреспондент не вернулся в редакцию')!;
    assert.equal(pending.due, 12);
    const result = await report(signed);
    assert.ok(result.lastTurn!.matured.some(entry => entry.id === pending.id));
    assert.ok(result.lastTurn!.narrative.includes(pending.story!), `доклад ${id} виден в газете`);
    assert.ok(!result.lastTurn!.narrative.includes('не взял трубку'));
  }
  const release = await answer(state, 'a');
  const refuse = await answer(state, 'd');
  assert.ok(release.resources.politicalCapital < refuse.resources.politicalCapital);
  assert.ok(release.pending[0].story!.includes('в ту же ночь'));
  assert.ok(refuse.pending[0].story!.includes('через три недели'));
  const review = await report(await answer(state, 'b'));
  assert.ok(review.lastTurn!.narrative.includes('Представитель редакции подписал протокол'));
});

test('прошлое согласование эфира меняет условия переговоров и исполнение обещания, а не характер как пароль', async () => {
  const open = await fixture(false), closed = await fixture(true);
  assert.equal(journalistContext(open).controlled, false);
  assert.equal(journalistContext(closed).controlled, true);
  const failedOrder = { ...closed, history: [{ ...closed.history[0], success: false }] };
  assert.equal(journalistContext(failedOrder).controlled, false, 'неисполненная цензура не действует');
  const openCall = callEvent(open)!, closedCall = callEvent(closed)!;
  assert.equal(closedCall.choices[1].deal!.res!.politicalCapital, -4);
  assert.equal(openCall.choices[1].deal!.res!.politicalCapital, -2);
  assert.ok(journalistReply(closed, 'b').includes('Разрешите эфир о результатах проверки'));
  const broken = await report(await answer(closed, 'c'));
  const kept = await report(await answer(open, 'c'));
  assert.ok(broken.lastTurn!.matured.some(entry => entry.label.includes('не выполнено')));
  assert.ok(broken.lastTurn!.narrative.includes('ответ по существу вы не дали'));
  assert.ok(kept.lastTurn!.narrative.includes('как обещали'));
  assert.ok((await report(await answer(closed, 'b'))).lastTurn!.narrative.includes('копию получила семья'));
});


test('доклад не теряется за двумя другими созревшими последствиями; поддельный тип звонка не загружается', async () => {
  const state = await fixture();
  const signed = await answer(state, 'b');
  const crowded = { ...signed, pending: [
    { id: 'other1', label: 'Другое дело', source: 'Раньше', due: 12, res: {}, story: 'Иное эхо.' },
    { id: 'other2', label: 'Ещё дело', source: 'Раньше', due: 12, res: {}, story: 'Второе эхо.' },
    ...signed.pending,
  ] };
  const result = await report(crowded);
  assert.ok(result.lastTurn!.narrative.includes('Представитель редакции подписал протокол'));
  const current = startEvent(state, callEvent(state)!);
  const raw = JSON.parse(save(current));
  delete raw.state.currentEvent.call.context;
  assert.equal(parseSave(JSON.stringify(raw)), null);
  raw.state.currentEvent.call.negotiation = 'unknown';
  assert.equal(parseSave(JSON.stringify(raw)), null);
});


test('газета сообщает о решении по корреспонденту, а не повторяет кнопку поручения', async () => {
  for (const controlled of [false, true]) {
    const state = await fixture(controlled);
    const event = callEvent(state)!;
    for (const choice of event.choices) {
      assert.notEqual(choice.headline, choice.text);
      assert.match(choice.headline!, /корреспондента/);
      const result = await answer(state, choice.id);
      assert.equal(result.lastTurn!.headline, choice.headline);
    }
  }
});
