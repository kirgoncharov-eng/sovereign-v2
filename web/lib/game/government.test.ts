import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom, startEvent } from './engine.ts';
import { openLivingWorld, livingActions, interveneWorld, stepLivingWorld } from './living-world.ts';
import { governmentReviewEvent, governmentLoad, governmentProject, PROJECTS } from './government.ts';
import { presidentialMessages, readPresidentialMessages, messageUnread } from '../client/presidential-inbox.ts';
import { parseSave } from '../client/save.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';
async function base(country='Украина') {return openLivingWorld(createInitialState(country,'debut','pragmatist',await classicApi.setup(country,'debut','pragmatist',11),seededRandom(11)));}
function tick(gs: GameState): GameState {
  const result=stepLivingWorld(gs,gs.turn+1),resources={...gs.resources};
  for(const [key,delta] of Object.entries(result.res))resources[key as keyof typeof resources]=Math.max(0,Math.min(100,resources[key as keyof typeof resources]+delta!));
  return {...gs,world:result.world,turn:gs.turn+1,lastTurn:null,resources};
}
const save=(gs:GameState)=>JSON.stringify({version:SAVE_VERSION,screen:'game',state:gs});
test('five proposals use real projects; legacy saves migrate without grants, deadlines or clock changes',async()=>{
  const gs=await base();assert.equal(PROJECTS.length,5);assert.equal(governmentProject(gs.world!,'energy'),gs.world!.project);assert.equal(governmentProject(gs.world!,'health'),gs.world!.health);
  const old={...gs,world:{...gs.world!,government:undefined}};assert.ok(parseSave(save(old)));
  const migrated=openLivingWorld(old);assert.deepEqual(migrated.resources,gs.resources);assert.equal(migrated.turn,0);assert.equal(migrated.world!.project.deadline,gs.world!.project.deadline);assert.equal(migrated.world!.government!.programs.length,3);
  assert.equal(openLivingWorld({...old,daily:'2026-10-09'}).world!.government,undefined);
});
test('delegation costs once, advances only with time, and competes with existing attention and cabinet capacity',async()=>{
  const gs=await base(),before=JSON.stringify(gs),signed=interveneWorld(gs,'government:start:exports');
  assert.equal(JSON.stringify(gs),before);assert.equal(signed.turn,0);assert.equal(governmentProject(signed.world!,'exports').progress,0);assert.equal(signed.resources.economy,gs.resources.economy-5);
  assert.throws(()=>interveneWorld(signed,'health:appoint:doctor'),/уже использовано/);
  const first=tick(signed);assert.ok(governmentProject(first.world!,'exports').progress>0);
  const second=interveneWorld(first,'health:appoint:healthMinister');assert.equal(governmentLoad(second.world!),2);
  const third=tick(second);assert.match(livingActions(third).find(a=>a.id==='government:start:housing')!.blocked!,/две программы/);assert.match(livingActions(third).find(a=>a.id==='appoint:minister')!.blocked!,/две программы/);
  assert.throws(()=>interveneWorld(third,'government:start:housing'),/две программы/);
});
test('risk follows real competence, external trust and opposition, not a renamed random outcome',async()=>{
  const gs=await base();
  const high={...gs,advisors:gs.advisors.map(a=>a.id==='diplomat'?{...a,skill:3 as const}:a),resources:{...gs.resources,economy:60,externalReputation:60},factions:gs.factions.map(f=>({...f,relation:60}))};
  const low={...high,advisors:high.advisors.map(a=>a.id==='diplomat'?{...a,skill:1 as const}:a),resources:{...high.resources,economy:20,externalReputation:20}};
  const best=tick(interveneWorld(high,'government:start:exports')),worst=tick(interveneWorld(low,'government:start:exports'));
  assert.ok(governmentProject(best.world!,'exports').progress>governmentProject(worst.world!,'exports').progress);
  assert.ok(governmentProject(worst.world!,'exports').lastFactors.some(f=>f.includes('внешнее доверие')));
  assert.deepEqual(stepLivingWorld(best,best.turn+1),stepLivingWorld(best,best.turn+1));
});
test('one personal priority really speeds work, costs time each quarter and changes public responsibility',async()=>{
  let gs=tick(interveneWorld(await base(),'government:start:exports'));
  const ordinary=tick(gs),focused=tick(interveneWorld(gs,'government:priority:exports'));
  assert.equal(governmentProject(focused.world!,'exports').progress,governmentProject(ordinary.world!,'exports').progress+5);
  assert.equal(focused.resources.personalResource,ordinary.resources.personalResource-3);
  const next=tick(focused);assert.equal(next.resources.personalResource,focused.resources.personalResource-1);
  const released=interveneWorld(focused,'government:release');assert.equal(released.world!.government!.priority,null);assert.equal(released.resources.internalLegitimacy,focused.resources.internalLegitimacy-2);assert.equal(governmentProject(released.world!,'exports').status,'running');
  const low={...focused,resources:{...focused.resources,personalResource:4}};const tired=tick(low);assert.equal(tired.resources.personalResource,4);assert.ok(!governmentProject(tired.world!,'exports').lastFactors.some(f=>f.includes('Личный приоритет')));
  gs=focused;while(gs.turn<5)gs=tick(gs);assert.equal(gs.world!.government!.priority,null);assert.ok(parseSave(save(gs)));
});
test('priority affects existing energy and hospitals too; swapping priority records its political price',async()=>{
  let gs=tick(interveneWorld(await base(),'appoint:minister'));gs=tick(interveneWorld(gs,'health:appoint:healthMinister'));
  const normal=tick(gs),focused=tick(interveneWorld(gs,'government:priority:health'));assert.equal(focused.world!.health!.progress,Math.min(100,normal.world!.health!.progress+5));
  if(focused.world!.health!.status==='running'){
    const switched=interveneWorld(focused,'government:priority:energy');assert.equal(switched.world!.government!.priority,'energy');assert.equal(switched.resources.internalLegitimacy,focused.resources.internalLegitimacy-2);
  }
});
test('messages distinguish read from action, survive saves and become unread only on new facts',async()=>{
  const gs=await base(),message=presidentialMessages(gs).find(m=>m.key==='sponsor')!;assert.ok(messageUnread(gs,message));
  const read=readPresidentialMessages(gs,message.person);assert.equal(messageUnread(read,presidentialMessages(read).find(m=>m.key==='sponsor')!),false);assert.equal(read.world!.sponsor!.phase,'offered');assert.deepEqual(read.resources,gs.resources);assert.equal(read.turn,gs.turn);assert.equal(read.world!.lastActionTurn,null);assert.equal(readPresidentialMessages(read,message.person),read);assert.ok(parseSave(save(read)));
  const later=tick(tick(read)),changed=presidentialMessages(later).find(m=>m.key==='sponsor')!;assert.ok(messageUnread(later,changed));assert.equal(changed.needsReply,true);assert.equal(later.world!.sponsor!.phase,'pressuring');
  assert.deepEqual(presidentialMessages({...gs,daily:'2026-10-09'}),[]);
});
test('program results publish without a main quarter, repeat rewards or a required reply',async()=>{
  let gs=interveneWorld(await base(),'government:start:housing');for(let i=0;i<4;i++)gs=tick(gs);
  assert.equal(gs.world!.government!.programs.find(p=>p.id==='housing')!.reviewed,true);
  assert.equal(governmentReviewEvent(gs),null);
  assert.equal(gs.world!.government!.housingNext!.status,'proposed');
  const message=presidentialMessages(gs).find(m=>m.key==='program:housing')!;
  assert.ok(message.text.includes(`${governmentProject(gs.world!,'housing').progress}%`));
  assert.equal(message.needsReply,false);assert.ok(messageUnread(gs,message));
  const read=readPresidentialMessages(gs,message.person);
  assert.deepEqual(read.resources,gs.resources);assert.equal(read.turn,gs.turn);
  assert.equal(messageUnread(read,presidentialMessages(read).find(m=>m.key==='program:housing')!),false);
  const routed=await classicApi.event({...gs,arc:null});assert.ok(!routed.cardId?.startsWith('government-review:'));
  const after=stepLivingWorld(gs,gs.turn+1);
  assert.equal(after.effects.some(e=>e.label==='программа «Жилищная программа»'),false);
  assert.equal(after.world!.dispatches.filter(d=>d.id.includes('housing-next:proposal')).length,1);
  assert.ok(parseSave(save(read)));
});
test('an old pending presentation migrates to messages without spending time or granting resources',async()=>{
  let gs=interveneWorld(await base(),'government:start:housing');for(let i=0;i<4;i++)gs=tick(gs);
  gs=structuredClone(gs);gs.world!.government!.programs.find(p=>p.id==='housing')!.reviewed=false;
  delete gs.world!.government!.housingNext;
  gs=startEvent(gs,governmentReviewEvent(gs)!);
  const source=JSON.stringify(gs),parsed=parseSave(save(gs))!.state,migrated=openLivingWorld(parsed);
  assert.equal(JSON.stringify(gs),source);assert.equal(migrated.currentEvent,null);
  assert.deepEqual(migrated.resources,gs.resources);assert.equal(migrated.turn,gs.turn);
  assert.equal(migrated.world!.government!.housingNext!.status,'proposed');
  assert.ok(presidentialMessages(migrated).some(m=>m.key==='program:housing'));
  assert.deepEqual(openLivingWorld(migrated),migrated);assert.ok(parseSave(save(migrated)));
});
test('government and notification saves reject corruption; work does not run twice after reload',async()=>{
  let gs=interveneWorld(await base(),'government:start:procurement');
  for(let i=0;i<6;i++){assert.ok(parseSave(save(gs)));assert.deepEqual(stepLivingWorld(gs,gs.turn).world,gs.world);gs=tick(gs);}
  for(const mutate of [(s:GameState)=>{s.world!.government!.programs[0].progress=101;},(s:GameState)=>{s.world!.government!.programs[0].due=-1;},(s:GameState)=>{s.world!.inboxRead={'sponsor':8 as unknown as string};}]){const copy=structuredClone(gs);mutate(copy);assert.equal(parseSave(save(copy)),null);}
});

test('targeted presidential support removes a real obstacle once and leaves other programs unchanged',async()=>{
  let gs=await base();gs={...gs,resources:{...gs.resources,externalReputation:20},factions:gs.factions.map(f=>({...f,relation:-5}))};
  gs=tick(interveneWorld(gs,'government:start:exports'));
  const normal=tick(gs),signed=interveneWorld(gs,'government:support:exports'),helped=tick(signed);
  assert.equal(signed.resources.politicalCapital,gs.resources.politicalCapital-3);
  assert.equal(signed.resources.personalResource,gs.resources.personalResource-2);
  assert.equal(governmentProject(signed.world!,'exports').progress,governmentProject(gs.world!,'exports').progress);
  assert.ok(governmentProject(helped.world!,'exports').progress>governmentProject(normal.world!,'exports').progress);
  assert.ok(!governmentProject(helped.world!,'exports').lastFactors.some(f=>f.includes('внешнее доверие')||f.includes('Бизнес не поддерживает')));
  assert.ok(!livingActions(helped).some(a=>a.id==='government:support:exports'));
  assert.equal(governmentProject(helped.world!,'housing').progress,0);assert.ok(parseSave(save(helped)));
});
