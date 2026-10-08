import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicApi } from './classic.ts';
import { createInitialState, seededRandom, startEvent, resolveTurn, planTurn } from './engine.ts';
import { openLivingWorld, interveneWorld, livingActions, stepLivingWorld, validLivingWorld } from './living-world.ts';
import { parseSave } from '../client/save.ts';
import { resourceDetail } from '../client/resource-detail.ts';
import { SAVE_VERSION } from './data.ts';
import type { GameState } from './types.ts';
import type { HealthBranch, HealthResponse } from './health-aftermath.ts';

async function base() {
  const s = openLivingWorld(createInitialState('Украина','debut','pragmatist',await classicApi.setup('Украина','debut','pragmatist',15),seededRandom(15)));
  return { ...s, resources: { ...s.resources, economy: 70, internalLegitimacy: 70 }, factions: s.factions.map(f => ({ ...f, relation: 30 })) };
}
export function tick(s: GameState) {
  const r = stepLivingWorld(s, s.turn + 1);
  const resources = { ...s.resources };
  for (const [k, v] of Object.entries(r.res)) resources[k as keyof typeof resources] = Math.max(0, Math.min(100, resources[k as keyof typeof resources] + v!));
  return { ...s, resources, world: r.world, turn: s.turn + 1, lastTurn: null };
}
async function branch(kind: HealthBranch) {
  let s = await base();
  if (kind !== 'failure') {
    s = tick(interveneWorld(s,'health:appoint:healthMinister'));
    s = interveneWorld(s,kind === 'rotation' ? 'health:approach:rotation' : 'health:fund');
  }
  while (s.world!.health!.aftermath?.phase !== 'open') s = tick(s);
  assert.equal(s.world!.health!.aftermath!.branch,kind);
  return s;
}
const save = (s: GameState) => JSON.stringify({ version: SAVE_VERSION, screen: 'game', state: s });

test('три настоящих пути создают разные доклады и ответы с причиной и сроком; открытие не списывает выдуманный долг',async()=>{
  for (const kind of ['permanent','rotation','failure'] as const) {
    const s = await branch(kind), project = s.world!.health!, story = project.aftermath!;
    const reports = s.world!.dispatches.at(-1)!;
    assert.ok(reports.text.includes('Причина:'));assert.ok(reports.text.includes(story.cause));
    assert.equal(story.deadline,s.turn+2);assert.equal(project.followupTurn,null);
    const actions=livingActions(s).filter(a=>a.id.startsWith('health:response:'));
    assert.equal(actions.length,3);assert.ok(actions.every(a=>a.detail.includes('Доклад через два квартала')));
    assert.ok(validLivingWorld(s.world));assert.deepEqual(parseSave(save(s))?.state.world,s.world);
  }
});

test('все девять решений имеют цену, отложенный итог, сохранение и не повторяются при расчёте/загрузке',async()=>{
  const cases: [HealthBranch,HealthResponse[]][] = [['permanent',['payroll','lean','cuts']],['rotation',['replacement','return','mediate']],['failure',['pilot','audit','acknowledge']]];
  for (const [kind, responses] of cases) for (const response of responses) {
    const s=await branch(kind), before=JSON.stringify(s), original=s.world!.health!.progress;
    const chosen=interveneWorld(s,`health:response:${response}`);
    assert.equal(JSON.stringify(s),before,'исходный мир не мутирует');assert.equal(chosen.turn,s.turn);
    assert.equal(chosen.world!.health!.progress,original,'подпись не означает исполнение');
    assert.throws(()=>interveneWorld(chosen,`health:response:${response}`),/недоступно|использовано/);
    assert.deepEqual(parseSave(save(chosen))?.state.world,chosen.world);
    const midway=tick(chosen);assert.equal(midway.world!.health!.aftermath!.phase,'working');
    assert.deepEqual(parseSave(save(midway))?.state.world,midway.world);
    const unchanged=JSON.stringify(midway), result=stepLivingWorld(midway,midway.turn+1);
    assert.equal(JSON.stringify(midway),unchanged,'прогноз не меняет реальное поручение');
    assert.deepEqual(stepLivingWorld(midway,midway.turn+1),result);
    const end=tick(midway);assert.equal(end.world!.health!.aftermath!.phase,'settled');
    assert.ok(validLivingWorld(end.world));assert.deepEqual(parseSave(save(end))?.state.world,end.world);
    assert.equal(livingActions(end).filter(a=>a.id.startsWith('health:')).length,0);
    assert.deepEqual(stepLivingWorld(end,end.turn+1).res,{});assert.equal(stepLivingWorld(end,end.turn+1).story,null);
    if (response==='audit'||response==='acknowledge') assert.equal(end.world!.health!.progress,original,'объяснение/проверка не открывают больницы');
    if (response==='return'||response==='cuts'||response==='mediate') assert.ok(end.world!.health!.progress<original);
    if (response==='pilot') assert.ok(end.world!.health!.progress>original&&end.world!.health!.progress<100);
  }
});

