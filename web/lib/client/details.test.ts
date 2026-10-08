import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUP_RELATION, COUNTRIES, RESOURCE_KEYS } from '../game/data.ts';
import { createInitialState, leaderRating, seededRandom, warningLevel, warningSignals } from '../game/engine.ts';
import { classicApi } from '../game/classic.ts';
import { turnDate } from '../game/calendar.ts';
import { nameParts, personProfiles } from './people-text.ts';
import { warningDetails } from './warning-detail.ts';
import { squareStateOf } from './square-state.ts';
import { drawSquare } from './square.ts';
const fresh = async()=>createInitialState('Украина','debut','pragmatist',await classicApi.setup('Украина','debut','pragmatist',21),seededRandom(21));

test('причины предупреждения сохраняют прежние пороги и перечисляют все слабые опоры',async()=>{
  const s=await fresh();
  for(const v of [0,10,11,22,23,50]) for(const rel of [-100,COUP_RELATION+5,COUP_RELATION+6,COUP_RELATION+15,COUP_RELATION+16,50]) {
    const resources=Object.fromEntries(RESOURCE_KEYS.map(k=>[k,v])) as typeof s.resources;
    const factions=s.factions.map(f=>({...f,relation:rel}));
    const rating=leaderRating(factions,resources);
    const expected=v<=10||rating<=15||rel<=COUP_RELATION+5?'critical':v<=22||rating<=25||rel<=COUP_RELATION+15?'warning':'none';
    const state={...s,resources,factions};
    assert.equal(warningLevel(state),expected);
    assert.equal(warningSignals(state).length>0,expected!=='none');
    assert.equal(warningSignals(state).filter(r=>RESOURCE_KEYS.includes(r.id as never)).length,v<=22?6:0);
  }
});
test('предупреждение показывает реальный спад и источники, не приписывает причины прогнозу',async()=>{
  const s=await fresh();
  const gs={...s,resources:{...s.resources,economy:19},prevResources:{...s.resources,economy:28},lastTurn:{sources:{economy:[['решение',-4],['кризис',-5],['восстановление',1]]}}} as typeof s;
  const detail=warningDetails(gs).find(r=>r.id==='economy')!;
  assert.equal(detail.previous,28);assert.equal(detail.value,19);assert.equal(detail.threshold,22);
  assert.deepEqual(detail.sources,[['решение',-4],['кризис',-5]]);
});
test('имя и уникальная фамилия ведут к одному досье; совпадения фамилий и части слов не угадываются',async()=>{
  const s=await fresh();const profiles=personProfiles(s);const person=profiles[0];const surname=person.name.split(' ').at(-1)!;
  const parts=nameParts(`${person.name}, ${surname} и ${surname}ский.`,profiles);
  assert.equal(parts.map(p=>p.text).join(''),`${person.name}, ${surname} и ${surname}ский.`);
  assert.equal(parts.filter(p=>p.person?.id===person.id).length,2);
  const dup={...person,id:'other',name:`Другой ${surname}`};
  assert.equal(nameParts(surname,[person,dup]).filter(p=>p.person).length,0);
  assert.equal(nameParts(person.name,[person,dup]).filter(p=>p.person).length,1);
});
test('досье обновляет личное отношение; советнику и бывшему игроку не выдумывают числовую лояльность',async()=>{
  const s=await fresh();const fig=s.keyFigures[0];
  const old=personProfiles(s).find(p=>p.name===fig.name)!;
  const after=personProfiles({...s,keyFigures:s.keyFigures.map(p=>p.id===fig.id?{...p,relation:-64}:p),former:['Иван Былов']});
  assert.equal(after.find(p=>p.name===fig.name)!.relation,-64);assert.notEqual(old.relation,-64);
  assert.equal(after.find(p=>p.name===s.advisors[0].name)!.relation,null);
  assert.equal(after.find(p=>p.name==='Иван Былов')!.relation,null);
});
test('сезон площади совпадает с датой дела; после решения дата остаётся прежней; все четыре сезона визуально различаются',async()=>{
  const s=await fresh();
  for(let turn=0;turn<16;turn++) {
    const gs={...s,turn};assert.equal(squareStateOf(gs).season,turnDate(s.seed,COUNTRIES[s.country].startYear,turn).season);
    const report={...gs,turn:turn+1,lastTurn:{} as NonNullable<typeof gs.lastTurn>};assert.equal(squareStateOf(report).season,squareStateOf(gs).season);
  }
  const frames=[];
  for(const season of ['winter','spring','summer','autumn'] as const){const pixels:unknown[]=[];const ctx={fillStyle:'',fillRect(this: { fillStyle: string }, ...coords:number[]){assert.ok(coords.every(Number.isFinite));pixels.push([this.fillStyle,...coords]);}} as unknown as CanvasRenderingContext2D;drawSquare(ctx,195,64,{...squareStateOf(s,1),season},9);frames.push(JSON.stringify(pixels));}
  assert.equal(new Set(frames).size,4);
});
