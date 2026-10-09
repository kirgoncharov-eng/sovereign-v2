"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { personProfiles } from '@/lib/client/people-text.ts';
import { messageUnread, presidentialMessages } from '@/lib/client/presidential-inbox.ts';
import CommitmentBrief from './CommitmentBrief.jsx';
import { commitmentBriefs } from '@/lib/client/commitment-brief.ts';
import { governmentLoad } from '@/lib/game/government.ts';
import MinisterPanel from './MinisterPanel.jsx';
import SponsorPanel from './SponsorPanel.jsx';
import GovernmentPanel from './GovernmentPanel.jsx';
import { PeopleText } from './PeopleText.jsx';

export default function PresidentialDesk({ gs, Portrait, Scene, onAction, onRead, onViewChange, onProject, onDesk }) {
  const [view, setView] = useState(null);
  const [everyone, setEveryone] = useState(false);
  const [governmentSelection, setGovernmentSelection] = useState('energy');
  const [messageKey, setMessageKey] = useState(null);
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!view) { if (element.open) element.close(); return; }
    if (!element.open) element.showModal();
    element.scrollTop = 0;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [view]);
  if (gs.daily || !gs.world) return null;
  const profiles = personProfiles(gs).filter(p => !['leader', 'arc-target'].includes(p.id) && !p.id.startsWith('former:'));
  const messages = presidentialMessages(gs);
  const commitments = commitmentBriefs(gs);
  const unread = messages.filter(m => messageUnread(gs, m)).length;
  const waiting = messages.filter(m => m.needsReply).length;
  const people = profiles.filter(p => everyone || messages.some(m => m.person === p.id) || p.name === gs.world.sponsor?.name)
    .sort((a, b) => Number(messages.some(m => m.person === b.id && m.needsReply)) - Number(messages.some(m => m.person === a.id && m.needsReply)));
  const person = profiles.find(p => p.id === view);
  const incoming = messages.filter(m => m.person === view);
  const selected = incoming.find(m => m.key === messageKey) ?? incoming.find(m => m.needsReply) ?? incoming[0];
  const open = next => { setView(next); setMessageKey(null); onViewChange(true); };
  const close = (toCase = true) => { setView(null); onViewChange(false); if (toCase) requestAnimationFrame(onDesk); };
  const government = (id = 'energy') => { setGovernmentSelection(id); open('government'); const advisor = profiles.find(p => p.id === 'advisor:economist'); if (advisor) onRead(advisor.id); };
  const project = id => { close(false); requestAnimationFrame(() => onProject(id)); };
  return <section className="sv-presidential-desk sv-desk-compact" data-presidential-desk>
    <nav className="sv-desk-entry" aria-label="Собственные инициативы">
      <button className="sv-desk-inbox" onClick={() => open('people')}><strong>Сообщения{unread ? ` · ${unread} новых` : ''}</strong><span>{waiting ? `${waiting} ждут ответа` : 'Люди и договорённости'}</span></button>
      <button className="sv-desk-government" onClick={()=>government()}><strong>Правительство</strong><span>{governmentLoad(gs.world)}/2 программ в работе</span></button>
    </nav>
    <small className="sv-desk-attention">{gs.world.lastActionTurn === gs.turn ? 'Личное поручение подписано · главное дело ещё доступно' : 'Одно личное поручение на квартал · чтение свободно'}</small>
    <dialog ref={dialog} className="sv-desk-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
      <header className="sv-desk-dialog-header"><h2 id={titleId}>{view === 'government' ? 'Правительство' : view === 'commitments' ? 'Ваши договорённости' : person ? 'Личное обращение' : 'Сообщения и люди'}</h2><button aria-label="Закрыть и вернуться к главному делу" onClick={() => close()}>×</button><p className="sv-desk-wallet">Экономика {gs.resources.economy} · политкапитал {gs.resources.politicalCapital} · личный ресурс {gs.resources.personalResource}</p></header>
      <div className="sv-desk-dialog-body">
        {person && <button className="sv-desk-link" onClick={() => open('people')}>← Все сообщения</button>}
        {['people', 'commitments'].includes(view) && <nav className="sv-brief-tabs" aria-label="Сообщения и договорённости"><button aria-pressed={view==='people'} onClick={()=>open('people')}>Обращения</button><button aria-pressed={view==='commitments'} onClick={()=>open('commitments')}>Договорённости · {commitments.filter(c=>c.active).length}</button></nav>}
        {view==='commitments'&&<CommitmentBrief entries={commitments} canOpen={entry=>entry.target.kind!=='person'||profiles.some(p=>p.name===entry.target.name)} onOpen={entry=>{if(entry.target.kind==='person'){const p=profiles.find(p=>p.name===entry.target.name);if(p){open(p.id);setMessageKey(entry.target.message);onRead(p.id);}}else if(entry.target.kind==='project')project(entry.target.id);else government(entry.target.id);}}/>}
        {view === 'people' && <>
          <p className="sv-desk-intro">{waiting ? `${waiting} обращений ждут ответа. Прочтение не заменяет решение.` : 'Договорённости и доклады остаются здесь после прочтения.'}</p>
          <div className="sv-desk-people" aria-label="Действующие лица">{people.map(p => {
            const own = messages.filter(m => m.person === p.id), newCount = own.filter(m => messageUnread(gs, m)).length;
            const request = own.find(m => m.needsReply);
            return <button key={p.id} className="sv-desk-person" data-desk-person={p.id} onClick={() => { open(p.id); onRead(p.id); }}><span className="sv-desk-portrait"><Portrait name={p.name} size={36}/>{newCount > 0 && <b aria-label={`${newCount} непрочитанных`}>{newCount}</b>}</span><span><strong>{p.name}</strong><small>{request?.title ?? own[0]?.title ?? p.role}</small><em>{request ? `Ждёт ответа${request.deadline ? ` · до квартала ${request.deadline}` : ''}` : newCount ? 'Новое сообщение' : own.length ? 'Прочитано' : 'Досье'}</em></span></button>;
          })}</div>
          <button className="sv-desk-link" onClick={() => setEveryone(!everyone)}>{everyone ? 'Только обращения' : 'Все действующие лица'}</button>
        </>}
        {view === 'government' && <GovernmentPanel key={governmentSelection} initialProject={governmentSelection} gs={gs} onAction={onAction} onClose={() => close()} onDetails={project}/>}
        {person && <div className="sv-desk-correspondence"><header><Portrait name={person.name} size={42}/><div><h3><PeopleText>{person.name}</PeopleText></h3><p>{person.role}{person.relation !== null ? ` · к вам ${person.relation > 0 ? '+' : ''}${person.relation}` : ''}</p></div></header>
          {!incoming.length && <p>Обращений нет. Его досье можно открыть по имени.</p>}
          {incoming.length > 1 && <nav className="sv-desk-message-list" aria-label="Обращения человека">{incoming.map(m => <button key={m.key} aria-pressed={selected?.key === m.key} onClick={() => setMessageKey(m.key)}><strong>{m.title}</strong><span>{m.needsReply ? 'Ждёт ответа' : m.key === 'minister-mandate' || m.key === 'sponsor' ? 'Договорённость' : 'Доклад'}</span></button>)}</nav>}
          {selected && <article key={selected.key} className="sv-desk-message"><small>{selected.needsReply ? 'ЖДЁТ ВАШЕГО ОТВЕТА' : 'ДОГОВОРЁННОСТЬ ИЛИ ДОКЛАД'}{selected.deadline ? ` · до конца квартала ${selected.deadline}` : ''}</small><h4>{selected.title}</h4>
            {selected.action === 'minister' ? <MinisterPanel gs={gs} Scene={Scene} onAction={onAction} onClose={() => close()}/> : selected.action === 'sponsor' ? <SponsorPanel embedded gs={gs} Scene={Scene} onAction={onAction} onViewChange={onViewChange} onClose={() => close()}/> : <><p><PeopleText>{selected.text}</PeopleText></p><button className="sv-desk-link" onClick={() => selected.action === 'government' ? government(selected.key==='housing-next'?'housing':selected.key.startsWith('program:')?selected.key.split(':')[1]:'energy') : project(selected.action)}>{selected.action === 'government' ? 'Рассмотреть проекты правительства' : 'Открыть поручения и доклады'} →</button></>}
          </article>}
        </div>}
        {!(person && ['minister', 'sponsor'].includes(selected?.action)) && view !== 'government' && <button className="sv-desk-link" onClick={() => close()}>Вернуться к главному делу →</button>}
      </div>
    </dialog>
  </section>;
}
