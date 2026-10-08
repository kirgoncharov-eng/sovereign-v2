// Первый живой регион: поручение развивается вместе с кварталами основной партии.
// Модель не знает React и не бросает скрытый кубик: причины исполнения сохраняются в докладах.
import { NAMES } from '../content/narration.ts';
import { traitOf } from './people.ts';
import type { TraitId } from './people.ts';
import type { GameState, ResourceDelta } from './types.ts';

export type WorldPersonId = 'minister' | 'governor' | 'engineer';
export interface WorldPerson {
  id: WorldPersonId; name: string; role: string; competence: 1 | 2 | 3; relation: number;
  trait: TraitId; goal: string; figure?: string;
}
export interface WorldDispatch { id: string; turn: number; kind: 'letter' | 'decision' | 'report' | 'inspection' | 'news'; title: string; text: string }
export interface EnergyProject {
  priority?: 'balanced' | 'industry' | 'households';
  status: 'unassigned' | 'running' | 'completed' | 'partial' | 'failed';
  executor: WorldPersonId | null; deadline: number; progress: number; reported: number;
  funds: number; secured: boolean; inspected: boolean; procurementFixed: boolean;
  deal: boolean; cover: boolean;
  verified: { turn: number; progress: number } | null;
  lastFactors: string[];
}
export interface LivingWorld {
  version: 1; openedTurn: number; lastTick: number; lastActionTurn: number | null;
  people: WorldPerson[]; project: EnergyProject; dispatches: WorldDispatch[];
}
const hash=(...parts:(string|number)[])=>{let h=2166136261;for(const c of parts.join('|')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const done=(p:EnergyProject)=>['completed','partial','failed'].includes(p.status);
const bounded=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(v)));
const append=(w:LivingWorld, d:Omit<WorldDispatch,'id'>):LivingWorld=>({...w,dispatches:[...w.dispatches,{...d,id:`${d.turn}:${d.kind}:${w.dispatches.length}`}].slice(-24)});

