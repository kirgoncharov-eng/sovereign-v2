import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom } from '../game/engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld, livingActions } from '../game/living-world.ts';
import { firstOrderLesson } from './first-order.ts';
import { parseSave } from './save.ts';
import { SAVE_VERSION } from '../game/data.ts';
import type { GameState } from '../game/types.ts';

async function fresh() {
  return openLivingWorld(createInitialState('Украина','debut','pragmatist',await classicApi.setup('Украина','debut','pragmatist',15),seededRandom(15)));
}
function quarter(gs: GameState): GameState {
  const result = stepLivingWorld(gs, gs.turn + 1), resources = { ...gs.resources };
  for (const [key, value] of Object.entries(result.res)) resources[key as keyof typeof resources] = Math.max(0, Math.min(100, resources[key as keyof typeof resources] + value!));
  return { ...gs, world: result.world, resources, turn: gs.turn + 1, lastTurn: null };
}
const restore = (gs: GameState) => parseSave(JSON.stringify({version:SAVE_VERSION,screen:'game',state:gs}))!.state;

test('обучение проходит через настоящую подпись и доклад; чтение не меняет мир или цену', async () => {
  const initial = await fresh(); assert.equal(firstOrderLesson(initial),null);
  const start = quarter(initial); assert.equal(firstOrderLesson(start)?.phase,'assign');
  const original = JSON.stringify(start); firstOrderLesson(start); assert.equal(JSON.stringify(start),original);
  const signed = interveneWorld(start,'health:appoint:healthMinister');
  assert.equal(firstOrderLesson(signed)?.phase,'signed'); assert.equal(signed.turn,start.turn);
  assert.equal(signed.world!.health!.progress,0); assert.equal(signed.resources.economy,start.resources.economy-4);
  assert.equal(firstOrderLesson(restore(signed))?.phase,'signed');
  const report = quarter(signed), before = JSON.stringify(report);
  assert.equal(firstOrderLesson(report)?.phase,'report'); assert.equal(JSON.stringify(report),before);
  assert.ok(report.world!.dispatches.some(item=>item.project==='health'&&item.kind==='report'&&item.turn===report.turn));
  assert.equal(firstOrderLesson(restore(report))?.phase,'report');
  assert.ok(livingActions(report).some(action=>action.id==='health:fund'&&!action.blocked));
  const adjusted = interveneWorld(report,'health:fund'); assert.equal(firstOrderLesson(adjusted),null);
  assert.equal(adjusted.turn,report.turn); assert.equal(adjusted.resources.economy,report.resources.economy-4);
  assert.equal(firstOrderLesson(restore(adjusted)),null);
});

test('сохранение текущего плана не расходует поручение; отложенное назначение не блокирует игру', async () => {
  const start = quarter(await fresh());
  const ignored = quarter(start); assert.equal(ignored.world!.health!.executor,null); assert.equal(firstOrderLesson(ignored)?.phase,'assign');
  const signed = interveneWorld(start,'health:appoint:doctor'), report = quarter(signed);
  assert.equal(report.world!.lastActionTurn,signed.turn);
  const kept = quarter(report); assert.equal(kept.world!.health!.executor,'doctor'); assert.equal(firstOrderLesson(kept),null);
  assert.equal(kept.world!.lastActionTurn,signed.turn); assert.ok(kept.world!.health!.progress>report.world!.health!.progress);
});

test('чужое поручение и недостаток ресурсов не предлагают невозможное назначение', async () => {
  const start = quarter(await fresh());
  const energy = interveneWorld(start,'appoint:minister'); assert.equal(firstOrderLesson(energy)?.phase,'wait');
  assert.equal(firstOrderLesson(quarter(energy))?.phase,'assign');
  const poor = {...start,resources:{...start.resources,economy:6}};
  assert.equal(firstOrderLesson(poor)?.phase,'blocked'); assert.ok(livingActions(poor).filter(action=>action.id.startsWith('health:appoint:')).every(action=>action.blocked));
});

test('дело дня, финал, поздние и старые программы не получают выдуманного первого доклада', async () => {
  const start = quarter(await fresh());
  assert.equal(firstOrderLesson({...start,daily:'2026-10-08'}),null);
  assert.equal(firstOrderLesson({...start,ended:true}),null);
  assert.equal(firstOrderLesson({...start,turn:5}),null);
  const old = {...start,world:{...start.world!,health:{...start.world!.health!,status:'running' as const,executor:'doctor' as const}}};
  assert.equal(firstOrderLesson(old),null);
});
