"use client";
import { HEALTH_PEOPLE, projectFinished } from '@/lib/game/living-health.ts';
import { worldPerson } from '@/lib/game/living-world.ts';
import { PeopleText } from './PeopleText.jsx';
import ProjectActions from './ProjectActions.jsx';

export default function HealthPanel({ gs, Scene, tab, setTab, tabs, stamp, actionsProps }) {
  const project = gs.world.health;
  const finished = projectFinished(project);
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
    {project.followupTurn!==null&&<p className="sv-country-receipt">Проект завершён, обязательства остаются. Следующий доклад — {stamp(gs,project.followupTurn-1)}: {project.approach==='rotation'?'замена специалистов в областных центрах':'содержание постоянных ставок'}.</p>}
    <div ref={tabs} className="sv-country-tabs" role="tablist" aria-label="Досье районных больниц">
      {[['dispatches','Доклады'],['people','Люди'],['actions','Поручения']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);actionsProps.setPending(null);}}>{label}</button>)}
    </div>
    {tab==='dispatches'&&<div className="sv-country-dispatches" role="tabpanel">
      {latest&&<article><small>{date(latest)}</small><h4><PeopleText>{latest.title}</PeopleText></h4><p><PeopleText>{latest.text}</PeopleText></p></article>}
      {project.lastFactors.length>0&&<article><h4>Что повлияло на работу</h4><ul>{project.lastFactors.map((factor,index)=><li key={index}><PeopleText>{factor}</PeopleText></li>)}</ul></article>}
      {reports.length>1&&<details className="sv-country-history"><summary>Предыдущие доклады и поручения ({reports.length-1})</summary>{reports.slice(0,-1).reverse().map(report=><article key={report.id}><small>{date(report)}</small><h4><PeopleText>{report.title}</PeopleText></h4><p><PeopleText>{report.text}</PeopleText></p></article>)}</details>}
    </div>}
    {tab==='people'&&<div className="sv-country-people" role="tabpanel">{gs.world.people.filter(person=>HEALTH_PEOPLE.includes(person.id)).map(raw=>{const person=worldPerson(gs,raw.id);return <article key={person.id}><h4><PeopleText>{person.name}</PeopleText></h4><div>{person.role}</div><p className="sv-country-person-stats">Компетенция {person.competence}/3 · к вам {person.relation>0?'+':''}{person.relation}</p><p>{person.goal}.</p>{gs.world.project.status==='running'&&gs.world.project.executor===person.id&&<p className="sv-country-receipt">Уже руководит энергосетью. Второе назначение замедлит оба проекта.</p>}</article>;})}</div>}
    {tab==='actions'&&<div role="tabpanel"><ProjectActions {...actionsProps} terminal={finished}/></div>}
  </div>;
}
