"use client";
import { useImperativeHandle, useRef, useState } from 'react';
import { COUNTRIES } from '@/lib/game/data.ts';
import { monthYear, turnDate } from '@/lib/game/calendar.ts';
import { livingActions, worldPerson } from '@/lib/game/living-world.ts';
import HealthPanel from './HealthPanel.jsx';
import ProjectActions from './ProjectActions.jsx';
import { healthHasContinuation, healthNeedsAttention } from '@/lib/game/health-aftermath.ts';
import { projectFinished } from '@/lib/game/living-health.ts';
import { PeopleText } from './PeopleText.jsx';

const STATUS={unassigned:'Ожидает поручения',running:'Работа продолжается',completed:'Сеть восстановлена',partial:'Восстановлена частично',failed:'Срок сорван'};
const RESOURCE={economy:'экономика',politicalCapital:'политкапитал',personalResource:'личный ресурс',externalReputation:'репутация'};
const TRAIT={careerist:'карьерист',idealist:'идеалист',apparatchik:'аппаратчик',pragmatist:'прагматик',hawk:'ястреб',populist:'популист'};
const stamp=(gs,turn)=>monthYear(turnDate(gs.seed,COUNTRIES[gs.country].startYear,Math.max(0,turn)));

export default function WorldPanel({ ref, gs, onOpen, onAction, Scene, onViewChange, onContinue, onCurrentCase }) {
  const [expanded,setExpanded]=useState(false);
  const [place,setPlace]=useState('region');
  const [tab,setTab]=useState(gs.world?.project.status==='running'?'dispatches':'actions');
  const tabs=useRef(null);
  const [pending,setPending]=useState(null);
  const [error,setError]=useState(null);
  const [receipt,setReceipt]=useState(null);
  const world=gs.world, project=world?.project;
  const actions=livingActions(gs);
  const energyReports=world?.dispatches.filter(report=>report.project!=='health')??[];
  const latest=energyReports.at(-1);
  const latestDispatch=world?.dispatches.at(-1);
  const selected=place==='health'?world?.health:project;
  const continuation = place === 'health' ? world?.health?.aftermath : null;
  const selectedFinished=selected&&projectFinished(selected)&&!(place==='health'&&healthHasContinuation(world?.health));
  const projects=world?[['region','Энергосеть',world.project],...(world.health?[['health','Районные больницы',world.health]]:[])]:[];
  const activeProjects = projects.filter(([, , item]) => !projectFinished(item)||(item===world?.health&&healthHasContinuation(world.health))).length;
  const showActions=()=>{
    if(!world?.health)onOpen();
    setExpanded(true);if(world?.health?.aftermath&&projectFinished(world.project))setPlace('health');else if(place==='capital')setPlace('region');setTab('actions');onViewChange(true);setPending(null);
    requestAnimationFrame(()=>tabs.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  useImperativeHandle(ref,()=>({showReport:()=>{
    setExpanded(true);setPlace(gs.world?.dispatches.at(-1)?.project==='health'?'health':'region');setTab('dispatches');setPending(null);onViewChange(true);
    requestAnimationFrame(()=>tabs.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  }}));
  const returnToDesk=()=>{setExpanded(false);onViewChange(false);setPending(null);if(gs.lastTurn&&!gs.ended)onContinue();else requestAnimationFrame(onCurrentCase);};
  const toggle=()=>{
    const open=!expanded;
    if(open&&!world?.health)onOpen();
    setExpanded(open);onViewChange(open);setPending(null);setError(null);if(open&&!world)setTab('actions');
  };
  const confirm=()=>{try{onAction(pending.id);setReceipt({turn:gs.turn,title:pending.title,cost:pending.cost});setPlace(pending.id.startsWith('health:')?'health':'region');setPending(null);setError(null);setTab('dispatches');}catch(e){setError(e.message);}};
  if(gs.daily)return null;
  const quota=world?.lastActionTurn===gs.turn;
  const terminal=project&&['completed','partial','failed'].includes(project.status);
  return <section data-world-panel className="sv-country">
    <button type="button" className="sv-country-toggle" aria-expanded={expanded} onClick={toggle}>
      <span>ПОВЕСТКА ПРЕЗИДЕНТА <span className="sv-country-arrow">{expanded?'▴':'▾'}</span></span>
      <span>{world?`В повестке: ${activeProjects}`:'Кабинет, проекты и исполнители'}</span>
    </button>
    {!expanded&&latestDispatch&&<div className="sv-country-latest">{stamp(gs,Math.max(world.openedTurn,latestDispatch.turn-(['report','news'].includes(latestDispatch.kind)?1:0)))} · {latestDispatch.title}</div>}
    {world&&<div className="sv-agenda-projects" aria-label="Проекты в повестке">{projects.map(([id,title,item])=><button key={id} data-agenda-project={id} aria-pressed={expanded&&place===id} onClick={()=>{if(!world.health)onOpen();setExpanded(true);onViewChange(true);setPlace(id);setTab(item.status==='unassigned'?'actions':'dispatches');setPending(null);}}>
      <strong>{title}</strong><span>{id==='health'&&healthHasContinuation(item)?healthNeedsAttention(item)?'Требуется ваше решение':item.aftermath.phase==='working'?'Поручение исполняется':'Ожидается новый доклад':item.status==='unassigned'?'Ждёт назначения':item.status==='running'?`${item.progress}% · работа идёт`:item.status==='completed'?'Завершён':item.status==='partial'?'Частичный результат':'Срок сорван'}</span><small>{id==='health'&&healthHasContinuation(item)?item.aftermath.phase==='open'?`${Math.max(0,item.aftermath.deadline-gs.turn)} кв. для ответа`:`Доклад через ${Math.max(0,item.aftermath.due-gs.turn)} кв.`:projectFinished(item)?item.followupTurn?'Остались обязательства':'Итоги в досье':`${Math.max(0,item.deadline-gs.turn)} кв. до срока${item.executor?' · исполнитель назначен':''}`}</small>
    </button>)}</div>}
    {!expanded&&!gs.ended&&<div className="sv-country-entry"><button onClick={showActions}>{!world?'Открыть проекты страны':!activeProjects?'Посмотреть итоги проектов':!actions.length?'Посмотреть ожидаемый доклад':quota?'Посмотреть ход проектов':'Выбрать личное поручение'} →</button><span>{world&&activeProjects&&!actions.length?'Следующий доклад придёт после решений в кабинете. Сейчас нового поручения не требуется.':world&&!activeProjects?'Проекты завершены. Следующее дело — в кабинете.':quota?'Поручение на этот квартал уже подписано':'Сроки обоих дел идут после решения в кабинете. Чтение свободно.'}</span></div>}
    {expanded&&world&&<div className="sv-country-body">
      <div className="sv-country-guide">
        <div className="sv-country-label">ПОРУЧЕНИЯ · {stamp(gs,gs.turn)}</div>
        <strong>{continuation?.phase==='open'&&!quota?'Последствия программы требуют решения':continuation?.phase==='working'?'Подписанное поручение исполняется':continuation?.phase==='scheduled'?'Программа закончена; история продолжается':selectedFinished?'Проект завершён':quota?'Поручение принято. Теперь — к делу в кабинете':selected?.status==='unassigned'?'Первый шаг — назначить руководителя':gs.lastTurn?'Доклад получен. Выберите, что изменить':'Можно скорректировать исполнение'}</strong>
        <p>{continuation?.phase==='open'&&!quota?'Прочитайте новый доклад и выберите ответ во вкладке «Поручения». Срок указан в досье; без ответа ситуация изменится сама.':continuation?.phase==='working'?'Исполнитель готовит итоговый доклад. Продолжайте решения в кабинете: время и согласования идут после них.':continuation?.phase==='scheduled'?'Результат программы уже известен. Следующий доклад покажет бюджетные или кадровые последствия выбранного вами пути.':selectedFinished?activeProjects?'Итоги остаются в досье. Другой проект продолжает работу.':'Итоги остаются в досье. Сведения об обязательствах — в докладе. Продолжите управление из кабинета.':quota?'Поручение уже подписано. Второй проект можно поручить после следующего решения в кабинете. Назначенные исполнители продолжат работу.':selected?.status==='unassigned'?'Выберите человека во вкладке «Поручения». Он получит финансирование на год.':'Прочитайте доклад и решите, нужны ли новое поручение, деньги или другой приоритет. Можно оставить текущий план в работе.'}</p>
        <div>{!selectedFinished&&!quota&&(!continuation||continuation.phase==='open')&&<button onClick={showActions}>{selected?.status==='unassigned'?'Выбрать руководителя':'Выбрать поручение'} →</button>}<button onClick={returnToDesk}>{gs.lastTurn&&!gs.ended?'Открыть дело нового квартала':'К текущему делу в кабинете'} →</button></div>
        <small>Карта и доклады доступны свободно. Одно личное поручение на оба проекта за квартал. Общий резерв экономики: {gs.resources.economy}. Время идёт после решения в кабинете.</small>
      </div>
      <div className="sv-country-map" aria-label="Резиденция и два проекта страны">
        <div className="sv-country-river" aria-hidden="true"/>
        <div className="sv-country-route" aria-hidden="true"/>
        <button className="sv-country-place" aria-pressed={place==='capital'} onClick={()=>{setPlace('capital');setPending(null);}}>
          <span aria-hidden="true">▥</span><strong>{COUNTRIES[gs.country].capital}</strong><small>Резиденция</small>
        </button>
        <button className="sv-country-place" aria-pressed={place==='region'} onClick={()=>{setPlace('region');setPending(null);}}>
          <span aria-hidden="true">▤</span><strong>Промышленный регион</strong><small>{terminal?STATUS[project.status]:'Отключения электричества'}</small>
        </button>
        {world.health&&<button className="sv-country-place" aria-pressed={place==='health'} onClick={()=>{setPlace('health');setPending(null);setTab('dispatches');}}><span aria-hidden="true">✚</span><strong>Районные больницы</strong><small>{world.health.progress}% · кадры</small></button>}
      </div>
      {place==='health'&&world.health?<HealthPanel gs={gs} Scene={Scene} tab={tab} setTab={setTab} tabs={tabs} stamp={stamp} actionsProps={{actions:actions.filter(action=>action.id.startsWith('health:')),quota,pending,setPending,confirm,error}}/>:place==='capital'?<div className="sv-country-room">
        <div className="sv-country-label">КАБИНЕТ ПРЕЗИДЕНТА</div>
        <h3>На столе в резиденции</h3>
        <p>{gs.currentEvent?`Входящее дело: «${gs.currentEvent.title}».`:gs.lastTurn?'Газета с последствиями вашего последнего решения.':'Канцелярия готовит новое дело.'}</p>
        <p>Из промышленного региона поступают отдельные доклады. Поручения по энергосети и районным больницам продолжают исполняться, пока вы заняты другими вопросами.</p>
      <button className="sv-country-back" onClick={returnToDesk}>{gs.lastTurn?'Открыть дело нового квартала':'Вернуться к делу на столе'} ↓</button>
      </div>:<div className="sv-country-room">
        <div className="sv-country-label">ПРОМЫШЛЕННЫЙ РЕГИОН · ЭНЕРГОСЕТЬ</div>
        <h3>Свет в окнах, работа на заводах</h3>
        <div className="sv-country-photo"><Scene gs={gs} sceneKey={project.status==='completed'?'factory':'energy'} partner={project.status==='completed'?'restored':`grid:${project.progress}`} height={42}/></div>
        <p>{terminal?project.status==='completed'?'Вечерние смены вернулись. Диспетчерская сняла график отключений.':project.status==='partial'?(project.priority==='households'?'В жилых районах электричество надёжнее; заводы ещё работают с ограничениями.':'Заводы работают дольше, но жилые кварталы ещё отключают.'):'Диспетчерская продлила график отключений. Срок подготовки сети истёк.':'Изношенная сеть не выдерживает нагрузки. Заводы сокращают смены, жители сверяются с графиком отключений. На восстановление отведён год.'}</p>
        <div className="sv-country-summary">
          <div><small>Срок</small><strong>{stamp(gs,Math.max(0,project.deadline-1))}</strong><span>{terminal?'Итоговая проверка завершена':`${Math.max(0,project.deadline-gs.turn)} кв. до срока`}</span></div>
          <div><small>Руководитель</small><strong>{project.executor?<PeopleText>{worldPerson(gs,project.executor).name}</PeopleText>:'Не назначен'}</strong><span>{project.executor?worldPerson(gs,project.executor).role:'Дело ждёт вашей инициативы'}</span></div>
          <div><small>{project.status==='unassigned'?'Работы':'Восстановлено'}</small><strong>{project.status==='unassigned'?'Не начаты':`${project.progress}%`}</strong><span>{project.status==='unassigned'?'Нужны руководитель и финансирование':({balanced:'Заводы и жилые районы',industry:'Первыми подключают заводы',households:'Первыми подключают жилые районы'}[project.priority??'balanced'])}</span></div>
        </div>
        {project.status==='running'&&<div className="sv-country-capacity">Финансирование осталось на {project.funds} кв.{project.secured?' · дополнительные бригады работают':''}{project.procurementFixed?' · поставщик заменён':project.deal?' · согласована адаптация оборудования':''}</div>}
        <div ref={tabs} className="sv-country-tabs" role="tablist" aria-label="Досье промышленного региона">
          {[['dispatches','Доклады'],['people','Люди'],['actions','Поручения']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);setPending(null);setError(null);}}>{label}</button>)}
        </div>
        <div role="tabpanel">
          {tab==='dispatches'&&<div className="sv-country-dispatches">
            {[latest].filter(Boolean).map(d=><article key={d.id}>
              <small>{stamp(gs,Math.max(world.openedTurn,d.turn-(d.kind==='report'||d.kind==='news'?1:0)))} · {{letter:'Письмо',decision:'Ваша инициатива',report:'Доклад исполнителя',inspection:'Проверенные сведения',news:'Итог дела'}[d.kind]}</small>
              <h4><PeopleText>{d.title}</PeopleText></h4><p><PeopleText>{d.text}</PeopleText></p>
            </article>)}
            {energyReports.length>1&&<details className="sv-country-history"><summary>Предыдущие доклады и поручения ({energyReports.length-1})</summary>{energyReports.slice(0,-1).reverse().map(d=><article key={d.id}><small>{stamp(gs,Math.max(world.openedTurn,d.turn-(d.kind==='report'||d.kind==='news'?1:0)))}</small><h4><PeopleText>{d.title}</PeopleText></h4><p><PeopleText>{d.text}</PeopleText></p></article>)}</details>}
            {project.status==='running'&&project.lastFactors.length>0&&<article><h4>Что влияет на работу сейчас</h4><ul>{project.lastFactors.map((f,i)=><li key={i}><PeopleText>{f}</PeopleText></li>)}</ul></article>}
            {terminal&&project.lastFactors.length>0&&<article><h4>Что повлияло на исполнение</h4><ul>{project.lastFactors.map((f,i)=><li key={i}><PeopleText>{f}</PeopleText></li>)}</ul></article>}
          </div>}
          {tab==='people'&&<div className="sv-country-people">
            {world.people.filter(person=>['minister','governor','engineer'].includes(person.id)).map(a=>{const p=worldPerson(gs,a.id);return <article key={p.id}><h4><PeopleText>{p.name}</PeopleText></h4><div>{p.role}{project.executor===p.id?' · руководит проектом':''}</div><div className="sv-country-person-stats">Компетенция {p.competence}/3 · к вам {p.relation>0?'+':''}{p.relation} · {TRAIT[p.trait]}</div><p>{p.goal}.</p>{world.health?.status==='running'&&world.health.executor===p.id&&<p className="sv-country-receipt">Уже руководит больницами. Второе назначение замедлит оба проекта.</p>}</article>;})}
          </div>}
          {tab==='actions'&&<ProjectActions actions={actions.filter(action=>!action.id.startsWith('health:'))} quota={quota} terminal={terminal} pending={pending} setPending={setPending} confirm={confirm} error={error}/>}

        </div>
      </div>}
          {receipt?.turn===gs.turn&&<p className="sv-country-receipt" role="status">Подписано: {receipt.title}. {Object.entries(receipt.cost).map(([k,v])=>`${RESOURCE[k]??k} ${v}`).join(' · ')}. Поручение относится к текущему кварталу. Теперь откройте дело в кабинете; новый доклад придёт после его завершения.</p>}
      <button className="sv-country-back" onClick={returnToDesk}>{gs.lastTurn&&!gs.ended?'Продолжить — открыть дело нового квартала':'Продолжить — к текущему делу в кабинете'} →</button>
    </div>}
  </section>;
}
