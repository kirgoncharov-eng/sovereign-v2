import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  firstStep, newTerm, nextCase, programOf, quarterLines, signCall, signOption, signPress, startFromSeed, takeOffice, termOver,
  toldInChronicle, withoutRepeats, FROM_REGIONS, QUARTER_LIFE, type ChronicleLine,
} from './chronicle.ts';
import { EMPTY_PERSONAL, type PersonalMemory } from './chronicle-personal.ts';
import { countryLines } from './chronicle-country.ts';
import { ALTERNATE_RANDOM_EVENTS } from '../content/alternate-history.ts';
import { CAMP_STANCE } from '../content/press-1978.ts';
import { HOSTILE_RELATION, TERM } from '../game/data.ts';
import type { DifficultyId, GameState } from '../game/types.ts';

interface Quarter { before: GameState; after: GameState; lines: ChronicleLine[] }

/** Первый срок и начало второго с предвыборной программой: вариант по номеру, на пресс-конференции — первые ответы. */
async function termWithProgram(seed: number, diff: DifficultyId, pick = 0): Promise<Quarter[]> {
  const candidate = await newTerm(startFromSeed(seed, diff));
  let state = takeOffice(candidate, programOf(candidate).suggested);
  let memory: PersonalMemory = EMPTY_PERSONAL;
  const quarters: Quarter[] = [];
  while (!termOver(state) && state.turn < TERM + 2) {
    state = await nextCase(state);
    const before = state, step = firstStep(state);
    if (step.kind === 'press') state = await signPress(state, state.currentEvent!.press!.questions.map(() => 0));
    else if (step.kind === 'call-approach') state = await signCall(state, 'numbers', 'deal');
    else state = await signOption(state, step.options[Math.min(pick, step.options.length - 1)].key);
    const quarter = quarterLines(before, state, memory);
    memory = quarter.memory;
    quarters.push({ before, after: state, lines: quarter.lines });
  }
  return quarters;
}

const ROUTES: [number, DifficultyId, number][] = [[7, 'debut', 0], [21, 'debut', 1], [7, 'coalition', 0], [21, 'coalition', 1], [7, 'crisis', 0], [21, 'crisis', 1]];
const terms = await Promise.all(ROUTES.map(([seed, diff, pick]) => termWithProgram(seed, diff, pick)));
const quarters = terms.flat();
const day = (line: ChronicleLine) => Date.UTC(line.date.year, line.date.month, line.date.day) / 86_400_000;
const sourceLabels = (state: GameState) => [...new Set(Object.values(state.lastTurn?.sources ?? {}).flatMap(entries => (entries ?? []).map(([label]) => label)))];
const notices = (lines: ChronicleLine[], who: RegExp) => lines.filter(line => line.kind === 'notice' && who.test(line.who ?? ''));

