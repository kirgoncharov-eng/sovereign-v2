import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quarterLedger, ledgerParts } from './chronicle-ledger.ts';
import { firstStep, newTerm, nextCase, quarterLines, signCall, signOption, signPress, startFromSeed } from './chronicle.ts';
import { encodeChronicle, parseChronicle } from './chronicle-save.ts';
import { EMPTY_PERSONAL } from './chronicle-personal.ts';
import { resolveTurn } from '../game/engine.ts';
import { confirmInitiative, initiativeOptions, initiativeTurnSources } from '../game/initiatives.ts';
import { RESOURCE_KEYS } from '../game/data.ts';
import { RESOURCE_TITLE } from '../content/resource-names.ts';
import type { GameState, Narration, ResourceKey } from '../game/types.ts';

const narration: Narration = { headline: 'Ведомость', narrative: 'Квартал завершён.', reactions: [], historianNote: '',
  crisisTitle: null, crisisDescription: null, powerLoss: null };

async function example(): Promise<{ before: GameState; after: GameState }> {
  const before = await nextCase(await newTerm(startFromSeed(7)));
  const after = await signOption(before, firstStep(before).options[0].key);
  const resources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 60])) as GameState['resources'];
  return { before: { ...before, resources }, after: { ...after, resources, prevResources: resources } };
}

test('два платежа не приписываются последней резолюции; ведомость не меняет партию', async () => {
  const { before, after } = await example();
  after.resources = { ...after.resources, economy: 45 };
  after.lastTurn = { ...after.lastTurn!, matured: [{ id: 'debt', due: after.turn, label: 'Возврат аванса',
    res: { economy: -4 }, source: 'заём' }], sources: { economy: [['решение', -9], ['возврат аванса', -4], ['давление обстоятельств', -2]] } };
  const original = structuredClone({ before, after });
  const text = quarterLedger(before, after);
  assert.equal(ledgerParts(text).summary, 'К концу квартала: экономика −15.');
  assert.deepEqual(ledgerParts(text).details, [
    'Экономика: 60 → 45 (−15)\nваша резолюция: −9\nпо прежней подписи: возврат аванса: −4\nтрудности квартала: −2',
  ]);
  assert.deepEqual({ before, after }, original);
});

test('нулевой итог сохраняет противоположные слагаемые', async () => {
  const { before, after } = await example();
  after.lastTurn = { ...after.lastTurn!, sources: { economy: [['решение', 5], ['долг', -5]] } };
  const parts = ledgerParts(quarterLedger(before, after));
  assert.match(parts.summary, /не сдвинулись/);
  assert.deepEqual(parts.details, ['Экономика: 60 → 60 (без перемены)\nваша резолюция: +5\nдолг: −5']);
});

test('неполная ведомость называет неизвестный остаток, а старый отчёт не выдумывает причин', async () => {
  const { before, after } = await example();
  after.prevResources = null;
  after.resources = { ...after.resources, economy: 52, military: 62 };
  after.lastTurn = { ...after.lastTurn!, sources: { economy: [['решение', -5]] } };
  const parts = ledgerParts(quarterLedger(before, after));
  assert.match(parts.details[0], /ваша резолюция: −5\nне расписано в ведомости: −3$/);
  assert.match(parts.details[1], /Силовики: 60 → 62 \(\+2\)\nне расписано в ведомости: \+2$/);
  delete after.lastTurn.sources;
  assert.deepEqual(ledgerParts(quarterLedger(before, after)), { summary: parts.summary, details: [] });
  assert.deepEqual(ledgerParts(parts.summary), { summary: parts.summary, details: [] });
});

test('опасно низкая опора остаётся в видимой сводке, подробности идут отдельно', async () => {
  const { before, after } = await example();
  after.resources = { ...after.resources, economy: 15 };
  after.lastTurn = { ...after.lastTurn!, sources: { economy: [['решение', -45]] } };
  assert.equal(ledgerParts(quarterLedger(before, after)).summary, 'К концу квартала: экономика −45. Опасно мало: экономика — 15.');
  assert.ok(!ledgerParts(quarterLedger(before, { ...after, ended: true })).summary.includes('Опасно мало'));
});

