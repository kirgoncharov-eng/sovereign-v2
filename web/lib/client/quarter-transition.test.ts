import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from '../game/engine.ts';
import { openLivingWorld, interveneWorld } from '../game/living-world.ts';
import { quarterTransition } from './quarter-transition.ts';
import { turnDate } from '../game/calendar.ts';
import { COUNTRIES } from '../game/data.ts';
import type { GameState } from '../game/types.ts';

async function fresh(): Promise<GameState> {
  const state = openLivingWorld(createInitialState('Украина','debut','pragmatist',await classicApi.setup('Украина','debut','pragmatist',15),seededRandom(15)));
  return startEvent(state, await classicApi.event(state));
}
async function decide(state: GameState): Promise<GameState> {
  const choice = state.currentEvent!.choices[0].id;
  return resolveTurn(state, choice, await classicApi.consequence(state, choice));
}

test('переход следует настоящему кварталу, не меняет игру и не возникает при повторном показе отчёта', async () => {
  const before = await fresh(), after = await decide(before);
  const snapshot = JSON.stringify([before, after]), scene = quarterTransition(before, after)!;
  assert.equal(scene.kind,'country'); assert.equal(scene.duration,1000);
  assert.equal(scene.before.season,turnDate(before.seed,COUNTRIES[before.country].startYear,before.turn).season);
  assert.equal(scene.after.season,turnDate(after.seed,COUNTRIES[after.country].startYear,after.turn).season);
  assert.equal(JSON.stringify([before, after]),snapshot);
  assert.equal(quarterTransition(after,after),null);
  assert.equal(quarterTransition(before,{...after,lastTurn:null}),null);
});

test('работа больниц показывается только по новому докладу: реальные ставки, без повторной цены', async () => {
  const before = interveneWorld(await fresh(),'health:appoint:doctor'), after = await decide(before);
  const snapshot = JSON.stringify([before,after]), scene = quarterTransition(before,after)!;
  assert.equal(scene.kind,'hospital'); assert.equal(scene.duration,1600);
  assert.equal(scene.staffing,after.world!.health!.progress); assert.ok(scene.staffing>0);
  assert.ok(scene.detail.includes(`0% → ${scene.staffing}%`));
  assert.equal(JSON.stringify([before,after]),snapshot);
  const stale = {...after,world:{...after.world!,dispatches:before.world!.dispatches}};
  assert.equal(quarterTransition(before,stale)?.kind,'country');
});

test('ежедневное дело, падение власти и выборы сохраняют собственный темп; скрытая энергосеть не раскрывается', async () => {
  const before = await fresh(), after = await decide(before);
  assert.equal(quarterTransition(before,{...after,daily:'2026-10-08'}),null);
  assert.equal(quarterTransition(before,{...after,ended:true}),null);
  assert.equal(quarterTransition(before,{...after,lastTurn:{...after.lastTurn!,election:{turn:after.turn,kind:'president',leader:50,top:{id:'opposition',name:'Оппозиция',share:30},outcome:'won'}}}),null);
  const energy = {...after,world:{...after.world!,project:{...after.world!.project,progress:80,reported:20}}};
  const scene = quarterTransition(before,energy)!;
  assert.equal(scene.kind,'country'); assert.equal(scene.staffing,0);
  assert.ok(!JSON.stringify(scene).includes('80%'));
});