test('причина вне резолюции из ведомости названа в ленте того же квартала (#426)', () => {
  const background = new Map(ALTERNATE_RANDOM_EVENTS.map(event => [event.title.toLowerCase(), event.description]));
  const seen = { background: 0, promise: 0, crisis: 0, law: 0, hostile: 0 };
  for (const { before, after, lines } of quarters) {
    const report = after.lastTurn!, labels = sourceLabels(after);
    for (const label of labels) {
      const description = background.get(label);
      if (!description) continue;
      seen.background++;
      assert.ok(lines.some(line => line.kind === 'country' && line.text === description), `фон «${label}» рассказан строкой`);
    }
    const settled = (after.promises ?? []).filter(promise => promise.status !== 'open'
      && before.promises?.find(old => old.id === promise.id)?.status === 'open');
    seen.promise += settled.length;
    assert.equal(notices(lines, /^Обещание (?:нарушено|исполнено)$/).length, settled.length, 'каждое закрытое обещание названо');
    if (labels.includes('обещания')) assert.ok(settled.length > 0, 'строка ведомости «обещания» объяснена');
    if (report.newCrisis) {
      seen.crisis++;
      const told = notices(lines, /^Новый кризис$/);
      assert.equal(told.length, 1);
      assert.ok(told[0].text.startsWith(`${report.newCrisis.title}. `) && !/Лидер измотан/.test(told[0].text), 'кризис назван и описан вторым лицом');
    }
    if (report.law) {
      seen.law++;
      assert.equal(notices(lines, /^Парламент$/).length, 1, 'судьба законопроекта названа');
    }
    assert.equal(notices(lines, /^Утечка$/).length, report.leaks?.length ?? 0);
    for (const name of labels.flatMap(label => label.match(/^вредят «(.+)»$/)?.[1] ?? [])) {
      const earlier = before.factions.find(faction => faction.name === name)!;
      if (earlier.relation <= HOSTILE_RELATION) continue;
      seen.hostile++;
      assert.ok(notices(lines, /^Открытый противник$/).some(line => line.text.includes(`«${name}»`)), `враждебный лагерь «${name}» назван`);
    }
  }
  assert.ok(seen.background > 3 && seen.promise > 3 && seen.crisis > 0 && seen.law > 0 && seen.hostile > 0, JSON.stringify(seen));
});

test('обещание: причина нарушения отличает подпись от срока', () => {
  for (const { before, after, lines } of quarters) {
    for (const line of notices(lines, /^Обещание нарушено$/)) {
      const bySignature = /Эта подпись его перечеркнула|сняли его перед журналистами/.test(line.text);
      assert.equal(bySignature, !/Срок вышел/.test(line.text));
      // До хода выборов срок выйти не мог.
      if (after.turn % 10 !== 0) assert.ok(bySignature, `ход ${after.turn}: до срока слово нарушает только подпись`);
      if (/журналистами/.test(line.text)) assert.ok(before.currentEvent?.press);
    }
  }
});

test('выборы — отдельный блок одного дня, канун — накануне (#426)', () => {
  let votes = 0;
  for (const term of terms) {
    term.forEach(({ after, lines }, index) => {
      const election = after.lastTurn!.election;
      assert.ok(!lines.some(line => line.kind !== 'vote' && /^(?:Парламентские|Президентские) выборы\./.test(line.text)), 'итог выборов — только в блоке');
      // Особая развязка срока (преемник, «лидер нации») пишет свой финал вместо ночи подсчёта: блока выборов в ней нет.
      if (!election || !/(?:^|\n\n)(?:Парламентские|Президентские) выборы\./.test(after.lastTurn!.narrative)) return;
      votes++;
      const vote = lines.filter(line => line.kind === 'vote');
      assert.equal(vote.length, 1);
      assert.equal(lines.indexOf(vote[0]), 1, 'блок выборов открывает квартал сразу после подписи');
      assert.equal(day(vote[0]) - day(lines[0]), 1, 'голосование — на следующий день после подписи');
      const press = lines.find(line => line.kind === 'press' && /Второе место|У партии власти/.test(line.text))!;
      assert.ok(press, 'газета о выборах есть');
      assert.equal(day(press), day(vote[0]));
      assert.ok(press.text.startsWith(after.lastTurn!.headline.replace(/[.!?…]+$/, '')), 'газета печатается с заголовком о результате');
      // Обещания, проверенные по сроку, — в ту же ночь.
      for (const line of notices(lines, /^Обещание/)) if (/Срок вышел/.test(line.text)) assert.equal(day(line), day(vote[0]));
      // Канун — последняя повествовательная строка прошлого квартала и последний день перед подписью этого.
      const eve = term[index - 1]?.lines.find(line => line.kind === 'personal' && line.text.startsWith('Ночь перед голосованием'));
      if (eve) assert.equal(day(lines[0]) - day(eve), 1, 'канун — за день до подписи в день выборов');
    });
  }
  assert.ok(votes >= 6, `выборов в замере: ${votes}`);
});

