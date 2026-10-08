"use client";
import { useImperativeHandle, useRef, useState } from 'react';
import { COUNTRIES } from '@/lib/game/data.ts';
import { monthYear, turnDate } from '@/lib/game/calendar.ts';
import { livingActions, worldPerson } from '@/lib/game/living-world.ts';
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
  const latest=world?.dispatches.at(-1);
  const showActions=()=>{
    if(!world)onOpen();
    setExpanded(true);setPlace('region');setTab('actions');onViewChange(true);setPending(null);
    requestAnimationFrame(()=>tabs.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  useImperativeHandle(ref,()=>({showReport:()=>{
    setExpanded(true);setPlace('region');setTab('dispatches');setPending(null);onViewChange(true);
    requestAnimationFrame(()=>tabs.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  }}));
  const returnToDesk=()=>{setExpanded(false);onViewChange(false);setPending(null);if(gs.lastTurn&&!gs.ended)onContinue();else requestAnimationFrame(onCurrentCase);};
  const toggle=()=>{
    const open=!expanded;
    if(open&&!world)onOpen();
    setExpanded(open);onViewChange(open);setPending(null);setError(null);if(open&&!world)setTab('actions');
  };
  const confirm=()=>{try{onAction(pending.id);setReceipt({turn:gs.turn,title:pending.title,cost:pending.cost});setPending(null);setError(null);setTab('dispatches');}catch(e){setError(e.message);}};
  if(gs.daily)return null;
  const quota=world?.lastActionTurn===gs.turn;
  const terminal=project&&['completed','partial','failed'].includes(project.status);
  return <section data-world-panel className="sv-country">
    <button type="button" className="sv-country-toggle" aria-expanded={expanded} onClick={toggle}>
      <span>СТРАНА <span className="sv-country-arrow">{expanded?'▴':'▾'}</span></span>
      <span>{project?`Энергосеть · ${STATUS[project.status]}`:'Карта, люди и личные поручения'}</span>
    </button>
    {!expanded&&latest&&<div className="sv-country-latest">{stamp(gs,Math.max(world.openedTurn,latest.turn-(latest.kind==='report'||latest.kind==='news'?1:0)))} · {latest.title}</div>}
    {!expanded&&!gs.ended&&<div className="sv-country-entry"><button onClick={showActions}>{!project||project.status==='unassigned'?'Назначить руководителя':terminal?'Открыть итог проекта':quota?'Посмотреть ход работ':'Дать поручение по региону'} →</button><span>{quota?'Поручение на этот квартал уже подписано':gs.lastTurn&&!terminal?'Доклад получен. Можно действовать сейчас.':'Работы идут параллельно делам в кабинете'}</span></div>}
    {expanded&&world&&<div className="sv-country-body">
      <div className="sv-country-guide">
        <div className="sv-country-label">ПОРУЧЕНИЯ · {stamp(gs,gs.turn)}</div>
        <strong>{terminal?'Проект завершён':project.status==='unassigned'?'Первый шаг — назначить руководителя':quota?'Поручение принято. Теперь — к делу в кабинете':gs.lastTurn?'Доклад получен. Выберите, что изменить':'Можно скорректировать исполнение'}</strong>
        <p>{terminal?'Итоги остаются в досье. Продолжайте управлять страной в кабинете.':project.status==='unassigned'?'Выберите человека во вкладке «Поручения». Он получит финансирование на год.':quota?'Работы продолжатся, когда вы примете основное решение. Следующий доклад придёт после завершения квартала.':'Прочитайте доклад и решите, нужны ли новое поручение, деньги или другой приоритет. Можно оставить текущий план в работе.'}</p>
        <div>{!terminal&&!quota&&<button onClick={showActions}>{project.status==='unassigned'?'Выбрать руководителя':'Выбрать поручение'} →</button>}<button onClick={returnToDesk}>{gs.lastTurn&&!gs.ended?'Открыть дело нового квартала':'К текущему делу в кабинете'} →</button></div>
        <small>Карта и доклады доступны свободно. Одно личное поручение за квартал; время идёт после решения в кабинете.</small>
      </div>
      <div className="sv-country-map" aria-label="Резиденция и промышленный регион">
        <div className="sv-country-river" aria-hidden="true"/>
        <div className="sv-country-route" aria-hidden="true"/>
        <button className="sv-country-place" aria-pressed={place==='capital'} onClick={()=>{setPlace('capital');setPending(null);}}>
          <span aria-hidden="true">▥</span><strong>{COUNTRIES[gs.country].capital}</strong><small>Резиденция</small>
        </button>
        <button className="sv-country-place" aria-pressed={place==='region'} onClick={()=>{setPlace('region');setPending(null);}}>
          <span aria-hidden="true">▤</span><strong>Промышленный регион</strong><small>{terminal?STATUS[project.status]:'Отключения электричества'}</small>
        </button>
      </div>
      {place==='capital'?<div className="sv-country-room">
        <div className="sv-country-label">КАБИНЕТ ПРЕЗИДЕНТА</div>
        <h3>На столе в резиденции</h3>
        <p>{gs.currentEvent?`Входящее дело: «${gs.currentEvent.title}».`:gs.lastTurn?'Газета с последствиями вашего последнего решения.':'Канцелярия готовит новое дело.'}</p>
        <p>Из промышленного региона поступают отдельные доклады. Поручения по энергосети продолжают исполняться, пока вы заняты другими вопросами.</p>
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
            {world.dispatches.length>1&&<details className="sv-country-history"><summary>Предыдущие доклады и поручения ({world.dispatches.length-1})</summary>{world.dispatches.slice(0,-1).reverse().map(d=><article key={d.id}><small>{stamp(gs,Math.max(world.openedTurn,d.turn-(d.kind==='report'||d.kind==='news'?1:0)))}</small><h4><PeopleText>{d.title}</PeopleText></h4><p><PeopleText>{d.text}</PeopleText></p></article>)}</details>}
            {project.status==='running'&&project.lastFactors.length>0&&<article><h4>Что влияет на работу сейчас</h4><ul>{project.lastFactors.map((f,i)=><li key={i}><PeopleText>{f}</PeopleText></li>)}</ul></article>}
            {terminal&&project.lastFactors.length>0&&<article><h4>Что повлияло на исполнение</h4><ul>{project.lastFactors.map((f,i)=><li key={i}><PeopleText>{f}</PeopleText></li>)}</ul></article>}
          </div>}
          {tab==='people'&&<div className="sv-country-people">
            {world.people.map(a=>{const p=worldPerson(gs,a.id);return <article key={p.id}><h4><PeopleText>{p.name}</PeopleText></h4><div>{p.role}{project.executor===p.id?' · руководит проектом':''}</div><div className="sv-country-person-stats">Компетенция {p.competence}/3 · к вам {p.relation>0?'+':''}{p.relation} · {TRAIT[p.trait]}</div><p>{p.goal}.</p></article>;})}
          </div>}
          {tab==='actions'&&<div>
            {terminal?<p>Работа по этому поручению завершена. Доклады и участники остаются в досье региона.</p>:<>
              <p className="sv-country-capacity">Одно личное вмешательство за квартал. Оно не закрывает дело на столе и не переводит время вперёд. Чтение карты и докладов свободно.</p>
              {quota?<p className="sv-country-receipt">Вы уже дали поручение на этот квартал. Оно остаётся в работе после перехода к следующему делу. Примите решение в кабинете, чтобы получить новый доклад и возможность вмешаться ещё раз.</p>:actions.map(a=><div key={a.id}>
                <button type="button" className="sv-country-action" disabled={!!a.blocked} onClick={()=>{setPending(a);setError(null);}} aria-expanded={pending?.id===a.id}>
                  <strong>{a.title}</strong><span>{a.detail}</span><small>{Object.entries(a.cost).map(([k,v])=>`${RESOURCE[k]??k} ${v}`).join(' · ')}{a.blocked?` · ${a.blocked}`:''}</small>
                </button>
                {pending?.id===a.id&&<div className="sv-country-confirm" role="group" aria-label="Подписать личное поручение">
                  <h4>{pending.title}</h4><p>Поручение начнёт исполняться в текущем квартале. Расходы списываются сейчас; результат увидите после решения в кабинете.</p>
                  <div><button onClick={confirm}>Подписать поручение</button><button onClick={()=>setPending(null)}>Отложить</button></div>
                </div>}
              </div>)}
            </>}
            {error&&<p role="alert">{error}</p>}
          </div>}
          {receipt?.turn===gs.turn&&<p className="sv-country-receipt" role="status">Подписано: {receipt.title}. {Object.entries(receipt.cost).map(([k,v])=>`${RESOURCE[k]??k} ${v}`).join(' · ')}. Поручение относится к текущему кварталу. Теперь откройте дело в кабинете; новый доклад придёт после его завершения.</p>}
        </div>
      </div>}
      <button className="sv-country-back" onClick={returnToDesk}>{gs.lastTurn&&!gs.ended?'Продолжить — открыть дело нового квартала':'Продолжить — к текущему делу в кабинете'} →</button>
    </div>}
  </section>;
}
