"use client";
import { trackAppointment } from '@/lib/client/desk-analytics.ts';
import { useImperativeHandle, useRef, useState } from 'react';
import { COUNTRIES } from '@/lib/game/data.ts';
import { monthYear, turnDate } from '@/lib/game/calendar.ts';
import { livingActions, worldPerson } from '@/lib/game/living-world.ts';
import HealthPanel from './HealthPanel.jsx';
import ProjectActions from './ProjectActions.jsx';
import OrderTour from './OrderTour.jsx';
import { healthHasContinuation, healthNeedsAttention } from '@/lib/game/health-aftermath.ts';
import { sponsorSupport } from '@/lib/game/sponsor-world.ts';
import { projectFinished } from '@/lib/game/living-health.ts';
import { PeopleText } from './PeopleText.jsx';
import RepublicMap from './RepublicMap.jsx';
import { isRepublicMapVisible } from '@/lib/game/republic-map.ts';

const STATUS={unassigned:'Ожидает поручения',running:'Работа продолжается',completed:'Сеть восстановлена',partial:'Восстановлена частично',failed:'Срок сорван'};
const RESOURCE={economy:'экономика',politicalCapital:'политкапитал',personalResource:'личный ресурс',externalReputation:'репутация'};
const TRAIT={careerist:'карьерист',idealist:'идеалист',apparatchik:'аппаратчик',pragmatist:'прагматик',hawk:'ястреб',populist:'популист'};
const stamp=(gs,turn)=>monthYear(turnDate(gs.seed,COUNTRIES[gs.country].startYear,Math.max(0,turn)));

