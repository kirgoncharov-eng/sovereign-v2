import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classicApi} from './classic.ts';
import {createInitialState, planTurn, resolveTurn, seededRandom, startEvent} from './engine.ts';
import {openLivingWorld,interveneWorld,livingActions,stepLivingWorld,validLivingWorld} from './living-world.ts';
import {personProfiles} from '../client/people-text.ts';
import {parseSave} from '../client/save.ts';
import {SAVE_VERSION} from './data.ts';
import type {GameState} from './types.ts';
const fresh=async(country='Украина')=>{
 const s=createInitialState(country,'debut','pragmatist',await classicApi.setup(country,'debut','pragmatist',15),seededRandom(15));
 return {...s,factions:s.factions.map(f=>({...f,relation:30})),resources:{...s.resources,economy:70,internalLegitimacy:70}};
};
const tick=(s:GameState)=>{const r=stepLivingWorld(s,s.turn+1);return {...s,world:r.world,turn:s.turn+1,lastTurn:null} as GameState;};
const event={title:'Заседание',source:'Кабинет',description:'Обычное заседание кабинета.',isCritical:false,affectedFactions:[],choices:[{id:'a',text:'Завершить заседание',hint:'',tags:[],resolvesCrisis:null,deal:{pure:true},scene:'Заседание завершено.'}],randomEvent:null};

test('открытие страны свободно, детерминировано и создаёт разных людей; дело дня не изменяется',async()=>{
 for(const country of ['Беларусь','Украина','Грузия','Молдова','Армения','Казахстан']){
  const s=await fresh(country);const w=openLivingWorld(s);assert.deepEqual(w.resources,s.resources);assert.equal(w.turn,s.turn);assert.deepEqual(openLivingWorld(s).world,w.world);assert.equal(openLivingWorld(w),w);
  const all=[s.leader.name,...s.advisors.map(a=>a.name),...s.keyFigures.map(f=>f.name)];
  const newPeople=w.world!.people.filter(p=>!p.figure);assert.ok(newPeople.every(p=>!all.includes(p.name)));assert.equal(new Set(w.world!.people.map(p=>p.name)).size,5);assert.ok(validLivingWorld(w.world));
  const daily={...s,daily:'2026-10-08'};assert.equal(openLivingWorld(daily),daily);
 }
});
test('личное поручение имеет цену, не переводит ход и доступно только раз в квартал',async()=>{
 const s=openLivingWorld(await fresh());const a=interveneWorld(s,'appoint:minister');assert.equal(a.turn,s.turn);assert.equal(a.resources.economy,s.resources.economy-4);assert.equal(a.resources.politicalCapital,s.resources.politicalCapital-2);
 assert.throws(()=>interveneWorld(a,'visit'),/уже использовано/);const next=tick(a);assert.ok(livingActions(next).some(a=>!a.blocked));

 assert.throws(()=>interveneWorld({...next,daily:'2026-10-08'},'visit'),/деле дня/);
 assert.throws(()=>interveneWorld({...next,resources:{...next.resources,politicalCapital:5}},'retender'),/Недостаточно/);
});
test('доклад показывает выполненную работу; выбор поставщика доступен без поиска ошибки',async()=>{
 const s=tick(interveneWorld(openLivingWorld(await fresh()),'appoint:minister'));
 assert.equal(s.world!.project.reported,s.world!.project.progress);assert.ok(!livingActions(s).some(a=>a.id==='inspect'));assert.ok(livingActions(s).some(a=>a.id==='retender'&&!a.blocked));
 const repaired=interveneWorld(s,'retender');assert.ok(stepLivingWorld(repaired,2).world!.project.progress>stepLivingWorld(s,2).world!.project.progress);assert.ok(repaired.factions.some((f,i)=>f.relation<s.factions[i].relation));
 const completed=tick(tick(tick(repaired)));assert.equal(completed.world!.project.status,'completed');const settled=stepLivingWorld(completed,completed.turn+1);assert.deepEqual(settled.res,{});assert.equal(settled.story,null);
 const bargain=interveneWorld(s,'negotiate');assert.ok(bargain.factions.some((f,i)=>f.relation>s.factions[i].relation));assert.ok(!livingActions(bargain).some(a=>a.id==='retender'));
});
test('бездействие и незавершённое исполнение дают разные исходы; информация переживает сохранение',async()=>{
 const base=openLivingWorld(await fresh());let ignored=base,blind=interveneWorld(base,'appoint:minister');for(let i=0;i<4;i++){ignored=tick(ignored);blind=tick(blind);}
 assert.equal(ignored.world!.project.status,'failed');assert.equal(blind.world!.project.status,'partial');
 const save=JSON.stringify({version:SAVE_VERSION,screen:'game',state:blind});assert.deepEqual(parseSave(save)?.state.world,blind.world);
 const invalid=JSON.parse(save);invalid.state.world.project.executor='ghost';assert.equal(parseSave(JSON.stringify(invalid)),null);
 const legacy={...base};delete legacy.world;assert.ok(parseSave(JSON.stringify({version:SAVE_VERSION,screen:'game',state:legacy})));
});
test('компетенция, лояльность, местные группы, деньги и передача дел имеют разные эффекты',async()=>{
 let base=interveneWorld(openLivingWorld(await fresh()),'appoint:engineer');
 const low={...base,world:{...base.world!,people:base.world!.people.map(a=>a.id==='engineer'?{...a,competence:1 as const}:a)}};
 assert.ok(stepLivingWorld(base,1).world!.project.progress>stepLivingWorld(low,1).world!.project.progress);
 const hostile={...base,world:{...base.world!,people:base.world!.people.map(a=>a.id==='engineer'?{...a,relation:-40}:a)}};
 assert.ok(stepLivingWorld(base,1).world!.project.progress>stepLivingWorld(hostile,1).world!.project.progress);
 const groups={...base,factions:base.factions.map(f=>f.bloc==='business'?{...f,relation:-50}:f)};
 assert.ok(stepLivingWorld(base,1).world!.project.progress>stepLivingWorld(groups,1).world!.project.progress);
 base=tick(base);assert.ok(livingActions(base).some(a=>a.id==='retender'));
 const funded=interveneWorld(base,'fund');assert.ok(stepLivingWorld(funded,2).world!.project.progress>stepLivingWorld(base,2).world!.project.progress);
 const changed=interveneWorld(base,'replace:minister');assert.ok(stepLivingWorld(changed,2).world!.project.lastFactors.includes('Передача дел новому руководителю'));
});
test('дело развивается при обычных решениях, входит в повествование и меняет ресурсы ровно один раз',async()=>{
 let s=openLivingWorld(await fresh());
 for(let i=0;i<4;i++){s=startEvent(s,event);const text=await classicApi.consequence(s,'a');assert.ok(text.narrative.includes('Из промышленного региона'));const plan=planTurn(s,'a');s=resolveTurn(s,'a',text);assert.equal(s.world!.lastTick,s.turn);assert.deepEqual(s.world,plan.world);}
 assert.equal(s.world!.project.status,'failed');assert.deepEqual(s.lastTurn!.sources!.economy!.find(([label])=>label==='энергосеть промышленного региона'),['энергосеть промышленного региона',-4]);
 assert.ok(s.lastTurn!.narrative.includes('не принимает сеть'));
 s=startEvent(s,event);const next=planTurn(s,'a');assert.equal(next.worldStory,null);assert.ok(!next.sources.economy?.some(([label])=>label==='энергосеть промышленного региона'));
 const profile=personProfiles(s).find(p=>p.name===s.world!.people[0].name)!;assert.ok(profile.rows.some(r=>r.label==='Компетенция в проекте'));
});