test('на границе 100 ведомость показывает фактическую прибавку, а не обещанный эффект', async () => {
  const { before } = await example();
  const state: GameState = { ...before, resources: { ...before.resources, economy: 98 },
    currentEvent: { ...before.currentEvent!, choices: [{ id: 'grant', text: 'Принять средства', hint: '', tags: [], resolvesCrisis: null,
      deal: { pure: true, res: { economy: 20 } } }] } };
  const after = resolveTurn(state, 'grant', narration);
  const economy = ledgerParts(quarterLedger(state, after)).details.find(detail => detail.startsWith('Экономика:'))!;
  assert.match(economy, /ваша резолюция: \+2(?:\n|$)/);
  assert.ok(!economy.includes('+20'));
});

test('уже оплаченное личное поручение входит в итог ровно один раз', async () => {
  const { after: original } = await example();
  const ready = { ...original, ended: false, pending: [], activeCrises: [],
    keyFigures: original.keyFigures.map(figure => ({ ...figure, relation: 30 })),
    advisors: original.advisors.map(advisor => ({ ...advisor, loyalty: 100 })) };
  const option = initiativeOptions(ready).find(entry => entry.id === 'advance:domestic')!;
  assert.ok(!option.blocked);
  const signed = confirmInitiative(ready, option.id);
  const label = initiativeTurnSources(signed)[0].label;
  const before = await nextCase(signed);
  const after = await signOption(before, firstStep(before).options[0].key);
  const parts = ledgerParts(quarterLedger(before, after));
  for (const key of RESOURCE_KEYS.filter(key => option.immediate[key])) {
    assert.equal(after.prevResources![key], ready.resources[key]);
    const detail = parts.details.find(detail => detail.startsWith(`${RESOURCE_TITLE[key]}:`))!;
    assert.ok(detail.startsWith(`${RESOURCE_TITLE[key]}: ${ready.resources[key]} → ${after.resources[key]}`));
    assert.equal(detail.split('\n').filter(line => line.startsWith(`${label}:`)).length, 1);
  }
  assert.deepEqual(signed.resources, before.resources, 'чтение ведомости не оплачивает поручение заново');
});

test('на настоящих кварталах разных партий все слагаемые сходятся с итогом', async () => {
  let quarters = 0;
  for (const [seed, diff] of [[1, 'debut'], [7, 'coalition'], [21, 'crisis']] as const) {
    let state = await newTerm(startFromSeed(seed, diff));
    while (!state.ended && state.turn < 8) {
      const before = await nextCase(state);
      const step = firstStep(before);
      state = step.kind === 'press' ? await signPress(before, before.currentEvent!.press!.questions.map(() => 0))
        : step.kind === 'call-approach' ? await signCall(before, 'numbers', 'deal') : await signOption(before, step.options[0].key);
      const parts = ledgerParts(quarterLedger(before, state));
      for (const detail of parts.details) {
        const [heading, ...lines] = detail.split('\n');
        const key = RESOURCE_KEYS.find(key => heading.startsWith(`${RESOURCE_TITLE[key]}:`)) as ResourceKey;
        const total = lines.reduce((sum, line) => {
          const match = line.match(/: ([+−])(\d+)$/)!;
          assert.ok(match, `число в строке «${line}»`);
          return sum + Number(match[2]) * (match[1] === '−' ? -1 : 1);
        }, 0);
        assert.equal(total, state.resources[key] - state.prevResources![key], `${seed}/${diff}/${state.turn}/${key}`);
      }
      quarters++;
    }
  }
  assert.ok(quarters >= 15, `${quarters} кварталов`);
});

test('слагаемые остаются в существующей строке сохранения после открытия следующего дела', async () => {
  const { before, after } = await example();
  const lines = quarterLines(before, after, EMPTY_PERSONAL).lines;
  const ledger = lines.find(line => line.kind === 'ledger')!;
  const game = await nextCase(after);
  assert.equal(game.lastTurn, null);
  const snapshot = { start: startFromSeed(7), game, shown: lines, queue: [], step: firstStep(game), picks: [],
    form: null, stop: null, stops: {}, memory: EMPTY_PERSONAL, visibleResources: game.resources, page: null, rivals: null, over: false };
  const restored = parseChronicle(encodeChronicle(snapshot));
  assert.ok(restored);
  assert.equal(restored.shown.find(line => line.kind === 'ledger')?.text, ledger.text);
  assert.deepEqual(Object.keys(ledger).sort(), ['date', 'id', 'kind', 'text']);
});
