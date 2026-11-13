import test from 'node:test';
import assert from 'node:assert/strict';
import { press1978, type Press1978Input } from './press-1978.ts';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom } from './engine.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { PRESS_1978_OUTLETS } from '../content/press-1978.ts';
import type { GameState } from './types.ts';

async function base(): Promise<GameState> {
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 7);
  return createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, seededRandom(7));
}

function input(before: GameState, patch: Partial<Press1978Input> = {}, shifts: Record<string, number> = {},
  money: { economy?: number; externalReputation?: number } = {}): Press1978Input {
  return {
    before, headline: 'Мазут пришёл с запада', success: true, act: null, election: null, finale: false,
    own: { resources: money, factionRel: shifts }, ...patch,
  };
}

test('#310, E04: строка — факт хода и позиция задетого лагеря, издание по интересу', async () => {
  const before = await base();
  const [line] = press1978(input(before, {}, { west: 8, russia: -8 }));
  assert.equal(line.outlet, PRESS_1978_OUTLETS.moscow, 'при равенстве пишет издание проигравшего');
  assert.equal(line.headline, 'Мазут пришёл с запада. Российская делегация напоминает о договоре 1956 года.');
  const [business] = press1978(input(before, { headline: 'Бухгалтера охраняют' }, { gossektor: -6, siloviki: 6 }));
  assert.equal(business.outlet, PRESS_1978_OUTLETS.business);
  assert.match(business.headline, /Промышленная палата называет это давлением на заводы\.$/);
  const [plural] = press1978(input(before, {}, { regions: -4 }));
  assert.match(plural.headline, /Областные советы говорят, что районы обошли\.$/);
});

test('порядок правил: срыв, выборы, бюджет, пресс-конференция, деньги, репутация, иначе тишина', async () => {
  const before = await base();
  const failed = press1978(input(before, { success: false }, { west: 10 }))[0];
  assert.match(failed.headline, /кто отвечал за исполнение/);
  // Второй и третий срыв партии газета описывает другими словами (#447).
  const entry = { year: 1978, title: 'Дело', choice: 'Вариант', headline: '', historianNote: '', success: false };
  const second = press1978(input({ ...before, history: [entry] }, { success: false }))[0];
  const third = press1978(input({ ...before, history: [entry, entry] }, { success: false }))[0];
  assert.equal(new Set([failed.headline, second.headline, third.headline]).size, 3);
  assert.doesNotMatch(second.headline, /кто отвечал за исполнение/);
  const election = press1978(input(before, { headline: 'Партия власти удержала парламент: 46%', election:
    { turn: 9, kind: 'parliament', leader: 46, top: { id: 'opposition', name: 'Гражданское движение', share: 21 }, outcome: 'won' } }))[0];
  assert.equal(election.headline, 'Партия власти удержала парламент: 46%. Второе место — «Гражданское движение», 21%.');
  const budget = press1978(input(before, { act: 'budget' }, { gossektor: 3, church: 3, regions: -4 }))[0];
  assert.equal(budget.headline, 'Бюджет года утверждён. Больше получили Промышленная палата и Совет приходов, меньше — Областные советы.');
  const press = press1978(input({ ...before, currentEvent: { ...before.currentEvent!, press: { outlet: '', questions: [
    { id: 'a', who: '', topic: 'вашей подписи', text: '', answers: [] }, { id: 'b', who: '', topic: 'уехавших', text: '', answers: [] },
  ] } } } as GameState, { act: 'press' }))[0];
  assert.equal(press.headline, 'Президент ответил на вопросы о своей подписи и об уехавших.', 'газета пишет в третьем лице');
  const money = press1978(input(before, {}, {}, { economy: -9 }))[0];
  assert.equal(money.outlet, PRESS_1978_OUTLETS.business);
  assert.match(money.headline, /Казне это стоит 9 пунктов запаса\.$/);
  const reputation = press1978(input(before, {}, {}, { externalReputation: 4 }))[0];
  assert.equal(reputation.outlet, PRESS_1978_OUTLETS.trade);
  assert.deepEqual(press1978(input(before, {}, { west: 3 })), [], 'мелкий сдвиг — не новость');
  assert.deepEqual(press1978(input(before, { finale: true }, { west: 10 })), [], 'у развязки срока свой текст');
});

test('в партии 1978 года — не больше одной строки за ход, без оценок-формул и анахронизмов; архив прежний', async () => {
  const { resolveTurn, startEvent } = await import('./engine.ts');
  const outlets = new Set<string>(Object.values(PRESS_1978_OUTLETS));
  for (const country of [ALTERNATE_COUNTRY, 'Беларусь']) {
    let state = createInitialState(country, 'coalition', 'pragmatist', await classicApi.setup(country, 'coalition', 'pragmatist', 3), seededRandom(3));
    for (let turn = 0; turn < 12 && !state.ended; turn++) {
      state = startEvent(state, await classicApi.event(state));
      const id = state.currentEvent!.choices[0].id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
      const press = state.lastTurn?.press ?? [];
      if (country === ALTERNATE_COUNTRY) {
        assert.ok(press.length <= 1, 'одна строка за квартал');
        for (const line of press) {
          assert.ok(outlets.has(line.outlet), line.outlet);
          assert.doesNotMatch(line.headline, /биржа|Брюссель|демократ|торгов|Власть впервые|в архив|(?<![\p{L}])ваш/u, line.headline);
        }
      } else {
        for (const line of press) assert.ok(!outlets.has(line.outlet) || line.outlet === PRESS_1978_OUTLETS.civil
          || line.outlet === PRESS_1978_OUTLETS.business, 'архив пишет прежними изданиями');
      }
    }
  }
});

test('ревью #343: старые долги и фон квартала газета не приписывает сегодняшнему решению', async () => {
  const before = await base();
  // Решение экономику не трогает; квартал всё равно мог стоить казне из-за прежних последствий — строки о деньгах нет.
  assert.deepEqual(press1978(input(before, { headline: 'Патрули переведены в самые неспокойные районы' }, {}, { economy: 0 })), []);
  // На реальных ходах цифра в «Деловом курьере» равна вкладу самой резолюции из ведомости движка.
  // Перебираем зёрна, пока не встретятся настоящие денежные строки: проверка не может пройти вхолостую.
  const { resolveTurn, startEvent } = await import('./engine.ts');
  let checked = 0;
  for (let seed = 1; seed <= 15 && checked < 3; seed++) {
    let state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist',
      await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', seed), seededRandom(seed));
    for (let turn = 0; turn < 30 && !state.ended; turn++) {
      state = startEvent(state, await classicApi.event(state));
      // Каждый вариант дела пробуем на копии состояния; партию продвигаем первым вариантом.
      for (const choice of state.currentEvent!.choices) {
        const tried = resolveTurn(state, choice.id, await classicApi.consequence(state, choice.id));
        const line = (tried.lastTurn?.press ?? []).find(entry => entry.outlet === PRESS_1978_OUTLETS.business);
        const match = line?.headline.match(/(Казне это стоит|Казна получает) (\d+)/);
        if (!match) continue;
        const own = (tried.lastTurn?.sources?.economy ?? []).filter(([label]) => label === 'решение').reduce((sum, [, value]) => sum + value, 0);
        assert.equal(Number(match[2]) * (match[1] === 'Казна получает' ? 1 : -1), own, line!.headline);
        checked++;
      }
      const id = state.currentEvent!.choices[0].id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
    }
  }
  assert.ok(checked > 0, 'денежная строка встретилась и сверена с ведомостью');
});