test('после доклада доступно поручение нового квартала; переход и загрузка не дают вторую попытку',async()=>{
 let s=interveneWorld(openLivingWorld(await fresh()),'appoint:minister');s=startEvent(s,event);s=resolveTurn(s,'a',await classicApi.consequence(s,'a'));
 assert.ok(s.lastTurn);const next=interveneWorld(s,'retender');assert.equal(next.turn,s.turn);assert.equal(next.world!.lastTick,s.world!.lastTick);assert.equal(next.lastTurn!.narrative,s.lastTurn!.narrative);
 assert.equal(next.resources.economy,s.resources.economy-3);assert.ok(next.lastTurn!.sources!.economy!.some(([label,n])=>label.startsWith('поручение нового квартала')&&n===-3));assert.equal(s.world!.project.procurementFixed,false);
 assert.throws(()=>interveneWorld({...next,lastTurn:null},'fund'),/уже использовано/);
 const restored=parseSave(JSON.stringify({version:SAVE_VERSION,screen:'game',state:next}))!.state;assert.throws(()=>interveneWorld(restored,'fund'),/уже использовано/);
});
test('приоритет заводов и жилых районов меняет темп, повествование и итоговую пользу',async()=>{
 const s=tick(interveneWorld(openLivingWorld(await fresh()),'appoint:minister'));const industry=interveneWorld(s,'priority:industry'),homes=interveneWorld(s,'priority:households');
 const a=stepLivingWorld(industry,2),b=stepLivingWorld(homes,2);assert.ok(a.world!.project.progress>b.world!.project.progress);assert.ok(a.story!.includes('жилые районы ждут'));assert.ok(b.story!.includes('жилые районы'));
 const finish=(gs:GameState)=>stepLivingWorld({...gs,world:{...gs.world!,project:{...gs.world!.project,progress:99,procurementFixed:true}}},gs.turn+1);
 const x=finish(industry),y=finish(homes);assert.equal(x.world!.project.status,'completed');assert.equal(y.world!.project.status,'completed');assert.ok(x.res.economy!>y.res.economy!);assert.ok(x.res.internalLegitimacy!<y.res.internalLegitimacy!);
 const legacy={...s,world:{...s.world!,project:{...s.world!.project}}};delete legacy.world.project.priority;assert.ok(validLivingWorld(legacy.world));assert.ok(stepLivingWorld(legacy,2).story);
});