export default function WorldPanel({ ref, gs, onOpen, onAction, Scene, onViewChange, onContinue, onCurrentCase, compact = false }) {
  const [expanded,setExpanded]=useState(false);
  const [lessonMode,setLessonMode]=useState(null);
  const tour=useRef(null);
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
  const latestDispatch = place === 'health'
    ? world?.dispatches.filter(report => report.project === 'health').at(-1)
    : latest;
  const selected=place==='health'?world?.health:project;
  const continuation = place === 'health' ? world?.health?.aftermath : null;
  const waitingConcession = continuation?.phase==='settled' && continuation.bargain?.reviewDue!=null;
  const selectedFinished=selected&&projectFinished(selected)&&!(place==='health'&&healthHasContinuation(world?.health));
  const projects=world?[['region','Энергосеть',world.project],...(world.health?[['health','Районные больницы',world.health]]:[])]:[];
  const activeProjects = projects.filter(([, , item]) => !projectFinished(item)||(item===world?.health&&healthHasContinuation(world.health))).length;
  const attention = healthNeedsAttention(world?.health);
  const selectTab = nextTab => {
    setTab(nextTab);
    setPending(null);
    setError(null);
  };
  const openProject = (id, nextTab = 'dispatches') => {
    if (!world?.health) onOpen();
    setLessonMode(null);
    setExpanded(true);
    setPlace(id === 'health' ? 'health' : 'region');
    selectTab(nextTab);
    onViewChange(true);
    requestAnimationFrame(() => tabs.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const showActions = () => openProject(place, 'actions');
  const startHospital=(mode)=>{
    if(!world?.health)onOpen();
    setExpanded(true);setPlace('health');setLessonMode(mode);setPending(null);onViewChange(true);
    requestAnimationFrame(()=>tour.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  useImperativeHandle(ref,()=>({
    close: () => {setExpanded(false);setLessonMode(null);setPending(null);onViewChange(false);},
    showProject: id => openProject(id, 'actions'),
    startHospital,
    showReport: () => openProject(place),
  }));
  const returnToDesk = () => {
    setExpanded(false);
    setLessonMode(null);
    setPending(null);
    setError(null);
    onViewChange(false);
    requestAnimationFrame(onCurrentCase);
  };
  const continueFromProjects = () => {
    returnToDesk();
    onContinue();
  };
  const toggle=()=>{
    const open=!expanded;
    if(open&&!world?.health)onOpen();
    setLessonMode(null);setExpanded(open);onViewChange(open);setPending(null);setError(null);if(open&&!world)setTab('actions');
  };
  const confirm = () => {
    if (!pending || pending.blocked) return;
    try {
      onAction(pending.id);
      trackAppointment(gs, pending.id);
      const project = pending.id.startsWith('health:') ? 'health' : 'energy';
      setReceipt({ turn: gs.turn, project, title: pending.title, cost: pending.cost });
      setPlace(project === 'health' ? 'health' : 'region');
      setPending(null);
      setError(null);
      setTab('dispatches');
      if (lessonMode) requestAnimationFrame(() => tour.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (error) {
      setError(error.message);
    }
  };
  if(gs.daily || compact && !expanded)return null;
  const quota=world?.lastActionTurn===gs.turn;
  const terminal=project&&['completed','partial','failed'].includes(project.status);
  return <section data-world-panel className="sv-country">
    <button type="button" className="sv-country-toggle" aria-expanded={expanded} onClick={toggle}>
      <span>ПРОЕКТЫ · ПОРУЧЕНИЯ И ДОКЛАДЫ <span className="sv-country-arrow">{expanded?'▴':'▾'}</span></span>
      <span>{!world?'Кабинет и исполнители':attention?'Больницы ждут ответа':world.health?.status==='unassigned'?'Больницы ждут назначения':world.health?.status==='running'?'Больницы: работа идёт':project.status==='unassigned'?'Энергосеть ждёт назначения':activeProjects?'Ожидаются доклады':'Итоги в досье'}</span>
    </button>
    {!expanded&&attention&&<button className="sv-agenda-attention" onClick={()=>{setLessonMode(null);setExpanded(true);setPlace('health');setTab('dispatches');setPending(null);onViewChange(true);}}>Больницы ждут ответа · {Math.max(0,(world.health.aftermath.bargain?.phase==='open'?world.health.aftermath.due:world.health.aftermath.deadline)-gs.turn)} кв. →</button>}
    {expanded&&latestDispatch&&<div className="sv-country-latest">{stamp(gs,Math.max(world.openedTurn,latestDispatch.turn-(['report','news'].includes(latestDispatch.kind)?1:0)))} · {latestDispatch.title}</div>}
    {expanded && !lessonMode && world && <nav className="sv-agenda-projects" aria-label="Выбрать проект">
      {projects.map(([id, title, item]) => {
        const hasContinuation = id === 'health' && healthHasContinuation(item);
        const needsAnswer = id === 'health' && healthNeedsAttention(item);
        const finished = projectFinished(item) && !hasContinuation;
        const remaining = Math.max(0, item.deadline - gs.turn);
        const status = needsAnswer ? 'Требуется ваше решение'
          : hasContinuation ? 'Программа завершена; обязательства остаются'
          : item.status === 'unassigned' ? 'Нужен руководитель'
          : item.status === 'running' ? `${item.progress}% · работа идёт`
          : item.status === 'completed' ? 'Завершён'
          : item.status === 'partial' ? 'Частичный результат' : 'Срок сорван';
        return <article key={id} className="sv-project-card" data-selected={place === id || undefined}>
          <button type="button" data-agenda-project={id} aria-pressed={place === id}
            onClick={() => openProject(id, item.status === 'unassigned' ? 'actions' : 'dispatches')}>
            <strong>{title}</strong>
            <span>{status}</span>
            <small>{hasContinuation ? 'Срок следующего доклада — в досье ниже'
              : finished ? 'Результат — в докладах' : `${remaining} кв. до срока`}</small>
          </button>
          <div className="sv-project-shortcuts">
            <button type="button" data-project-action={id} onClick={() => openProject(id, 'actions')}>
              {item.status === 'unassigned' ? 'Назначить руководителя' : needsAnswer ? 'Ответить на доклад' : 'Поручения'} →
            </button>
            <button type="button" data-project-report={id} onClick={() => openProject(id)}>Доклады →</button>
          </div>
        </article>;
      })}
    </nav>}


    {expanded&&world&&lessonMode?<div ref={tour} className="sv-country-body">
      <OrderTour gs={gs} mode={lessonMode} receipt={receipt}
        actionsProps={{gs,actions:actions.filter(action=>action.id.startsWith('health:')),quota,pending,setPending,confirm,error}}
        onAdjust={()=>{setLessonMode('adjust');setPending(null);requestAnimationFrame(()=>tour.current?.scrollIntoView({behavior:'smooth',block:'start'}));}}
        onDesk={returnToDesk} onBrowse={()=>{setLessonMode(null);setPlace('health');setTab('dispatches');}}/>
    </div>:expanded&&world&&<div className="sv-country-body">
      <div className="sv-country-guide">
        <div className="sv-country-label">{place === 'health' ? 'РАЙОННЫЕ БОЛЬНИЦЫ' : 'ЭНЕРГОСЕТЬ'} · {stamp(gs,gs.turn)}</div>
        <strong>{place==='health'&&healthNeedsAttention(world.health)&&!quota?'Последствия программы требуют решения':continuation?.phase==='working'?'Подписанное поручение исполняется':continuation?.phase==='scheduled'?'Программа закончена; история продолжается':waitingConcession?'Последствия кадровой уступки ещё впереди':selectedFinished?'Проект завершён':quota?'Поручение принято. Теперь — к делу в кабинете':selected?.status==='unassigned'?'Первый шаг — назначить руководителя':gs.lastTurn?'Доклад получен. Выберите, что изменить':'Можно скорректировать исполнение'}</strong>
        <p>{place==='health'&&healthNeedsAttention(world.health)&&!quota?'Прочитайте новый доклад и выберите ответ во вкладке «Поручения». Срок указан в досье; без ответа ситуация изменится сама.':continuation?.phase==='working'?'Исполнитель готовит итоговый доклад. Продолжайте решения в кабинете: время и согласования идут после них.':continuation?.phase==='scheduled'?'Результат программы уже известен. Следующий доклад покажет бюджетные или кадровые последствия выбранного вами пути.':waitingConcession?'График уже проверен. Следующий доклад покажет политическую цену переданных министру назначений. Она указана в досье и объяснении политкапитала; нового поручения сейчас не требуется.':selectedFinished?activeProjects?'Итоги остаются в досье. Другой проект продолжает работу.':'Итоги остаются в досье. Сведения об обязательствах — в докладе. Продолжите управление из кабинета.':quota?'Поручение уже подписано. Второй проект можно поручить после следующего решения в кабинете. Назначенные исполнители продолжат работу.':selected?.status==='unassigned'?'Выберите человека во вкладке «Поручения». Он получит финансирование на год.':'Прочитайте доклад и решите, нужны ли новое поручение, деньги или другой приоритет. Можно оставить текущий план в работе.'}</p>
        <div>
          {!selectedFinished && !quota && (!continuation || healthNeedsAttention(world.health)) &&
            <button onClick={showActions}>{selected?.status === 'unassigned' ? 'Выбрать руководителя' : 'Выбрать поручение'} →</button>}
          <button onClick={returnToDesk}>{gs.lastTurn ? 'Вернуться к результату хода' : 'Вернуться к делу'} →</button>
        </div>
        <small>Карта и доклады доступны свободно. Одно личное поручение на оба проекта за квартал. Общий резерв экономики: {gs.resources.economy}. Время идёт после решения в кабинете.</small>
      </div>
      {isRepublicMapVisible(gs) ? (
        <RepublicMap
          gs={gs}
          onSelectRegion={(regId) => {
            if (regId === 'minsk') setPlace('region');
            else if (regId === 'polesie' && world.health) setPlace('health');
            else setPlace('capital');
          }}
        />
      ) : (
        <div className="sv-country-map" aria-label="Резиденция и два проекта страны">
          <div className="sv-country-river" aria-hidden="true"/>
          <div className="sv-country-route" aria-hidden="true"/>
          <button className="sv-country-place" aria-pressed={place==='capital'} onClick={() => { setPlace('capital'); selectTab('dispatches'); }}>
            <span aria-hidden="true">▥</span><strong>{COUNTRIES[gs.country].capital}</strong><small>Резиденция</small>
          </button>
          <button className="sv-country-place" aria-pressed={place==='region'} onClick={() => openProject('region')}>
            <span aria-hidden="true">▤</span><strong>Промышленный регион</strong><small>{terminal?STATUS[project.status]:'Отключения электричества'}</small>
          </button>
          {world.health && <button className="sv-country-place" aria-pressed={place === 'health'} onClick={() => openProject('health')}>
            <span aria-hidden="true">✚</span><strong>Районные больницы</strong><small>{world.health.progress}% · кадры</small>
          </button>}
        </div>
      )}
      {place === 'health' && world.health ? <HealthPanel gs={gs} Scene={Scene} tab={tab} setTab={selectTab} tabs={tabs} stamp={stamp}
        actionsProps={{ gs, actions: actions.filter(action => action.id.startsWith('health:')), quota, pending, setPending, confirm, error }}/>
        : place === 'capital' ? <div className="sv-country-room">
        <div className="sv-country-label">КАБИНЕТ ПРЕЗИДЕНТА</div>
        <h3>На столе в резиденции</h3>
        <p>{gs.currentEvent?`Входящее дело: «${gs.currentEvent.title}».`:gs.lastTurn?'Газета с последствиями вашего последнего решения.':'Канцелярия готовит новое дело.'}</p>
        <p>Из промышленного региона поступают отдельные доклады. Поручения по энергосети и районным больницам продолжают исполняться, пока вы заняты другими вопросами.</p>
      <button className="sv-country-back" onClick={returnToDesk}>{gs.lastTurn ? 'Вернуться к результату хода' : 'Вернуться к делу на столе'} ↓</button>
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
        {project.status==='running'&&<div className="sv-country-capacity">Финансирование осталось на {project.funds} кв.{project.secured?' · дополнительные бригады работают':''}{project.procurementFixed?' · поставщик заменён':sponsorSupport(world)?' · адаптация по соглашению со спонсором':project.deal?' · согласована адаптация оборудования':''}</div>}
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
          {tab==='actions'&&<ProjectActions gs={gs} actions={actions.filter(action=>!['health:', 'sponsor:', 'government:', 'minister:'].some(prefix=>action.id.startsWith(prefix)))} quota={quota} terminal={terminal} pending={pending} setPending={setPending} confirm={confirm} error={error}/>}

        </div>
      </div>}
          {receipt?.turn===gs.turn&&<p className="sv-country-receipt" role="status">Подписано: {receipt.title}. {Object.entries(receipt.cost).map(([k,v])=>`${RESOURCE[k]??k} ${v}`).join(' · ')}. Поручение относится к текущему кварталу. Теперь откройте дело в кабинете; новый доклад придёт после его завершения.</p>}
      <button className="sv-country-back" data-project-return onClick={returnToDesk}>
        {gs.lastTurn ? 'Вернуться к результату хода' : 'Вернуться к текущему делу'} →
      </button>
      {gs.lastTurn && !gs.ended && <button className="sv-country-back" onClick={continueFromProjects}>Следующий ход →</button>}
    </div>}
  </section>;
}
