import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_PRESETS, callEndingStep, firstStep, memoir, newTerm, nextCase, openingLines, pressStep, quarterLines,
  signCall, signOption, signPress, startFromSeed, termOver, type ChronicleLine,
} from './chronicle.ts';
import { EMPTY_PERSONAL, PERSONAL_BEATS, type PersonalMemory } from './chronicle-personal.ts';
import { contemporaries, TEMPERS } from './chronicle-rivals.ts';
import type { GameState } from '../game/types.ts';
import { presidentialMessages } from './presidential-inbox.ts';
import { rollSuccess } from '../game/engine.ts';
import { LEGACY_COUNTRIES } from '../game/alternate-world.ts';

const day = (line: ChronicleLine) => Date.UTC(line.date.year, line.date.month, line.date.day);

async function factorySignature(route: number, success: boolean) {
  for (let seed = 1; seed <= 100; seed++) {
    const before = await nextCase(await newTerm(startFromSeed(seed)));
    if (rollSuccess(before, before.currentEvent!.choices[route]) === success) {
      return { before, after: await signOption(before, before.currentEvent!.choices[route].id) };
    }
  }
  throw new Error('Не найден заводской исход');
}

test('срочная выплата или аванс получают первый результат в день подписи, переоборудование — позднее (#401)', async () => {
  for (const route of [0, 1, 2]) for (const success of [true, false]) {
    const { before, after } = await factorySignature(route, success);
    const snapshot = structuredClone({ before, after });
    const lines = quarterLines(before, after, EMPTY_PERSONAL).lines;
    const result = lines.find(line => line.kind === 'scene')!;
    assert.ok(result);
    if (route < 2) assert.equal(day(result), day(lines[0]), `route ${route}, success ${success}`);
    else assert.ok(day(result) > day(lines[0]), 'переход производства не совершается в день подписи');
    if (route < 2) assert.ok(lines.indexOf(result) < lines.findIndex(line => line.kind === 'personal'), 'дневной результат — перед первой ночью');
    assert.ok(lines.every((line, i) => i === 0 || day(line) >= day(lines[i - 1])));
    assert.deepEqual({ before, after }, snapshot, 'сроки представления не меняют состояние или исход');
  }
});

