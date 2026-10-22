import test from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { choiceEffects, createInitialState, resolveTurn, seededRandom, startEvent } from './engine.ts';
import { ALTERNATE_ARC } from '../content/alternate-history.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';

// #227: интрига «Четвёртый экземпляр» продолжает первое решение партии — повторная партия отличается со 2-го хода.
const OPENING: Record<string, string> = {
  'Оплатить зарплату в обмен на проверку договоров': 'Опись из заводской бухгалтерии',
  'Получить аванс под трёхлетний российский заказ': 'Приложение к российскому заказу',
  'Перестроить производство и защитить увольняемых': 'Три копии одного договора',
};

async function afterFirstCase(text: string, seed = 7): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', seed);
  let state = createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', intro, seededRandom(seed));
  state = startEvent(state, await classicApi.event(state));
  const choice = state.currentEvent!.choices.find(entry => entry.text === text)!;
  assert.ok(choice, text);
  return resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
}

test('эпизод 2-го хода продолжает решение по зарплате', async () => {
  for (const [first, title] of Object.entries(OPENING)) {
    const state = await afterFirstCase(first);
    const event = await classicApi.event(state);
    assert.equal(event.beat?.arcId, 'alt_contracts', first);
    // Если аванс уже пришёл, покупатель закрывает дело выданного аванса, а не ждёт бумаг для нового платежа.
    const paid = state.history[0].success && first.startsWith('Получить аванс');
    assert.equal(event.title, paid ? 'Дело выданного аванса' : title, first);
  }
});

test('после аванса эпизод 2-го хода помнит, пришли ли деньги', async () => {
  const state = await afterFirstCase('Получить аванс под трёхлетний российский заказ');
  const withOutcome = (success: boolean) => ({ ...state, history: state.history.map(entry => ({ ...entry, success })) });
  assert.equal((await classicApi.event(withOutcome(true))).title, 'Дело выданного аванса');
  assert.equal((await classicApi.event(withOutcome(false))).title, 'Приложение к российскому заказу');
  // Выданный аванс не приходит второй раз: ни описание, ни исходы не обещают новых денег.
  const paid = ALTERNATE_ARC.beats[0].variants.find(variant => variant.title === 'Дело выданного аванса')!;
  const texts = [paid.description, ...paid.choices.flatMap(choice => [choice.hint, choice.ok, choice.fail ?? ''])];
  for (const text of texts) assert.doesNotMatch(text, /придут|пришёл|перечисл|в пятницу/, text);
});

test('старое сохранение без подходящего решения получает прежний эпизод', async () => {
  const state = await afterFirstCase('Оплатить зарплату в обмен на проверку договоров');
  const legacy = { ...state, history: state.history.map(entry => ({ ...entry, choice: 'Решение из прежней версии' })) };
  const loaded = parseSave(JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: legacy }))!.state;
  assert.equal((await classicApi.event(loaded)).title, 'Три копии одного договора');
});

test('варианты через Службу порядка радуют её, но не дают армии силы и ведут к тем же следующим эпизодам', async () => {
  const state = await afterFirstCase('Получить аванс под трёхлетний российский заказ');
  const opening = ALTERNATE_ARC.beats[0];
  const flags = new Set(opening.variants.at(-1)!.choices.map(choice => choice.flag));
  for (const variant of opening.variants) {
    // Следующие эпизоды ждут прежних флагов: новые варианты их не придумывают.
    for (const choice of variant.choices) assert.ok(flags.has(choice.flag), `${variant.title}: ${choice.text}`);
  }
  const police = ALTERNATE_ARC.beats.flatMap(beat => beat.variants.flatMap(variant => variant.choices))
    .filter(choice => /Служб[аеуы] порядка/.test(choice.text));
  assert.ok(police.length >= 3);
  for (const choice of police) {
    assert.equal(choice.policyEffect?.military, undefined, choice.text);
    const effects = choiceEffects(state, { ...choice, id: 'a', resolvesCrisis: null, stance: choice.camps } as never);
    assert.equal(effects.resources.military ?? 0, 0, choice.text);
    const security = state.factions.find(group => group.bloc === 'security')!;
    assert.ok((effects.factionRel[security.id] ?? 0) > 0, choice.text);
  }
});