export function openLivingWorld(gs:GameState):GameState {
  if(gs.world || gs.daily || gs.ended)return gs;
  const used=new Set([gs.leader.name,...gs.keyFigures.map(f=>f.name),...gs.advisors.map(a=>a.name),...(gs.former??[])]);
  const pool=NAMES[gs.country]??NAMES['Беларусь'];
  const name=(slot:string)=>{for(let i=0;i<200;i++){const h=hash(gs.seed,'world-name',slot,i);const n=`${pool.first[h%8]} ${pool.last[(h>>>5)%pool.last.length]}`;if(!used.has(n)){used.add(n);return n;}}return `${pool.first[0]} ${pool.last[0]}`;};
  const regional=gs.keyFigures.find(f=>gs.factions.find(g=>g.id===f.faction)?.bloc==='regional');
  const people:WorldPerson[]=[
    {id:'minister',name:name('minister'),role:'Министр энергетики',competence:2,relation:45,trait:'careerist',goal:'Сдать проект вовремя и сохранить положение в кабинете'},
    {id:'governor',name:regional?.name??name('governor'),role:regional?.role??'Глава промышленного региона',competence:2,relation:regional?.relation??15,trait:regional?traitOf(gs.seed,regional,'regional'):'apparatchik',goal:'Сохранить влияние местных подрядчиков',...(regional?{figure:regional.id}:{})},
    {id:'engineer',name:name('engineer'),role:'Главный инженер энергосети',competence:3,relation:8,trait:'idealist',goal:'Восстановить надёжную сеть, не жертвуя качеством ради срока'},
  ];
  let world:LivingWorld={version:1,openedTurn:gs.turn,lastTick:gs.turn,lastActionTurn:null,people,project:{priority:'balanced',status:'unassigned',executor:null,deadline:gs.turn+4,progress:0,reported:0,funds:0,secured:false,inspected:false,procurementFixed:false,deal:false,cover:false,verified:null,lastFactors:[]},dispatches:[]};
  world=append(world,{turn:gs.turn,kind:'letter',title:'Промышленный регион · письмо из диспетчерской',text:`Директор энергосети просит заменить изношенные узлы в течение года. Сейчас электричество отключают по графику; заводы заканчивают смены раньше. За соседним столом ${people[0].name} предлагает взять работу под личный контроль. ${people[2].name} предупреждает: нынешний поставщик требует переделки оборудования. Новый договор обойдётся дороже, а местные подрядчики готовы адаптировать поставку, если сохранят заказы. Заводы требуют подключить их первыми; районная больница просит не отодвигать жилые кварталы.`});
  return {...gs,world};
}
export function worldPerson(gs:GameState,id:WorldPersonId):WorldPerson|undefined {
  const person=gs.world?.people.find(p=>p.id===id);
  if(!person)return;
  const figure=person.figure&&gs.keyFigures.find(f=>f.id===person.figure);
  return {...person,...(figure?{name:figure.name,relation:figure.relation}:{})};
}
export interface WorldAction { id:string; title:string; detail:string; cost:ResourceDelta; blocked:string|null }
export function livingActions(gs:GameState):WorldAction[] {
  const w=gs.world;if(!w)return [];
  const p=w.project;const list:Omit<WorldAction,'blocked'>[]=[];
  if(p.status==='unassigned')for(const actor of w.people){const person=worldPerson(gs,actor.id)!;list.push({id:`appoint:${actor.id}`,title:`Поручить проект: ${person.name}`,detail:`${person.role}. Компетенция ${person.competence}/3, отношение к вам ${person.relation>0?'+':''}${person.relation}. ${person.goal}. Финансирование — на четыре квартала.`,cost:{economy:-4,politicalCapital:-2}});}
  if(p.status==='running'){
    list.push({id:'visit',title:'Поехать в промышленный регион',detail:'Увидеть состояние сети, согласовать работу с инженерами и местной администрацией. Даст политическую защиту исполнителю.',cost:{personalResource:-2,politicalCapital:-1}});
    if(!p.procurementFixed&&!p.deal)list.push({id:'retender',title:'Расторгнуть договор и сменить поставщика',detail:'Совместимое оборудование уберёт задержки. Новый договор стоит дороже, местные подрядчики потеряют заказы.',cost:{economy:-3,politicalCapital:-2}});
    if(!p.secured)list.push({id:'fund',title:'Обеспечить резерв финансирования',detail:'Дополнительные бригады ускорят работу. Спор о поставщике останется отдельным вопросом.',cost:{economy:-4}});
    if(!p.deal&&!p.procurementFixed)list.push({id:'negotiate',title:'Договориться с местными влиятельными людьми',detail:'Поставки получат политическую поддержку, в обмен на сохранение части местных заказов.',cost:{politicalCapital:-2,externalReputation:-1}});
    for(const [priority,title,detail] of [['industry','Сначала подключить заводы','Крупные линии проще восстановить: работа ускорится, экономика получит больший эффект. Жилые районы будут ждать дольше.'],['households','Сначала подключить жилые районы','Распределённая сеть требует больше времени. Надёжный свет в домах укрепит легитимность, эффект для экономики будет меньше.'],['balanced','Сохранить равномерное восстановление','Распределить бригады между заводами и жилыми районами. Умеренный темп и сбалансированный результат.']])if(priority!==(p.priority??'balanced'))list.push({id:`priority:${priority}`,title,detail,cost:{politicalCapital:-1}});
    for(const actor of w.people)if(actor.id!==p.executor)list.push({id:`replace:${actor.id}`,title:`Сменить руководителя: ${worldPerson(gs,actor.id)!.name}`,detail:'Работа сохранится, но передача дел задержит следующий квартал.',cost:{politicalCapital:-3}});
  }
  return list.map(a=>({...a,blocked:gs.daily?'В деле дня личные поручения недоступны':gs.ended?'Правление завершено':w.lastActionTurn===gs.turn?'Личное вмешательство в этом квартале уже использовано':Object.entries(a.cost).some(([k,v])=>gs.resources[k as keyof typeof gs.resources]+(v??0)<=4)?'Недостаточно запаса ресурса для этого поручения':null}));
}
export function interveneWorld(gs:GameState,id:string):GameState {
  const action=livingActions(gs).find(a=>a.id===id);if(!action||action.blocked)throw Error(action?.blocked??'Поручение недоступно');
  let w:LivingWorld={...gs.world!,lastActionTurn:gs.turn,project:{...gs.world!.project},people:gs.world!.people.map(p=>({...p}))};
  const p=w.project;let text='';const kind:WorldDispatch['kind']='decision';let factionRel:Record<string,number>={};
  if(id.startsWith('appoint:')){p.executor=id.slice(8) as WorldPersonId;p.status='running';p.funds=4;const actor=worldPerson(gs,p.executor)!;text=`${actor.name} получает подписанное поручение и финансирование на четыре квартала. «Первый доклад — после следующего заседания», — говорит секретарь. Вы устанавливаете срок: квартал ${p.deadline+1} от начала правления.`;}
  if(id==='visit'){
    p.cover=true;
    const engineer=w.people.find(a=>a.id==='engineer')!;engineer.relation=bounded(engineer.relation+10,-100,100);
    text=`В диспетчерской ${worldPerson(gs,'engineer')!.name} раскладывает графики ремонта. При вас руководитель проекта и местная администрация согласуют доступ бригад к объектам. Исполнитель получает право обращаться прямо в резиденцию. Инженеры предупреждают: политическая поддержка снимает сопротивление аппарата, но не решает вопрос с оборудованием.`;
  }
  if(id.startsWith('priority:')){
    p.priority=id.slice(9) as EnergyProject['priority'];
    text=p.priority==='industry'?'Выводите крупные промышленные линии в первую очередь. Директора заводов обещают вернуть смены; жилые кварталы останутся в графике отключений дольше.':p.priority==='households'?'Бригады переходят к жилым районам. Работа на распределённой сети займёт больше времени, зато первыми получат надёжное электричество дома и районные учреждения.':'Бригады делят между промышленными линиями и жилыми районами. Никто не получает всю мощность первым; руководителю придётся координировать два фронта работ.';
  }
  if(id==='retender'){
    p.procurementFixed=true;
    factionRel=Object.fromEntries(gs.factions.filter(f=>f.bloc==='business'||f.bloc==='regional').map(f=>[f.id,-5]));
    text='Старый поставщик лишается договора. Инженеры подтверждают совместимость нового оборудования. Местные посредники теряют заказ и требуют объяснений у своих политических покровителей.';
  }
  if(id==='fund'){p.secured=true;p.funds=Math.min(8,p.funds+4);text='К проекту направляют дополнительные бригады и резерв денег. Руководитель получает возможность вести несколько участков одновременно. Расходы на ремонт вырастут; резерв не отменяет необходимость согласовать поставки.';}
  if(id==='negotiate'){p.deal=true;p.cover=true;factionRel=Object.fromEntries(gs.factions.filter(f=>f.bloc==='business'||f.bloc==='regional').map(f=>[f.id,5]));text='Местные влиятельные люди обещают убрать препятствия для поставок. Часть заказов остаётся их предприятиям. Главный инженер получает возможность согласовать адаптацию оборудования, но вам напоминают, кто обеспечил эту договорённость.';}
  if(id.startsWith('replace:')){p.executor=id.slice(8) as WorldPersonId;p.lastFactors=['Передача дел'];text=`${worldPerson(gs,p.executor)!.name} принимает папки и незавершённые работы. Проект не начинается заново, но ближайший квартал часть времени уйдёт на передачу дел.`;}
  const resources={...gs.resources};for(const [k,v]of Object.entries(action.cost))resources[k as keyof typeof resources]=bounded(resources[k as keyof typeof resources]+(v??0));
  const labels:Partial<Record<keyof ResourceDelta,string>>={economy:'экономика',politicalCapital:'политкапитал',personalResource:'личный ресурс',externalReputation:'репутация'};
  const price=Object.entries(action.cost).map(([k,v])=>`${labels[k as keyof ResourceDelta]??k} ${v}`).join(', ');
  w=append(w,{turn:gs.turn,kind,title:action.title,text:`${text.trim()} Цена поручения: ${price}.`});
  const factions=gs.factions.map(f=>({...f,relation:bounded(f.relation+(factionRel[f.id]??0),-100,100)}));
  const lastTurn=gs.lastTurn?{...gs.lastTurn,resourceChanges:{...gs.lastTurn.resourceChanges},factionRelChanges:{...gs.lastTurn.factionRelChanges},sources:{...gs.lastTurn.sources}}:null;
  if(lastTurn)for(const [k] of Object.entries(action.cost)){const key=k as keyof ResourceDelta;const actual=resources[key]-gs.resources[key];lastTurn.resourceChanges[key]=(lastTurn.resourceChanges[key]??0)+actual;lastTurn.sources[key]=[...(lastTurn.sources[key]??[]),[`поручение нового квартала: ${action.title}`,actual]];}
  if(lastTurn)for(const f of factions){const delta=f.relation-gs.factions.find(old=>old.id===f.id)!.relation;if(delta)lastTurn.factionRelChanges[f.id]=(lastTurn.factionRelChanges[f.id]??0)+delta;}
  return {...gs,lastTurn,world:w,resources,factions};
}