test('две программы делят поручение и бюджет; назначенный в обе руководитель перегружен',async()=>{
 const base=openLivingWorld(await fresh());
 const energy=interveneWorld(base,'appoint:governor');
 assert.throws(()=>interveneWorld(energy,'health:appoint:governor'),/уже использовано/);
 const quarter=tick(energy);
 assert.ok(livingActions(quarter).find(a=>a.id==='health:appoint:governor')!.detail.includes('оба проекта'));
 const shared=interveneWorld(quarter,'health:appoint:governor');
 const separate={...shared,world:{...shared.world!,health:{...shared.world!.health!,executor:'healthMinister' as const},people:shared.world!.people.map(p=>p.id==='healthMinister'?{...p,competence:2 as const,relation:worldPersonForTest(shared).relation}:p)}};
 const a=stepLivingWorld(shared,2),b=stepLivingWorld(separate,2);
 assert.ok(a.world!.project.progress<b.world!.project.progress);
 assert.ok(a.world!.health!.lastFactors.some(f=>f.includes('делит время')));
 assert.equal(shared.resources.economy,base.resources.economy-8);
 assert.equal(shared.world!.health!.progress,0);
 assert.ok(validLivingWorld(a.world));
});
function worldPersonForTest(s:GameState){const person=s.world!.people.find(p=>p.id==='governor')!;return s.keyFigures.find(f=>f.id===person.figure)??person;}

test('больницы исполняются независимо, временные переводы оставляют отложенную цену ровно один раз',async()=>{
 let s=interveneWorld(openLivingWorld(await fresh()),'health:appoint:healthMinister');
 s=tick(s);s=interveneWorld(s,'health:approach:rotation');s=tick(tick(s));
 assert.equal(s.world!.health!.status,'completed');assert.equal(s.world!.project.status,'unassigned');
 assert.equal(s.world!.health!.followupTurn,5);
 s=tick(s);const debt=stepLivingWorld(s,5);
 assert.deepEqual(debt.effects.find(e=>e.label==='районные больницы')!.res,{economy:-2,internalLegitimacy:-2});
 assert.ok(debt.story!.includes('областных больниц'));assert.equal(debt.world!.health!.followupTurn,null);
 const after={...s,turn:5,world:debt.world};assert.equal(stepLivingWorld(after,6).story,null);
 assert.deepEqual(stepLivingWorld(after,5).effects,[]);
});

test('старое досье получает новую программу без сброса проекта, расходов и квартального ограничения',async()=>{
 const base=tick(interveneWorld(openLivingWorld(await fresh()),'appoint:minister'));
 const old={...base,world:{...base.world!,people:base.world!.people.filter(p=>['minister','governor','engineer'].includes(p.id)),dispatches:base.world!.dispatches.filter(d=>d.project!=='health')}};
 delete old.world.health;assert.ok(validLivingWorld(old.world));
 const restored=parseSave(JSON.stringify({version:SAVE_VERSION,screen:'game',state:old}))!.state;
 const upgraded=openLivingWorld(restored);assert.deepEqual(upgraded.world!.project,old.world.project);assert.deepEqual(upgraded.resources,old.resources);
 assert.equal(upgraded.world!.health!.deadline,old.turn+4);assert.equal(upgraded.world!.lastActionTurn,old.world.lastActionTurn);
 assert.equal(openLivingWorld(upgraded),upgraded);
 const malformed={...upgraded.world!,health:{...upgraded.world!.health!,executor:'engineer'}};assert.equal(validLivingWorld(malformed),false);
 assert.equal(validLivingWorld({...upgraded.world,health:null}),false);
 assert.equal(validLivingWorld({...upgraded.world,health:undefined}),false);
});