test('бездействие имеет разные последствия; срок, предупреждение и однократная цена переживают сохранение',async()=>{
  for (const kind of ['permanent','rotation','failure'] as const) {
    const s=await branch(kind), forecast=resourceDetail(s,'internalLegitimacy');
    assert.ok(forecast.upcoming.some(item=>item.text.includes('Если не ответить')));
    const warning=tick(s);assert.equal(warning.world!.health!.aftermath!.phase,'open');
    const restored=parseSave(save(warning))!.state;
    const penalty=stepLivingWorld(restored,restored.turn+1);
    assert.equal(penalty.world!.health!.aftermath!.outcome,'neglected');
    assert.ok(penalty.res.internalLegitimacy!<0);
    const end=tick(restored);assert.deepEqual(stepLivingWorld(end,end.turn).effects,[]);
    assert.deepEqual(stepLivingWorld(end,end.turn+1).res,{});
  }
});

test('компетенция, отношения, характер, местный аппарат и экономика реально меняют исполнение',async()=>{
  const open=await branch('permanent');
  const cases = [
    {name:'надёжный',competence:2 as const,relation:45,trait:'careerist' as const, economy:70,regional:30,outcome:'fulfilled'},
    {name:'слабый',competence:1 as const,relation:45,trait:'careerist' as const, economy:70,regional:30,outcome:'limited'},
    {name:'враждебный',competence:2 as const,relation:-40,trait:'careerist' as const, economy:70,regional:30,outcome:'limited'},
    {name:'аппаратчик',competence:2 as const,relation:45,trait:'apparatchik' as const, economy:70,regional:30,outcome:'limited'},
    {name:'слабая экономика',competence:2 as const,relation:45,trait:'careerist' as const, economy:18,regional:30,outcome:'limited'},
    {name:'местный аппарат',competence:2 as const,relation:45,trait:'careerist' as const, economy:70,regional:-30,outcome:'limited'},
  ];
  for(const c of cases){
    const variant={...open,resources:{...open.resources,economy:c.economy},factions:open.factions.map(f=>f.bloc==='regional'?{...f,relation:c.regional}:f),world:{...open.world!,people:open.world!.people.map(p=>p.id==='healthMinister'?{...p,competence:c.competence,relation:c.relation,trait:c.trait}:p)}};
    const end=tick(tick(interveneWorld(variant,'health:response:payroll')));
    assert.equal(end.world!.health!.aftermath!.outcome,c.outcome,c.name);
    assert.ok(end.world!.health!.aftermath!.factors.length>0);
  }
});

test('основной ход связывает прогноз, газету, источники ресурсов и реальный мир без двойного исполнения',async()=>{
  let s=await branch('rotation');s=interveneWorld(s,'health:response:replacement');s=tick(s);
  const event={title:'Заседание',source:'Кабинет',description:'Заседание кабинета.',isCritical:false,affectedFactions:[],choices:[{id:'a',text:'Завершить',hint:'',tags:[],resolvesCrisis:null,deal:{pure:true},scene:'Заседание завершено.'}],randomEvent:null};
  s=startEvent(s,event);const prior=JSON.stringify(s),plan=planTurn(s,'a'),consequence=await classicApi.consequence(s,'a');
  assert.equal(JSON.stringify(s),prior);assert.ok(consequence.narrative.includes('Исполнение поручения'));assert.ok(!consequence.narrative.includes('Из промышленного региона.'));
  const result=resolveTurn(s,'a',consequence);assert.deepEqual(result.world,plan.world);
  assert.ok(result.lastTurn!.sources!.internalLegitimacy!.some(([label,v])=>label==='районные больницы'&&v===2));
});

test('повреждённая цепочка отклоняется, старый итог сохраняется, дело дня не получает продолжений',async()=>{
  const s=await branch('rotation');const bad=JSON.parse(save(s));bad.state.world.health.aftermath.response='ghost';
  assert.equal(parseSave(JSON.stringify(bad)),null);
  const legacy=JSON.parse(save(s));delete legacy.state.world.health.aftermath;assert.ok(parseSave(JSON.stringify(legacy)));
  const daily={...s,daily:'2026-10-08'};assert.ok(livingActions(daily).every(a=>a.blocked));
  assert.equal(stepLivingWorld(daily,daily.turn+1).story,null);
});