test('аванс под российский заказ больше не выигрывает у других вариантов по всем статьям', async () => {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', 7);
  let state = createInitialState(ALTERNATE_COUNTRY, 'coalition', 'pragmatist', intro, seededRandom(7));
  state = startEvent(state, await classicApi.event(state));
  const [paid, advance, rebuilt] = state.currentEvent!.choices;
  const total = (choice: typeof paid) => {
    const now = choiceEffects(state, choice).resources.economy ?? 0;
    return now + (choice.deal?.later?.res.economy ?? 0);
  };
  // Перестройка окупается первой партией новой линии; аванс за год обходится казне дороже, чем даёт сейчас.
  assert.ok(total(advance) < 0, 'аванс в итоге стоит казне денег');
  assert.ok(total(rebuilt) > total(advance), 'перестройка дешевле аванса на горизонте года');
  assert.ok((choiceEffects(state, paid).resources.internalLegitimacy ?? 0) > (choiceEffects(state, advance).resources.internalLegitimacy ?? 0));
});

test('у вариантов 2-го хода с ценой личного ресурса и политкапитала есть причина каждого минуса', () => {
  const texts = [
    'Дать директору неделю на объяснение',
    'Попросить директора принести свою копию',
    'Отправить делегации копию без закрытой страницы',
    'Закрыть дело аванса без закрытой страницы',
  ];
  const choices = ALTERNATE_ARC.beats[0].variants.flatMap(variant => variant.choices);
  for (const text of texts) {
    const choice = choices.find(entry => entry.text === text)!;
    assert.ok(choice, text);
    for (const [resource, delta] of Object.entries(choice.policyEffect ?? {})) {
      if (delta < 0) assert.ok(choice.costReasons?.[resource as keyof typeof choice.costReasons], `${text}: ${resource}`);
    }
  }
});

test('дело о топливе 5-го хода продолжает каждое из трёх первых решений', async () => {
  const fuel: Record<string, string> = {
    'Оплатить зарплату в обмен на проверку договоров': 'alt_fuel_audit',
    'Получить аванс под трёхлетний российский заказ': 'alt_fuel_advance',
    'Перестроить производство и защитить увольняемых': 'alt_fuel_west',
  };
  for (const [first, cardId] of Object.entries(fuel)) {
    let state = await afterFirstCase(first, 3);
    while (state.turn < 4) {
      state = startEvent(state, await classicApi.event(state));
      const choice = state.currentEvent!.choices[0];
      state = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
    }
    const event = await classicApi.event(state);
    assert.equal(event.cardId, cardId, first);
    // Вариант через Службу порядка есть в обеих новых версиях и не даёт армии силы.
    const police = event.choices.find(choice => /Служб[аеуы] порядка/.test(choice.text));
    if (cardId !== 'alt_fuel_west') {
      assert.ok(police, cardId);
      assert.equal(choiceEffects(state, police).resources.military ?? 0, 0, cardId);
    }
  }
});

test('директор концерна узнаётся по имени с первого хода, и ни одна сцена ходов 1–5 не теряет его имя', async () => {
  for (const diff of ['coalition', 'debut', 'crisis'] as const) for (const seed of [2, 3, 4]) {
    const intro = await classicApi.setup(ALTERNATE_COUNTRY, diff, 'pragmatist', seed);
    let state = createInitialState(ALTERNATE_COUNTRY, diff, 'pragmatist', intro, seededRandom(seed));
    const director = state.arc!.target;
    state = startEvent(state, await classicApi.event(state));
    assert.match(state.currentEvent!.description, new RegExp(`${director}, директор концерна`), `${diff}/${seed}`);
    for (let turn = 0; turn < 5; turn++) {
      if (turn) state = startEvent(state, await classicApi.event(state));
      const choice = state.currentEvent!.choices[turn % state.currentEvent!.choices.length];
      const narration = await classicApi.consequence(state, choice.id);
      for (const text of [state.currentEvent!.description, narration.narrative]) {
        assert.doesNotMatch(text, /неизвестный|\{target\}/, `${diff}/${seed}, ход ${turn + 1}`);
      }
      state = resolveTurn(state, choice.id, narration);
    }
  }
});
