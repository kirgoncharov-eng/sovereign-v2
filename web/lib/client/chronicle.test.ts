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

const day = (line: ChronicleLine) => Date.UTC(line.date.year, line.date.month, line.date.day);

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
  assert.deepEqual(lines.filter(line => line.kind === 'report').map(line => line.text), [energy, health, government]);
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

test('личная линия сдержанна: не больше одной строки за квартал, каждая один раз, первая ночь — сразу после подписи', async () => {
  for (const seed of [3, 5, 21, 40]) {
    const { quarters, memory } = await liveTerm(seed);
    for (const { lines } of quarters) assert.ok(lines.filter(line => line.kind === 'personal').length <= 1);
    assert.equal(new Set(memory.used).size, memory.used.length);
    assert.ok(memory.used.length <= Math.ceil(quarters.length / 2) + 1, `слишком много личного: ${memory.used.length}`);
    const first = quarters[0].lines;
    assert.equal(first[1].kind, 'personal', 'первая ночь — первой строкой после подписи');
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