export function stepLivingWorld(gs:GameState,nextTurn:number):{world?:LivingWorld;res:ResourceDelta;story:string|null} {
  if(!gs.world||gs.daily||nextTurn<=gs.world.lastTick)return {world:gs.world,res:{},story:null};
  let w:LivingWorld={...gs.world,lastTick:nextTurn,project:{...gs.world.project},people:gs.world.people.map(p=>({...p}))};
  const p=w.project;if(done(p))return {world:w,res:{},story:null};
  let story='';const factors:string[]=[];let gain=0;
  const business=gs.factions.filter(f=>f.bloc==='business');const regional=gs.factions.filter(f=>f.bloc==='regional');
  if(p.status==='running'&&p.executor){
    const actor=worldPerson(gs,p.executor)!;
    gain=10+actor.competence*8;factors.push(`Компетенция ${actor.name}: ${actor.competence}/3`);
    if(actor.relation>=30){gain+=4;factors.push('Руководитель лично поддерживает ваш приоритет');}else if(actor.relation<=-20){gain-=8;factors.push('Руководитель не спешит исполнять ваше поручение');}
    if(p.funds>0)p.funds--;else{gain-=14;factors.push('Стартовое финансирование исчерпано');}
    if(p.secured){gain+=6;factors.push('Дополнительные бригады и резерв финансирования');}
    if(gs.resources.economy<25){gain-=6;factors.push('Слабая экономика затрудняет закупки');}
    if(!p.procurementFixed&&!p.deal&&nextTurn>=w.openedTurn+2){gain-=10;factors.push('Адаптация оборудования задерживает подключение');}
    if(business.some(f=>f.relation<-20)&&!p.deal){gain-=7;factors.push('Враждебный бизнес задерживает поставки');}
    if(p.executor==='engineer'&&!p.cover){gain-=6;factors.push('Инженеру не хватает политических полномочий');}
    if(regional.some(f=>f.relation<0)&&p.executor!=='governor'&&!p.cover){gain-=5;factors.push('Местный аппарат сопротивляется руководителю');}
    if(p.lastFactors.includes('Передача дел')){gain-=8;factors.push('Передача дел новому руководителю');}
    const priority=p.priority??'balanced';
    if(actor.trait==='careerist'&&p.secured){gain+=2;factors.push('Карьерист использует дополнительные ресурсы ради заметного результата');}
    if(actor.trait==='idealist'&&p.procurementFixed){gain+=4;factors.push('Инженер усиливает работу при совместимом оборудовании');}
    if(actor.trait==='apparatchik'&&p.deal){gain+=4;factors.push('Аппаратчик использует местные связи для исполнения договорённости');}
    if(actor.trait==='populist'&&priority==='households'){gain+=3;factors.push('Популист добивается быстрого результата в жилых районах');}
    if(actor.trait==='pragmatist'&&(p.deal||p.procurementFixed)){gain+=2;factors.push('Прагматик ускоряет работу после согласования поставок');}
    if(actor.trait==='hawk'&&p.cover){gain+=2;factors.push('Политические полномочия позволяют требовательному руководителю ускорить исполнение');}
    if(priority==='industry'){gain+=4;factors.push('Приоритет крупных промышленных линий: быстрее, жилые районы ждут');}
    if(priority==='households'){gain-=2;factors.push('Приоритет жилых районов: больше распределённых участков');}
    // Отчёт отражает выполненную работу. Конфликт — в распределении мощности и ресурсов.
    p.progress=bounded(gs.world.project.progress+Math.max(0,gain));p.reported=p.progress;
    const focus=priority==='industry'?'Бригады сосредоточены на заводских линиях; жилые районы ждут своей очереди.':priority==='households'?'Первыми подключают жилые районы; директора заводов требуют вернуть бригады на промышленные линии.':'Бригады работают и на заводских линиях, и в жилых кварталах.';
    const equipment=p.procurementFixed?'Новый поставщик доставляет совместимое оборудование.':p.deal?'Местные подрядчики согласовали адаптацию поставки.':'Адаптация нынешнего оборудования задерживает подключение. Можно сменить поставщика или сохранить местные заказы в обмен на согласованную переделку.';
    story=`${actor.name} присылает доклад: восстановлено ${p.progress}% сети. ${focus} ${equipment} ${factors.filter(f=>!f.startsWith('Компетенция')).join('. ')}.`;
  }else{factors.push('Руководитель и финансирование не назначены');story=nextTurn-w.openedTurn<2?'Письмо из диспетчерской остаётся без поручения. Из региона спрашивают, кто будет отвечать за подготовку сети.':'Из региона пишут снова: без решения резиденции местные власти ограничились временным ремонтом. Предприятия продолжают работать по сокращённому графику.';}
  p.lastFactors=factors;
  let res:ResourceDelta={};
  if(p.progress>=100||nextTurn>=p.deadline){
    p.status=p.progress>=100?'completed':p.progress>=60?'partial':'failed';p.reported=p.progress;p.verified={turn:nextTurn,progress:p.progress};
    const priority=p.priority??'balanced';
    res=p.status==='completed'?(priority==='industry'?{economy:6,internalLegitimacy:1}:priority==='households'?{economy:2,internalLegitimacy:5}:{economy:4,internalLegitimacy:3}):p.status==='partial'?(priority==='industry'?{economy:3,internalLegitimacy:-2}:priority==='households'?{economy:0,internalLegitimacy:1}:{economy:1,internalLegitimacy:-1}):{economy:-4,internalLegitimacy:-4};
    const ending=p.status==='completed'?'Сеть прошла нагрузочные испытания. График отключений отменён; заводы возвращают вечерние смены.':p.status==='partial'?(priority==='households'?'Часть сети восстановлена. Жилые районы получают электричество надёжнее; заводские линии ещё работают с ограничениями.':'Часть сети восстановлена. Заводы получают электричество, но жилые кварталы по-прежнему отключают. На совещании приходится объяснять, почему обещанный результат получился лишь частично.'):'Комиссия не принимает сеть. График отключений продлевают; владельцы предприятий сокращают смены, жители требуют назвать ответственного.';
    story=`${ending} Восстановлено ${p.progress}% сети. ${factors.join('. ')}. Результат для страны: экономика ${res.economy!>0?'+':''}${res.economy}, легитимность ${res.internalLegitimacy!>0?'+':''}${res.internalLegitimacy}.`;
    if(p.executor){const actor=w.people.find(a=>a.id===p.executor)!;if(!actor.figure)actor.relation=bounded(actor.relation+(p.status==='completed'?8:-10),-100,100);}
  }
  w=append(w,{turn:nextTurn,kind:done(p)?'news':'report',title:done(p)?'Энергосеть · итоговая проверка':'Энергосеть · квартальный доклад',text:story});
  return {world:w,res,story};
}