test('«Отклик прежних решений» — только последствия прежних подписей', () => {
  let echoes = 0, life = 0, regions = 0;
  for (const { after, lines } of quarters) {
    const matured = (after.lastTurn!.matured ?? []).flatMap(pending => pending.story ? [pending.story] : []);
    for (const line of lines.filter(entry => entry.kind === 'echo')) {
      assert.ok(!/Ответ можно подписать в резолюции этого письма/.test(line.text), 'подсказка стола не попадает в ленту');
      assert.ok(!line.text.startsWith('Причина: '), 'причина стоит в докладе региона, а не отдельной строкой');
      if (line.who === QUARTER_LIFE) life++;
      else if (line.who === FROM_REGIONS) { regions++; assert.match(line.text, /^(?:Из промышленного региона\.|Районные больницы\.)/); }
      else {
        echoes++;
        assert.equal(line.who, undefined);
        assert.ok(line.text.startsWith('Аукается ') || matured.some(story => line.text.endsWith(story)), line.text.slice(0, 80));
      }
    }
  }
  assert.ok(echoes > 10 && life > 10 && regions > 3, `${echoes}/${life}/${regions}`);
});

test('голос, газета, отклик и приёмная не повторяются дословно за срок', () => {
  const line = (kind: ChronicleLine['kind'], text: string) => ({ kind, text });
  const shown = [line('press', 'Гражданское движение называет это уступкой обществу.'), line('scene', 'Суд принял акты ревизии.')];
  const next = [
    line('press', 'Гражданское движение называет это уступкой обществу.'), line('voice', 'Новый голос.'), line('voice', 'Новый голос.'),
    line('scene', 'Суд принял акты ревизии.'), line('notice', 'Закон принят.'), line('ledger', 'К концу квартала опоры власти не сдвинулись.'),
  ];
  assert.deepEqual(withoutRepeats(next, toldInChronicle(shown)).map(entry => `${entry.kind}:${entry.text}`), [
    'voice:Новый голос.', 'scene:Суд принял акты ревизии.', 'notice:Закон принят.', 'ledger:К концу квартала опоры власти не сдвинулись.',
  ]);
  // На настоящих партиях после фильтра повторов нет, а сцена подписи, выборы и ведомость остаются в каждом квартале.
  for (const term of terms) {
    let told = new Set<string>();
    for (const { lines } of term) {
      const fresh = withoutRepeats(lines, told);
      assert.ok(fresh.some(entry => entry.kind === 'ledger') && fresh[0].kind === 'signed');
      assert.equal(fresh.filter(entry => entry.kind === 'scene' || entry.kind === 'vote').length,
        lines.filter(entry => entry.kind === 'scene' || entry.kind === 'vote').length, 'сцены и выборы не отбрасываются');
      told = new Set([...told, ...toldInChronicle(fresh)]);
    }
  }
});

test('позиция лагеря в прессе: не меньше трёх разных формулировок на знак', () => {
  for (const [camp, stance] of Object.entries(CAMP_STANCE)) {
    for (const side of ['against', 'for'] as const) {
      assert.ok(stance[side].length >= 3 && new Set(stance[side]).size === stance[side].length, `${camp}.${side}`);
      for (const phrase of stance[side]) assert.match(phrase, /^[а-яё]/, 'фраза продолжает название лагеря со строчной');
    }
  }
});