test('банковский ответ не ждёт середины квартала, поздний аванс приходит в обещанную пятницу (#401)', async () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 250 && seen.size < 6; seed++) {
    const first = await nextCase(await newTerm(startFromSeed(seed)));
    if (rollSuccess(first, first.currentEvent!.choices[1])) continue;
    const before = await nextCase(await signOption(first, first.currentEvent!.choices[1].id));
    if (before.currentEvent?.title !== 'Приложение к российскому заказу') continue;
    for (const route of [0, 1, 2]) {
      const choice = before.currentEvent.choices[route];
      const success = rollSuccess(before, choice), key = `${route}-${success}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const after = await signOption(before, choice.id);
      const lines = quarterLines(before, after, EMPTY_PERSONAL).lines;
      const result = lines.find(line => line.kind === 'scene')!;
      const delay = (day(result) - day(lines[0])) / 86_400_000;
      if (route === 2 && success) {
        assert.equal(new Date(day(result)).getUTCDay(), 5, 'пятница в тексте совпадает с датой');
        assert.ok(delay >= 0 && delay < 7);
      } else assert.equal(delay, route === 1 && !success ? 1 : 0);
      if (route === 0 && success) {
        assert.doesNotMatch(result.text, /подождать неделю/);
        assert.match(result.text, /аванс.*на проверке/i);
      }
      assert.ok(lines.every((line, i) => i === 0 || day(line) >= day(lines[i - 1])));
    }
  }
  assert.equal(seen.size, 6, 'три варианта проверены при исполнении и срыве');
});

test('после сцены газета добавляет своё отношение, а не повторяет тот же заголовок (#401)', async () => {
  const { before, after: original } = await factorySignature(1, false);
  const headline = original.lastTurn!.headline;
  const after = { ...original, lastTurn: { ...original.lastTurn!, press: [
    { outlet: 'Свободное слово', headline: `${headline}. Редакция спрашивает, кто отвечал за исполнение.` },
    { outlet: 'Вести порта', headline: 'В порту объявлено собрание грузчиков.' },
    { outlet: 'Телеграф', headline },
  ] } };
  const snapshot = structuredClone(after);
  const { lines } = quarterLines(before, after, EMPTY_PERSONAL);
  assert.equal(lines.filter(line => line.kind === 'paper').length, 0);
  assert.deepEqual(lines.filter(line => line.kind === 'press').map(line => line.text), [
    'Редакция спрашивает, кто отвечал за исполнение.', 'В порту объявлено собрание грузчиков.',
  ]);
  assert.deepEqual(after, snapshot, 'исходная пресса остаётся в отчёте');

  const noScene = { ...after, lastTurn: { ...after.lastTurn, narrative: '' } };
  const fallback = quarterLines(before, noScene, EMPTY_PERSONAL).lines;
  assert.ok(fallback.some(line => line.kind === 'paper' && line.text === headline), 'без сцены заголовок сохраняется');
});

test('соседние заводские версии сохраняют названные в тексте неделю, два дня и следующее утро (#401)', async () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 100 && seen.size < 4; seed++) for (const firstRoute of [0, 2]) {
    const first = await nextCase(await newTerm(startFromSeed(seed)));
    const before = await nextCase(await signOption(first, first.currentEvent!.choices[firstRoute].id));
    const inventory = before.currentEvent?.title === 'Опись из заводской бухгалтерии';
    for (const route of inventory ? [1, 2] : [0]) {
      const choice = before.currentEvent!.choices[route], success = rollSuccess(before, choice);
      if ((inventory && route === 1 || !inventory) && success) continue;
      const key = `${inventory}-${route}-${success}`;
      if (seen.has(key)) continue;
      const lines = quarterLines(before, await signOption(before, choice.id), EMPTY_PERSONAL).lines;
      const delay = (day(lines.find(line => line.kind === 'scene')!) - day(lines[0])) / 86_400_000;
      assert.equal(delay, inventory ? route === 2 ? 7 : 2 : 1);
      seen.add(key);
    }
  }
  assert.equal(seen.size, 4);
});

test('сокращение ленты и срочные даты не меняют представление архива и Daily (#401)', async () => {
  const { before, after } = await factorySignature(1, false);
  for (const overrides of [...LEGACY_COUNTRIES.map(country => ({ country })), { daily: '2026-11-08' }]) {
    const lines = quarterLines({ ...before, ...overrides }, { ...after, ...overrides }, EMPTY_PERSONAL).lines;
    assert.ok(day(lines.find(line => line.kind === 'scene')!) > day(lines[0]));
    assert.ok(lines.some(line => line.kind === 'paper' && line.text === after.lastTurn!.headline));
    assert.deepEqual(lines.filter(line => line.kind === 'press').map(line => line.text), after.lastTurn!.press!.map(item => item.headline));
  }
});

test('после срочной подписи вечер и первая ночь остаются в этот день, «наутро» — в следующий (#401)', async () => {
  const { before, after: original } = await factorySignature(1, false);
  for (const prefix of ['В тот же вечер', 'Наутро']) {
    const after = { ...original, lastTurn: { ...original.lastTurn!, narrative: `Аванс задержан.\n\n${prefix} губернатор созывает совещание.` } };
    const lines = quarterLines(before, after, EMPTY_PERSONAL).lines;
    const night = lines.find(line => line.kind === 'personal')!;
    const reaction = lines.find(line => line.text.startsWith(prefix))!;
    assert.equal(day(night), day(lines[0]));
    assert.equal(day(reaction) - day(lines[0]), prefix === 'Наутро' ? 86_400_000 : 0);
    assert.equal(lines.indexOf(reaction) > lines.indexOf(night), prefix === 'Наутро');
  }
});

/** Срок целиком: всегда первый вариант, на пресс-конференции — первые ответы, звонок — цифрами и сделкой. */
async function liveTerm(seed: number, diff: 'debut' | 'coalition' = 'debut') {
  let state = await newTerm(startFromSeed(seed, diff));
  let memory: PersonalMemory = EMPTY_PERSONAL;
  const quarters: { before: GameState; after: GameState; lines: ChronicleLine[] }[] = [];
  while (!termOver(state)) {
    state = await nextCase(state);
    const before = state, step = firstStep(state);
    if (step.kind === 'press') state = await signPress(state, state.currentEvent!.press!.questions.map(() => 0));
    else if (step.kind === 'call-approach') state = await signCall(state, 'numbers', 'deal');
    else state = await signOption(state, step.options[0].key);
    const quarter = quarterLines(before, state, memory);
    memory = quarter.memory;
    quarters.push({ before, after: state, lines: quarter.lines });
  }
  return { state, quarters, memory };
}

test('доклады энергосети и больниц не повторяются откликом в настоящих кварталах (#313, C01)', async () => {
  const seen = new Set<string>();
  for (const seed of [1, 5, 7, 21]) {
    const { quarters } = await liveTerm(seed);
    for (const { lines } of quarters) {
      const echoes = lines.filter(line => line.kind === 'echo');
      for (const report of lines.filter(line => line.kind === 'report')) {
        if (/Энергосеть/.test(report.who ?? '')) seen.add('energy');
        if (/Больницы/.test(report.who ?? '')) seen.add('health');
        for (const paragraph of report.text.split(/\n\n+/).filter(Boolean)) {
          assert.ok(echoes.every(echo => !echo.text.includes(paragraph)), `seed ${seed}: повтор доклада «${report.who}»: ${paragraph}`);
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['energy', 'health'], 'проверка охватывает оба проекта');
});

test('убирается только повтор показанного доклада; соседние новости и старые доклады сохраняются (#313)', async () => {
  const { quarters } = await liveTerm(21);
  const { before, after: original } = quarters.find(q => q.after.world?.health)!;
  const energy = 'Щиты доставлены.\n\nСеть приняла нагрузку.';
  const health = 'В район приехали два врача.';
  const government = 'Семьям выдали ключи от квартир.';
  const old = 'Подрядчик получил аванс.';
  const news = ['Из промышленного региона. Министр открыл проверку подрядчика.',
    `Из промышленного региона. ${energy}`, `Районные больницы. ${health}`, government, old,
    'Сеть приняла нагрузку. Соседний район просит такую же подстанцию.'];
  const after: GameState = { ...original,
    world: { ...original.world!, project: { ...original.world!.project, status: 'running' },
      health: { ...original.world!.health!, status: 'running', aftermath: undefined },
      dispatches: [
        { id: 'energy', project: 'energy', turn: original.turn, kind: 'report', title: 'Энергосеть · квартальный доклад', text: energy },
        { id: 'health', project: 'health', turn: original.turn, kind: 'report', title: 'Больницы · квартальный доклад', text: health },
        { id: 'housing', project: 'housing', turn: original.turn, kind: 'news', title: 'Жильё', text: government },
        { id: 'old', project: 'energy', turn: before.turn, kind: 'report', title: 'Прежний доклад', text: old },
      ] },
    lastTurn: { ...original.lastTurn!, narrative: `Резолюция исполнена.\n\nВ том же квартале\n\n${news.join('\n\n')}` },
  };
  const snapshot = structuredClone(after);
  const { lines } = quarterLines(before, after, EMPTY_PERSONAL);
  assert.deepEqual(lines.filter(line => line.kind === 'report').map(line => line.text), [energy, health, government, after.lastTurn!.forecasts!.slice(1).join('\n')]);
  assert.deepEqual(lines.filter(line => line.kind === 'echo').map(line => line.text), [news[0], old, news.at(-1)]);
  assert.deepEqual(after, snapshot, 'представление не меняет состояние партии');

  // Письмо, ожидающее назначения, не показано отдельным докладом: его текст не должен исчезнуть из рассказа,
  // а само обращение с вариантами ответа остаётся у президента.
  const waiting: GameState = { ...after, world: { ...after.world!,
    health: { ...after.world!.health!, status: 'unassigned' },
    dispatches: after.world!.dispatches.map(d => d.id === 'health' ? { ...d, kind: 'letter' } : d) } };
  const messages = presidentialMessages(waiting);
  assert.ok(messages.some(message => message.token === 'health' && message.needsReply), 'письмо действительно ждёт ответа');
  const pending = quarterLines(before, waiting, EMPTY_PERSONAL).lines;
  assert.ok(!pending.some(line => line.kind === 'report' && line.text === health));
  assert.ok(pending.some(line => line.kind === 'echo' && line.text === `Районные больницы. ${health}`));
  assert.deepEqual(presidentialMessages(waiting), messages, 'обращение не погашено чтением хроники');
});

test('одно зерно — одна хроника: начало, кварталы и личные строки повторяются', async () => {
  const [a, b] = [await liveTerm(21), await liveTerm(21)];
  assert.deepEqual(a.quarters.map(q => q.lines), b.quarters.map(q => q.lines));
  assert.deepEqual(startFromSeed(21), startFromSeed(21));
  assert.ok(a.quarters.length >= 5);
});

test('квартал: подпись первой, итог последним, даты идут вперёд между двумя решениями', async () => {
  const { quarters } = await liveTerm(5);
  for (const { lines } of quarters) {
    assert.equal(lines[0].kind, 'signed');
    assert.equal(lines.at(-1)!.kind, 'ledger');
    for (let i = 1; i < lines.length; i++) assert.ok(day(lines[i]) >= day(lines[i - 1]), `${lines[i].id} раньше предыдущей строки`);
  }
  const echoes = quarters.flatMap(q => q.lines).filter(line => line.kind === 'echo');
  assert.ok(echoes.length > 0, 'отклики прежних решений идут отдельными строками');
});

test('личная линия сдержанна: не больше одной строки за квартал, каждая один раз, первая ночь — в день подписи', async () => {
  for (const seed of [3, 5, 21, 40]) {
    const { quarters, memory } = await liveTerm(seed);
    for (const { lines } of quarters) assert.ok(lines.filter(line => line.kind === 'personal').length <= 1);
    assert.equal(new Set(memory.used).size, memory.used.length);
    assert.ok(memory.used.length <= Math.ceil(quarters.length / 2) + 1, `слишком много личного: ${memory.used.length}`);
    const first = quarters[0].lines;
    const night = first.find(line => line.kind === 'personal')!;
    assert.equal(day(night), day(first[0]), 'первая ночь остаётся в день подписи, после дневного исполнения');
  }
  // Род президента в личных строках не угадывается: глаголы прошедшего времени — только во множественном числе «вы …ли».
  for (const beat of PERSONAL_BEATS) assert.doesNotMatch(beat.text, /\bвы\s+\S+(?:ла|л)\b/i, beat.id);
});

test('начало срока — из движка: имя, биография, положение страны и речь', async () => {
  const state = await newTerm(startFromSeed(7));
  const lines = openingLines(state);
  assert.ok(lines[0].text.startsWith(state.leader.name));
  assert.equal(lines.at(-1)!.kind, 'speech');
  assert.ok(lines.every(line => !line.text.startsWith('Альтернативная история')));
});

test('бюджет, пресс-конференция и звонок собираются функциями движка, без заглушек', async () => {
  const seen = new Set<string>();
  // Президент «всегда первый вариант» может не дожить до звонка: тогда тот же разбор на следующем зерне.
  for (const seed of [3, 1, 2]) {
    if (seen.size === 3) break;
    let state = await newTerm(startFromSeed(seed));
    while (!termOver(state) && seen.size < 3) {
      state = await nextCase(state);
      const event = state.currentEvent!, step = firstStep(state);
      if (event.budget) {
        seen.add('budget');
        assert.equal(step.kind, 'choice');
        assert.equal(step.kind === 'choice' && step.options.length, BUDGET_PRESETS.length + 1);
        assert.ok(step.kind === 'choice' && step.options.every(option => option.hint));
      }
      if (event.press) {
        seen.add('press');
        assert.equal(step.kind, 'press');
        const second = pressStep(state, [0]);
        assert.ok(second.kind === 'press' && second.question === 1 && second.options.length > 1);
      }
      if (event.call && !event.call.negotiation) {
        seen.add('call');
        assert.equal(step.kind, 'call-approach');
        const ending = callEndingStep(state, 'numbers');
        assert.ok(ending.kind === 'call-ending' && ending.reply && ending.options.length === 3);
      }
      if (step.kind === 'press') state = await signPress(state, event.press!.questions.map(() => 0));
      else if (step.kind === 'call-approach') state = await signCall(state, 'numbers', 'deal');
      else state = await signOption(state, step.options[0].key);
    }
  }
  assert.deepEqual([...seen].sort(), ['budget', 'call', 'press']);
});

test('мемуары и четыре современника на том же зерне', async () => {
  const { state } = await liveTerm(21);
  const page = await memoir(state);
  assert.match(page.years, /^1978–19\d\d$/);
  assert.ok(page.outcome && page.verdict && page.epitaph);
  const rivals = await contemporaries(startFromSeed(21));
  assert.equal(rivals.length, TEMPERS.length);
  for (const rival of rivals) assert.ok(rival.outcome && rival.firstChoice && rival.support >= 0);
});

test('падение власти рассказано последней строкой, а угроза названа в итоге квартала заранее', async () => {
  const { state, quarters } = await liveTerm(7, 'coalition');
  assert.ok(state.ended, 'на «Коалиции» первый вариант подряд доводит до падения');
  const page = await memoir(state);
  assert.equal(page.fall?.kind, 'fall');
  assert.ok(page.fall!.text.length > 40);
  const ledgers = quarters.slice(0, -1).flatMap(q => q.lines).filter(line => line.kind === 'ledger');
  assert.ok(ledgers.some(line => line.text.includes('Опасно мало')), 'до падения итог квартала предупреждал');
});

// В JavaScript `\b` не видит кириллицу: граница слова здесь — «дальше не буква и не цифра».
const DANGLING_OPENING = /^(На ней|В ней|Вместо него|Взамен)(?![\p{L}\d])/u;

test('правило висящего начала сцены само ловит повреждённые начала и не трогает целые (#310, C02)', () => {
  for (const broken of ['На ней лежит письмо', 'В ней никого нет', 'Вместо него стоял стол', 'Взамен предложили долю', 'Взамен.']) {
    assert.ok(DANGLING_OPENING.test(broken), `должно ловить: ${broken}`);
  }
  for (const whole of ['Взаменить нечем', 'На неё никто не смотрел', 'Вместо Него — другой', 'Ночью пришло письмо']) {
    assert.ok(!DANGLING_OPENING.test(whole), `не должно ловить: ${whole}`);
  }
});

test('сцена квартала начинается своим предложением, а совпавший заголовок не повторяется газетной строкой (#310, C02)', async () => {
  const words = (text: string) => (text.toLowerCase().match(/[\p{L}\d]+/gu) ?? []).join(' ');
  let told = 0;
  for (const seed of [1, 5, 7, 21]) {
    const { quarters } = await liveTerm(seed);
    for (const { lines } of quarters) {
      const scenes = lines.filter(line => line.kind === 'scene'), papers = lines.filter(line => line.kind === 'paper');
      assert.ok(scenes.every(line => !DANGLING_OPENING.test(line.text)), scenes[0]?.text);
      const opening = scenes[0] ? words(scenes[0].text.split(/(?<=[.!?…])\s+/)[0]) : '';
      if (papers.length === 0 && scenes.length) told++;
      assert.ok(papers.every(line => words(line.text) !== opening), `заголовок дублирует сцену: ${opening}`);
    }
  }
  assert.ok(told > 0, 'на настоящих партиях сцены начинаются с заголовка — проверка не пустая');
});
