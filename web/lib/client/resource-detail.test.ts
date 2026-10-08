import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from '../game/classic.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn } from '../game/engine.ts';
import { openLivingWorld, interveneWorld } from '../game/living-world.ts';
import { resourceDetail, ratingDetail, RESOURCE_ABOUT } from './resource-detail.ts';

const fresh = async () => createInitialState('Украина','debut','pragmatist',await classicApi.setup('Украина','debut','pragmatist',15),seededRandom(15));
test('легитимность и рейтинг различаются; высокое голосование не скрывает слабое признание власти',async()=>{
  const state=await fresh();const gs={...state,resources:{...state.resources,internalLegitimacy:18,economy:78},factions:state.factions.map(f=>({...f,relation:90}))};
  assert.equal(resourceDetail(gs,'internalLegitimacy').value,18);assert.ok(ratingDetail(gs).value>60);
  assert.ok(RESOURCE_ABOUT.internalLegitimacy.includes('Высокий рейтинг при низкой легитимности возможен'));
});
test('подсказка ресурса объясняет реальный результат, включая поручение нового квартала',async()=>{
  let gs=openLivingWorld(await fresh());gs=interveneWorld(gs,'appoint:minister');
  const event={title:'Заседание',source:'Кабинет',description:'Заседание кабинета.',isCritical:false,affectedFactions:[],choices:[{id:'a',text:'Завершить',hint:'',tags:[],resolvesCrisis:null,deal:{pure:true},scene:'Заседание завершено.'}],randomEvent:null};
  gs=startEvent(gs,event);gs=resolveTurn(gs,'a',await classicApi.consequence(gs,'a'));gs=interveneWorld(gs,'health:appoint:healthMinister');
  const detail=resourceDetail(gs,'economy');assert.equal(detail.delta,gs.resources.economy-gs.prevResources!.economy);
  assert.ok(detail.changes.some(([label,delta])=>label.includes('поручение нового квартала')&&delta===-4));
  assert.equal(detail.changes.reduce((sum,[,delta])=>sum+delta,0),detail.delta);
});
test('последующая цена врачебных переводов видна до списания и исчезает после исполнения',async()=>{
  const gs=openLivingWorld(await fresh());gs.world!.health={...gs.world!.health!,status:'completed',executor:'healthMinister',approach:'rotation',progress:100,followupTurn:6};gs.turn=4;
  const economy=resourceDetail(gs,'economy'),legit=resourceDetail(gs,'internalLegitimacy');
  assert.ok(economy.upcoming.some(item=>item.delta===-2&&item.text.includes('областных больницах')));
  assert.ok(legit.upcoming.some(item=>item.delta===-2));
  gs.world!.health!.followupTurn=null;assert.equal(resourceDetail(gs,'economy').upcoming.length,0);
});