test('строка со связкой времени датирована по сцене квартала, «Наутро» — следующим днём (#435)', () => {
  const SAME_DAY = ['Тем временем ', 'В тот же вечер ', 'Почти в ту же минуту ', 'А в другом конце столицы ', 'Ближе к ночи ', 'В это же время ', 'Вечером '];
  let tied = 0, morning = 0;
  for (const { lines } of quarters) {
    let scene: ChronicleLine | null = null;
    for (const line of lines) {
      if (line.kind === 'vote') continue;
      const sameDay = SAME_DAY.some(lead => line.text.startsWith(lead)), nextDay = line.text.startsWith('Наутро ');
      if (scene && (line.kind === 'scene' || line.kind === 'voice') && (sameDay || nextDay)) {
        const gap = day(line) - day(scene);
        if (nextDay) { morning++; assert.ok(gap >= 0 && gap <= 1, `«Наутро» через ${gap} дн.: ${line.text.slice(0, 60)}`); }
        else { tied++; assert.ok(gap === 0, `связка через ${gap} дн.: ${line.text.slice(0, 60)}`); }
      }
      if (line.kind === 'scene') scene = line;
    }
  }
  assert.ok(tied > 10 && morning > 0, `${tied}/${morning}`);
});

test('пресс-конференция, бюджет и звонок: сцена в день подписи (#435)', () => {
  let acts = 0;
  for (const { before, after, lines } of quarters) {
    const event = before.currentEvent!;
    if (!(event.press || event.budget || event.call) || after.lastTurn!.election) continue;
    const scene = lines.find(line => line.kind === 'scene');
    if (!scene) continue;
    acts++;
    assert.equal(day(scene), day(lines[0]), `${event.title}: сцена через ${day(scene) - day(lines[0])} дн. после подписи`);
  }
  assert.ok(acts >= 12, `особых дел в замере: ${acts}`);
});

test('квартал, где власть кончилась: голоса и пресса о решении — до развязки (#435)', () => {
  let endings = 0;
  for (const term of terms) {
    const last = term.at(-1)!;
    if (!last.after.ended) continue;
    const scenes = last.lines.filter(line => line.kind === 'scene');
    if (scenes.length < 2 || last.lines.some(line => line.kind === 'vote')) continue;
    endings++;
    const closing = last.lines.indexOf(scenes[1]);
    for (const line of last.lines.filter(entry => entry.kind === 'voice' || entry.kind === 'press')) {
      assert.ok(last.lines.indexOf(line) < closing, `после развязки: ${line.text.slice(0, 70)}`);
    }
    assert.equal(last.lines.indexOf(scenes[0]), 1, 'сцена решения открывает квартал');
  }
  assert.ok(endings > 0, 'в замере есть партия, закончившаяся без блока выборов');
});

test('без отчёта о ходе строк нет; архивная партия не получает строк 1978 года', () => {
  const { before } = quarters[0];
  assert.deepEqual(countryLines(before, { ...before, lastTurn: null }), { own: [], background: [], deadline: [], quarter: [] });
});

test('в одной партии ни одно предложение ленты о нарушенных обещаниях, выборах и пресс-конференциях не повторяется дословно (#441)', () => {
  let broken = 0;
  terms.forEach((term, index) => {
    const seen = new Map<string, number>();
    for (const { lines } of term) {
      for (const line of lines) {
        const watched = line.who === 'Обещание нарушено' || /Пресс-конференция (?:длится|идёт)|журналисты держат вас|признаёт итоги|поздравля|звонит/i.test(line.text);
        if (!watched) continue;
        if (line.who === 'Обещание нарушено') broken++;
        for (const sentence of line.text.split(/(?<=[.!?])\s+/)) {
          // Причина нарушения — факт: две подписи могут перечеркнуть два обещания.
          if (sentence.length < 30 || /перечеркнула|перед журналистами/.test(sentence)) continue;
          // Ответ на вопрос журналиста выбирает игрок; тест отвечает первым вариантом и проверяет только слова рассказчика.
          if (/^На вопрос |^«|»\.?$/.test(sentence)) continue;
          seen.set(sentence, (seen.get(sentence) ?? 0) + 1);
        }
      }
    }
    const repeated = [...seen].filter(([, count]) => count > 1).map(([sentence, count]) => `${count}× ${sentence}`);
    assert.deepEqual(repeated, [], `партия ${ROUTES[index].join('/')}`);
  });
  assert.ok(broken >= 4, `проверено нарушенных обещаний: ${broken}`);
});
