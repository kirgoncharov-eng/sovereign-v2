import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi, budgetEvent, callEvent, pressEvent } from './classic.ts';
import { calendarSlot } from './political-calendar.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from './engine.ts';
import { openLivingWorld, interveneWorld, stepLivingWorld } from './living-world.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';
async function base(): Promise<GameState> {
  const gs = openLivingWorld(createInitialState('Украина','debut','pragmatist',await classicApi.setup('Украина','debut','pragmatist',11),seededRandom(11)));
  return {...gs,arc:null};
}
const save = (gs: GameState) => JSON.stringify({version:SAVE_VERSION,screen:'game',state:gs});
const tick = (gs: GameState): GameState => ({ ...gs, turn: gs.turn + 1, world: stepLivingWorld(gs, gs.turn + 1).world });
test('urgent political conflict takes precedence; delayed budget survives a save and resolves once',async()=>{
  let gs=tick(interveneWorld(await base(),'appoint:minister'));
  gs=interveneWorld(gs,'minister:accept');
  while(gs.turn<6)gs=tick(gs);
  gs=tick(interveneWorld(gs,'government:start:housing'));
  gs.usedEvents=['ins:4:completed'];
  const event=await classicApi.event(gs);assert.equal(event.cardId,'minister-public:signature');
  const result=resolveTurn(startEvent(gs,event),'b',await classicApi.consequence(startEvent(gs,event),'b'));
  const loaded=parseSave(save(result))!.state;
  const next=await classicApi.event(loaded);assert.equal(next.cardId,'budget:8');
  assert.equal(next.special?.kind,'budget');
  const current=startEvent(loaded,next);
  assert.equal(budgetEvent({...current,turn:9}),null);
  const after=resolveTurn(current,'b',await classicApi.consequence(current,'b'));
  assert.equal((await classicApi.event(after)).special?.kind,'press');
});
test('a delayed call retains its calendar identity and does not repeat after reload',async()=>{
  let gs=await base();while(gs.turn<11)gs=tick(gs);
  const event=callEvent(gs)!;assert.ok(event.call);assert.ok(event.cardId.startsWith('call:11:'));
  const current=startEvent(gs,event),loaded=parseSave(save(current))!.state;
  assert.equal(callEvent({...loaded,turn:12}),null);
  assert.ok(callEvent({...loaded,turn:16})?.cardId.startsWith('call:17:'));
});
test('pre-election windows expire; the next term has its own absolute calendar keys',async()=>{
  const gs=await base();
  assert.equal(budgetEvent({...gs,turn:10}),null);
  assert.equal(pressEvent({...gs,turn:10}),null);
  assert.equal(calendarSlot({...gs,turn:20},'budget',[8],[10]),null);
  assert.equal(calendarSlot({...gs,turn:27,usedEvents:['budget:8']},'budget',[8],[10]),28);
  assert.equal(calendarSlot({...gs,turn:28,usedEvents:['budget:28']},'budget',[8],[10]),null);
});
test('daily replay keeps the exact calendar instead of gaining overdue events',async()=>{
  const gs={...await base(),daily:'2026-10-09'};
  assert.equal(calendarSlot({...gs,turn:8},'budget',[8],[10]),null);
  assert.equal(calendarSlot({...gs,turn:7},'budget',[8],[10]),8);
});
