"use client";
import { BARGAIN_PLANS } from '@/lib/game/health-bargain.ts';
import { AFTERMATH_TITLE, healthNeedsAttention } from '@/lib/game/health-aftermath.ts';
import { HEALTH_PEOPLE, projectFinished } from '@/lib/game/living-health.ts';
import { worldPerson } from '@/lib/game/living-world.ts';
import { PeopleText } from './PeopleText.jsx';
import ProjectActions from './ProjectActions.jsx';

export default function HealthPanel({ gs, Scene, tab, setTab, tabs, stamp, actionsProps }) {
  const project = gs.world.health;
  const finished = projectFinished(project);
  const continuation = project.aftermath;
  const bargain = continuation?.bargain;
  const reports = gs.world.dispatches.filter(report => report.project === 'health');
  const latest = reports.at(-1);
  const date = report => stamp(gs, Math.max(project.openedTurn, report.turn - (['report','news'].includes(report.kind) ? 1 : 0)));
  return <div className="sv-country-room" data-health-panel>
    <div className="sv-country-label">РАЙОННЫЕ БОЛЬНИЦЫ · КАДРЫ</div><h3>Врач рядом с домом</h3>
    <div className="sv-country-photo"><Scene gs={gs} sceneKey="hospital" partner={`clinic:${project.progress}`} height={42}/></div>
    <p>{project.status === 'completed' ? 'Районные отделения открыты. Пациентам больше не приходится ехать в областной центр за каждой консультацией.' : project.status === 'partial' ? 'Часть отделений работает. В остальных районах жители ещё ждут специалистов.' : project.status === 'failed' ? 'Год прошёл, незанятые ставки остались пустыми. Жители требуют объяснений.' : 'Отделения закрыты из-за нехватки специалистов. Постоянный набор потребует денег и времени; перевод из областных центров ускорит работу за их счёт.'}</p>
    <div className="sv-country-summary">
      <div><small>Срок</small><strong>{stamp(gs,project.deadline-1)}</strong><span>{finished?'Работа завершена':`${Math.max(0,project.deadline-gs.turn)} кв. до срока`}</span></div>
      <div><small>Руководитель</small><strong>{project.executor?<PeopleText>{worldPerson(gs,project.executor).name}</PeopleText>:'Не назначен'}</strong><span>{project.executor?worldPerson(gs,project.executor).role:'Нужны человек и кадровый бюджет'}</span></div>
      <div><small>Укомплектовано</small><strong>{project.progress}%</strong><span>{project.approach==='rotation'?'Временные переводы':'Постоянный набор'}</span></div>
    </div>
    {!finished&&project.status==='running'&&<p className="sv-country-capacity">Финансирование осталось на {project.funds} кв.{project.secured?' · жильё и резерв обеспечены':''}{project.cover?' · есть политическая поддержка':''}</p>}
    {project.followupTurn!==null&&!continuation&&<p className="sv-country-receipt">Проект завершён, обязательства остаются. Следующий доклад — {stamp(gs,project.followupTurn-1)}: {project.approach==='rotation'?'замена специалистов в областных центрах':'содержание постоянных ставок'}.</p>}
    {continuation&&<article className="sv-country-receipt" data-health-aftermath>
      <div className="sv-country-label">ПОСЛЕДСТВИЯ ВАШЕГО РЕШЕНИЯ</div>
      <h4>{AFTERMATH_TITLE[continuation.branch]}</h4>
      <p><strong>Почему это произошло.</strong> <PeopleText>{continuation.cause}</PeopleText></p>
      <p>{continuation.phase==='scheduled'?`Новый доклад через ${Math.max(0,continuation.due-gs.turn)} кв.`:continuation.phase==='open'?`Требуется ваш ответ. Осталось ${Math.max(0,continuation.deadline-gs.turn)} кв.; без ответа ситуация изменится сама.`:continuation.phase==='working'?`Поручение исполняется. Доклад через ${Math.max(0,continuation.due-gs.turn)} кв.`:continuation.outcome==='neglected'?'Срок прошёл без вмешательства. Последствия — в итоговом докладе.':continuation.outcome==='fulfilled'?'Поручение исполнено. Результат — в итоговом докладе.':'Получен ограниченный результат. Причины — в итоговом докладе.'}</p>
      {continuation.executor&&<p>Исполнитель: <PeopleText>{worldPerson(gs,continuation.executor).name}</PeopleText>.</p>}
      {continuation.phase==='open'&&<button className="sv-health-response" onClick={()=>setTab('actions')}>Выбрать ответ на доклад →</button>}
    </article>}
    {bargain&&bargain.phase!=='waiting'&&<article className="sv-country-receipt" data-health-bargain>
      <div className="sv-country-label">СПОР О ПОЛНОМОЧИЯХ</div><h4>Кто управляет графиком</h4>
      <p><PeopleText>{bargain.ministerCondition}</PeopleText></p>
      <p><PeopleText>{bargain.doctorCondition}</PeopleText></p>
      <p>К вам сейчас: министр {worldPerson(gs,'healthMinister').relation > 0 ? '+' : ''}{worldPerson(gs,'healthMinister').relation}, главный врач {worldPerson(gs,'doctor').relation > 0 ? '+' : ''}{worldPerson(gs,'doctor').relation}. Поддержка не отменяет собственных интересов.</p>
      <p>{bargain.phase==='open'?`Нужен ответ до итогового доклада: ${Math.max(0,continuation.due-gs.turn)} кв. Без ответа ведомство задержит график.`:bargain.phase==='ignored'?'Вы оставили спор без ответа. Его влияние объяснено в итоговом докладе.':`Вы подписали: «${BARGAIN_PLANS[bargain.choice].title}».`}</p>
      {bargain.reviewDue!==null&&<p>Цена уступки ещё впереди: −2 политкапитала через {Math.max(0,bargain.reviewDue-gs.turn)} кв. Министр укрепит собственную сеть назначениями.</p>}
      {bargain.phase==='open'&&<button className="sv-health-response" onClick={()=>{setTab('actions');actionsProps.setPending(null);}}>Разрешить спор исполнителей →</button>}
    </article>}
    <div ref={tabs} className="sv-country-tabs" role="tablist" aria-label="Досье районных больниц">
      {[['dispatches','Доклады'],['people','Люди'],['actions','Поручения']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);actionsProps.setPending(null);}}>{label}</button>)}
    </div>
    {tab==='dispatches'&&<div className="sv-country-dispatches" role="tabpanel">
      {latest&&<article><small>{date(latest)}</small><h4><PeopleText>{latest.title}</PeopleText></h4><p><PeopleText>{latest.text}</PeopleText></p></article>}
      {(continuation?.factors.length||project.lastFactors.length)>0&&<article><h4>{continuation?.factors.length?'Что повлияло на исполнение':'Что повлияло на программу'}</h4><ul>{(continuation?.factors.length?continuation.factors:project.lastFactors).map((factor,index)=><li key={index}><PeopleText>{factor}</PeopleText></li>)}</ul></article>}
      {reports.length>1&&<details className="sv-country-history"><summary>Предыдущие доклады и поручения ({reports.length-1})</summary>{reports.slice(0,-1).reverse().map(report=><article key={report.id}><small>{date(report)}</small><h4><PeopleText>{report.title}</PeopleText></h4><p><PeopleText>{report.text}</PeopleText></p></article>)}</details>}
    </div>}
    {tab==='people'&&<div className="sv-country-people" role="tabpanel">{gs.world.people.filter(person=>HEALTH_PEOPLE.includes(person.id)).map(raw=>{const person=worldPerson(gs,raw.id);return <article key={person.id}><h4><PeopleText>{person.name}</PeopleText></h4><div>{person.role}</div><p className="sv-country-person-stats">Компетенция {person.competence}/3 · к вам {person.relation>0?'+':''}{person.relation}</p><p>{person.goal}.</p>{gs.world.project.status==='running'&&gs.world.project.executor===person.id&&<p className="sv-country-receipt">Уже руководит энергосетью. Второе назначение замедлит оба проекта.</p>}</article>;})}</div>}
    {tab==='actions'&&<div role="tabpanel">{continuation&&!healthNeedsAttention(project)?<p>{continuation.phase==='scheduled'?'Сейчас ожидается новый доклад. Продолжите управление из кабинета.':continuation.phase==='working'?'Поручение уже исполняется; следующий доклад покажет результат.':bargain?.reviewDue!=null?'Поручение завершено; ожидается политическая цена переданного министру контроля над кадрами. Срок указан выше.': 'История этого поручения завершена. Итоги остаются в досье.'}</p>:<ProjectActions {...actionsProps} terminal={finished&&!healthNeedsAttention(project)}/>}</div>}
  </div>;
}