export function validLivingWorld(v:unknown):v is LivingWorld {
  if(!v||typeof v!=='object')return false;const w=v as LivingWorld;const n=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&Number(x)>=min&&Number(x)<=max;
  if(w.version!==1||!n(w.openedTurn)||!n(w.lastTick)||w.lastTick<w.openedTurn||w.lastActionTurn!==null&&!n(w.lastActionTurn))return false;
  if(!Array.isArray(w.people)||w.people.length!==3||w.people.some(a=>!a||typeof a!=='object')||new Set(w.people.map(a=>a.id)).size!==3||!w.people.every(a=>a&&['minister','governor','engineer'].includes(a.id)&&typeof a.name==='string'&&typeof a.role==='string'&&typeof a.goal==='string'&&n(a.competence,1,3)&&n(a.relation,-100,100)&&['careerist','idealist','hawk','pragmatist','populist','apparatchik'].includes(a.trait)&&(!a.figure||typeof a.figure==='string')))return false;
  const p=w.project;if(!p||!['unassigned','running','completed','partial','failed'].includes(p.status)||p.executor!==null&&!w.people.some(a=>a.id===p.executor)||!n(p.deadline)||p.deadline<=w.openedTurn||!n(p.progress,0,100)||!n(p.reported,0,100)||!n(p.funds,0,8)||!['secured','inspected','procurementFixed','deal','cover'].every(k=>typeof p[k as keyof EnergyProject]==='boolean')||!Array.isArray(p.lastFactors)||!p.lastFactors.every(t=>typeof t==='string'))return false;
  if(p.priority!==undefined&&!['balanced','industry','households'].includes(p.priority))return false;
  if(p.status==='running'&&!p.executor||p.status==='unassigned'&&p.executor||w.lastActionTurn!==null&&(w.lastActionTurn<w.openedTurn||w.lastActionTurn>w.lastTick))return false;
  if(p.verified!==null&&(!p.verified||!n(p.verified.turn)||!n(p.verified.progress,0,100)))return false;
  return Array.isArray(w.dispatches)&&w.dispatches.length<=24&&w.dispatches.every(d=>d&&typeof d.id==='string'&&n(d.turn)&&['letter','decision','report','inspection','news'].includes(d.kind)&&typeof d.title==='string'&&typeof d.text==='string');
}
