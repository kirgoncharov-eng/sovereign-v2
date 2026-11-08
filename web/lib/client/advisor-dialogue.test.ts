import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advisorDialogue, fillAdvisorSpeech } from './advisor-dialogue.ts';
import { advisorOutlook, resolutionPeople, unifiedResolution } from './advisor-outlook.ts';
import { ADVISOR_DIALOGUE } from '../content/advisor-dialogue.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './chronicle.ts';
import { ALTERNATE_COUNTRY, LEGACY_COUNTRIES } from '../game/alternate-world.ts';
import type { AdvisorDialogue } from '../content/advisor-dialogue.ts';

test('без вычитанного текста нет шаблонных речей; неизвестный слот не попадает к игроку', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  assert.deepEqual(advisorDialogue(state, state.currentEvent!.choices[0], {}), []);
  assert.equal(fillAdvisorSpeech('Казна заплатит {unknown}.', {}), null);
  assert.equal(fillAdvisorSpeech('Заплатим {economy}.', { economy: '−7' }), 'Заплатим −7.');
});

test('первое дело: на каждой сложности и зерне раскрываются предметные речи реальных членов команды', async () => {
  const roles = [['economist', 'strategist'], ['diplomat', 'economist'], ['economist', 'strategist']];
  for (const diff of ['debut', 'coalition', 'crisis', 'ruins'] as const) for (const seed of [3, 7, 11, 19]) {
    const original = await nextCase(await newTerm(startFromSeed(seed, diff)));
    for (const skill of [1, 2, 3] as const) {
      const state = { ...original, advisors: original.advisors.map(advisor => ({ ...advisor, skill, loyalty: 80 })) };
      const before = structuredClone(state);
      for (const [index, choice] of state.currentEvent!.choices.entries()) {
        const lines = advisorDialogue(state, choice);
        assert.deepEqual(lines.map(line => line.source.id), roles[index], `${diff}/${seed}/${index}: кто говорит`);
        for (const line of lines) {
          assert.equal(line.source.name, state.advisors.find(advisor => advisor.id === line.source.id)!.name);
          assert.doesNotMatch(line.text, /\{[^}]*\}|\d|undefined|самый дорогой/u);
          assert.match(line.text, /[.!?]$/u);
          assert.equal(line.correction, undefined, 'одинаковая компетентность не создаёт поправку слабому');
        }
        if (skill > 1) {
          const text = lines.map(line => line.text).join(' ');
          assert.match(text, [/банк.*ссуд/u, /гаранти/u, /таможн/u][index]);
          if (index === 1) assert.match(text, /цен[ау]/iu);
          if (index === 0) assert.ok(text.includes(state.arc!.target), 'вместо слота — действующий директор');
        }
      }
      assert.deepEqual(state, before, 'чтение не меняет состояние');
    }
  }
});

test('сильный критик замечает упущение слабого автора; отсутствующий советник не говорит из пустоты', async () => {
  const original = await nextCase(await newTerm(startFromSeed(7)));
  const lead = ['economist', 'diplomat', 'economist'];
  for (const [index, choice] of original.currentEvent!.choices.entries()) {
    const state = { ...original, advisors: original.advisors.map(advisor => ({
      ...advisor, skill: advisor.id === lead[index] ? 1 as const : 3 as const, loyalty: 80,
    })) };
    const lines = advisorDialogue(state, choice);
    assert.ok(lines[1].correction, `${index}: замечено условие исполнения`);
    const noAuthor = { ...state, advisors: state.advisors.filter(advisor => advisor.id !== lead[index]) };
    const remaining = advisorDialogue(noAuthor, choice);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].correction, undefined);
  }
});

test('заводские речи не попадают в архив, Daily, другое дело или переработанное предложение', async () => {
  const state = await nextCase(await newTerm(startFromSeed(7)));
  const choice = state.currentEvent!.choices[0];
  assert.equal(state.country, ALTERNATE_COUNTRY);
  for (const country of LEGACY_COUNTRIES) assert.deepEqual(advisorDialogue({ ...state, country }, choice), []);
  assert.deepEqual(advisorDialogue({ ...state, daily: '2026-11-07' }, choice), []);
  assert.deepEqual(advisorDialogue({ ...state, currentEvent: { ...state.currentEvent!, card: 'alt_case_without_dialogue' } }, choice), []);
  assert.deepEqual(advisorDialogue(state, { ...choice, id: 's_economist' }), []);
  assert.deepEqual(advisorDialogue(state, { ...choice, policyEffect: { economy: -20 } }), [], 'другая цена — уже другое предложение');
  assert.deepEqual(advisorDialogue(state, { ...choice, advisor: { id: 'economist', name: 'Другой', role: 'Экономист', skill: 3 } }), []);
  assert.deepEqual(advisorDialogue(state, { ...choice, deal: { pure: true, res: { economy: -2 } } }), []);
  const untouched = structuredClone(state);
  for (const option of state.currentEvent!.choices) advisorDialogue(state, option);
  assert.deepEqual(await signChoice(state, choice.id), await signChoice(untouched, choice.id), 'после чтения та же настоящая подпись');
});

