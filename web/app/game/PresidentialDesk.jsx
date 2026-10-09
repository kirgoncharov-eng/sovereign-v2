"use client";
import { useState } from 'react';
import { personProfiles } from '@/lib/client/people-text.ts';
import { messageUnread, presidentialMessages } from '@/lib/client/presidential-inbox.ts';
import MinisterPanel from './MinisterPanel.jsx';
import SponsorPanel from './SponsorPanel.jsx';
import GovernmentPanel from './GovernmentPanel.jsx';
import { PeopleText } from './PeopleText.jsx';
export default function PresidentialDesk({gs,Portrait,Scene,onAction,onRead,onViewChange,onProject,onDesk}) {
  const [view,setView]=useState(null),[everyone,setEveryone]=useState(false);
  if(gs.daily||!gs.world)return null;
  const profiles=personProfiles(gs).filter(p=>!['leader','arc-target'].includes(p.id)&&!p.id.startsWith('former:'));
  const messages=presidentialMessages(gs),unread=messages.filter(m=>messageUnread(gs,m)).length;
  const people=profiles.filter(p=>everyone||messages.some(m=>m.person===p.id)||p.name===gs.world.sponsor?.name);
  const person=profiles.find(p=>p.id===view),incoming=messages.filter(m=>m.person===view);
  const close=()=>{setView(null);onViewChange(false);requestAnimationFrame(onDesk)};
  const government=()=>{setView('government');onViewChange(true);const p=profiles.find(p=>p.id==='advisor:economist');if(p)onRead(p.id)};
  const project=id=>{close();onProject(id)};
  return <section className="sv-presidential-desk" data-presidential-desk>
    <button className="sv-desk-current-case" onClick={close}><small>{gs.currentEvent?"ГЛАВНОЕ ДЕЛО · ТРЕБУЕТ РЕШЕНИЯ":"ИТОГИ ГЛАВНОГО РЕШЕНИЯ"}</small><strong>{gs.currentEvent?.title??gs.lastTurn?.headline??"Заседание кабинета"} →</strong></button>
    <div className="sv-desk-heading"><strong>ЛЮДИ И ПРАВИТЕЛЬСТВО</strong><span>{unread?`${unread} новых сообщений`:'Новых сообщений нет'}</span></div>
    <div className="sv-desk-people" aria-label="Действующие лица">{people.map(p=>{const own=messages.filter(m=>m.person===p.id),newCount=own.filter(m=>messageUnread(gs,m)).length,waiting=own.some(m=>m.needsReply);return <button key={p.id} className="sv-desk-person" data-desk-person={p.id} aria-pressed={view===p.id} onClick={()=>{setView(p.id);onViewChange(true);onRead(p.id)}}><span className="sv-desk-portrait"><Portrait name={p.name} size={36}/>{newCount>0&&<b aria-label={`${newCount} непрочитанных`}>{newCount}</b>}</span><span><strong>{p.name}</strong><small>{own[0]?.title??p.role}</small><em>{waiting?'Требует решения':newCount?'Новое сообщение':own.length?'Прочитано':'Досье'}</em></span></button>})}</div>
    <div className="sv-desk-controls"><button onClick={()=>setEveryone(!everyone)}>{everyone?'Свернуть круг лиц':'Все действующие лица'}</button><button className="sv-desk-government" aria-expanded={view==='government'} onClick={()=>view==='government'?close():government()}>Предложения правительства · 5 направлений →</button></div>
    {view==='government'&&<GovernmentPanel gs={gs} onAction={onAction} onClose={close} onDetails={project}/>}
    {person&&<div className="sv-desk-correspondence"><header><Portrait name={person.name} size={42}/><div><h3><PeopleText>{person.name}</PeopleText></h3><p>{person.role}{person.relation!==null?` · к вам ${person.relation>0?'+':''}${person.relation}`:''}</p></div></header>
      {!incoming.length&&<p>Новых обращений от этого человека нет. Его досье можно открыть по имени.</p>}
      {incoming.map(m=><article key={m.key} className="sv-desk-message"><small>{m.needsReply?'ТРЕБУЕТ РЕШЕНИЯ':'СООБЩЕНИЕ ПРОЧИТАНО'}{m.deadline?` · до конца квартала ${m.deadline}`:''}</small><h4>{m.title}</h4>
        {m.action==='minister'?<MinisterPanel gs={gs} Scene={Scene} onAction={onAction} onClose={close}/>:m.action==='sponsor'?<SponsorPanel embedded gs={gs} Scene={Scene} onAction={onAction} onViewChange={onViewChange} onClose={close}/>:<><p><PeopleText>{m.text}</PeopleText></p><button className="sv-desk-link" onClick={()=>m.action==='government'?government():project(m.action)}>{m.action==='government'?'Рассмотреть проекты правительства':'Открыть поручения и доклады'} →</button></>}
      </article>)}
      {!incoming.some(m=>['sponsor','minister'].includes(m.action))&&<button className="sv-desk-link" onClick={close}>Вернуться к главному делу →</button>}
    </div>}
  </section>;
}