test('нелояльный участник прямо защищает свой лагерь; чтение не меняет точность доклада', async () => {
  const original = await nextCase(await newTerm(startFromSeed(7)));
  const state = { ...original, advisors: original.advisors.map(advisor => ({ ...advisor, skill: 3 as const, loyalty: 0,
    camp: advisor.id === 'diplomat' ? 'russia' as const : advisor.id === 'economist' ? 'business' as const : 'regional' as const,
  })) };
  for (const [index, choice] of state.currentEvent!.choices.entries()) {
    const forecast = advisorOutlook(state, choice);
    const lines = advisorDialogue(state, choice);
    assert.match(lines.map(line => line.text).join(' '), [/Палата/u, /Российской делегации[\s\S]*Палате/u, /Областные советы/u][index]);
    assert.deepEqual(advisorOutlook(state, choice), forecast);
  }
});

test('авторская речь выбирается по делу, варианту, человеку и тону; число из того же доклада', async () => {
  const original = await nextCase(await newTerm(startFromSeed(7)));
  const data: AdvisorDialogue = { [original.currentEvent!.card!]: { 0: {
    economist: { weak: 'Банк разберётся.', strong: '{target}: резерв заплатит {success.economy}.',
      lobby: { business: 'Палата ждёт этот заказ.' } },
    strategist: { strong: 'Нужен отдельный счёт.', challenge: { after: 'economist', text: 'А банк?' } },
  } } };
  for (const skill of [1, 3] as const) {
    const state = { ...original, advisors: original.advisors.map(advisor => ({ ...advisor, skill: advisor.id === 'economist' ? skill : 3, loyalty: 80 })) };
    const choice = state.currentEvent!.choices[0], lines = advisorDialogue(state, choice, data);
    assert.equal(lines[0].text, skill === 1 ? 'Банк разберётся.' : `${state.arc!.target}: резерв заплатит ${advisorOutlook(state, choice)!.success.resources.economy.text}.`);
    assert.equal(lines[1].correction, skill === 1 ? 'А банк?' : undefined);
    assert.deepEqual(advisorDialogue(state, state.currentEvent!.choices[1], data), []);
    const disloyal = { ...state, advisors: state.advisors.map(advisor => ({ ...advisor, loyalty: 0 })) };
    assert.equal(advisorDialogue(disloyal, choice, data)[0].text, 'Палата ждёт этот заказ.');
  }
});

// #397: разговоры дел расписания первого срока перенесены на экран резолюции.
// Базовое alt_fuel в первом сроке почти всегда заменяет версия (#214), поэтому в партиях проверяются версии; речи базового — структурно.
const FIRST_TERM_SEEN = ['alt_harvest', 'alt_fuel_advance', 'alt_fuel_audit', 'alt_fuel_west', 'alt_radio', 'alt_rail', 'alt_district',
  'alt_standards', 'alt_archive'];
const FIRST_TERM_DIALOGUE = [...FIRST_TERM_SEEN, 'alt_fuel'];

test('дела первого срока: под каждым вариантом говорят те, кто его предлагает и оспаривает, — без слотов, цифр и обрывков', async () => {
  const seen = new Set<string>();
  for (const diff of ['debut', 'crisis'] as const) for (const seed of [3, 7, 11, 19]) for (const route of [0, 1, 2]) {
    let state = await nextCase(await newTerm(startFromSeed(seed, diff)));
    while (!state.ended && state.turn < 20) {
      const card = state.currentEvent?.card ?? '';
      if (FIRST_TERM_SEEN.includes(card) && unifiedResolution(state)) {
        seen.add(card);
        for (const skill of [1, 3] as const) {
          const team = { ...state, advisors: state.advisors.map(advisor => ({ ...advisor, skill, loyalty: 80 })) };
          const before = structuredClone(team);
          for (const choice of team.currentEvent!.choices) {
            const people = resolutionPeople(team, choice);
            const lines = advisorDialogue(team, choice);
            assert.deepEqual(lines.map(line => line.source.id), [people.proponent!.id, people.critic!.id], `${card}/${choice.id}: кто говорит`);
            for (const line of lines) {
              assert.doesNotMatch(line.text, /\{[^}]*\}|\d|undefined/u, `${card}/${choice.id}: ${line.text}`);
              assert.match(line.text, /^[А-ЯЁ«].*[.!?]$/u, `${card}/${choice.id}: ${line.text}`);
            }
            const forecast = advisorOutlook(team, choice);
            advisorDialogue(team, choice);
            assert.deepEqual(advisorOutlook(team, choice), forecast, 'чтение не меняет справку');
          }
          assert.deepEqual(team, before, 'чтение не меняет состояние');
        }
      }
      const choice = state.currentEvent!.choices[Math.min(route, state.currentEvent!.choices.length - 1)];
      state = await nextCase(await signChoice(state, choice.id));
    }
  }
  assert.deepEqual([...seen].sort(), [...FIRST_TERM_SEEN].sort(), 'каждое дело встречается в партиях');
});

test('дела первого срока: сильный тон дольше слабого и называет, на чём сорвётся; поправка — от сильного критика слабому автору', () => {
  for (const card of FIRST_TERM_DIALOGUE) for (const [index, speakers] of Object.entries(ADVISOR_DIALOGUE[card]!)) {
    const [author, critic] = Object.keys(speakers!);
    for (const [who, speech] of Object.entries(speakers!)) {
      assert.ok(speech.strong && speech.weak && speech.strong !== speech.weak, `${card}/${index}/${who}`);
      assert.ok(speech.strong.length > speech.weak.length, `${card}/${index}/${who}: слабый тон короче`);
    }
    assert.equal(speakers![critic].challenge?.after, author, `${card}/${index}: поправка обращена к автору`);
    assert.match(speakers![author].strong!, /(?:^|[\s,:—])(?:Но|если|Если|иначе|Иначе)[\s,:]/u, `${card}/${index}: автор называет условие`);
  }
});
