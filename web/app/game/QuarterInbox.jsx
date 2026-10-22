"use client";
import { presidentialMessages, messageUnread } from '@/lib/client/presidential-inbox.ts';
import { personProfiles } from '@/lib/client/people-text.ts';
import { quarterResolution } from '@/lib/client/quarter-inbox.ts';
import IncomingProject from './IncomingProject.jsx';
import SponsorPanel from './SponsorPanel.jsx';
import MinisterPanel from './MinisterPanel.jsx';
import EvidencePanel from './EvidencePanel.jsx';
import GovernmentPanel from './GovernmentPanel.jsx';
import { PeopleText } from './PeopleText.jsx';
import './quarter-inbox.css';

export default function QuarterInbox({ gs, page, onOpen }) {
  const profiles = personProfiles(gs);
  const prepared = quarterResolution(gs);
  const entries = [
    ...(gs.world ? [{ key:'secretary', title:'Папка на рассмотрение', sender:'Канцелярия', status:'Ключевые дела квартала' }] : []),
    ...(gs.currentEvent ? [{ key:'main', title:gs.currentEvent.title, sender:gs.currentEvent.source,
      status:prepared ? 'Резолюция подготовлена' : 'Требуется резолюция президента' }] : []),
    ...presidentialMessages(gs).map(message => ({ key:message.key, title:message.title,
      sender:profiles.find(person => person.id === message.person)?.name ?? 'Канцелярия',
      status:message.needsReply ? 'На рассмотрении' : messageUnread(gs, message) ? 'Новый доклад' : 'Для сведения' })),
  ];
  if (!gs.currentEvent || entries.length < 2) return null;
  return <nav className="sv-quarter-folder" aria-label="Папка входящих">
    <div className="sv-quarter-folder-heading">НА РАССМОТРЕНИЕ</div>
    <label className="sv-quarter-mobile" htmlFor="quarter-document">Документы в папке</label>
    <select className="sv-quarter-mobile" id="quarter-document" value={entries.some(entry => entry.key === page) ? page : 'secretary'}
      onChange={event => onOpen(event.target.value)}>
      {entries.map(entry => <option key={entry.key} value={entry.key}>{entry.title} · {entry.status}</option>)}
    </select>
    <div className="sv-quarter-letters">{entries.map(entry => <button type="button" key={entry.key}
      data-quarter-document={entry.key} aria-current={page === entry.key ? 'page' : undefined} onClick={() => onOpen(entry.key)}>
      <small>{entry.sender}</small><strong>{entry.title}</strong><span>{entry.status}</span>
    </button>)}</div>
  </nav>;
}

export function IncomingLetter({ gs, page, onAction, onOpen, Scene }) {
  const message = presidentialMessages(gs).find(letter => letter.key === page);
  if (page === 'secretary' || !message) return <article className="sv-paper sv-incoming-project" data-quarter-secretary>
    <header><small>КАНЦЕЛЯРИЯ ПРЕЗИДЕНТА</small><span className="sv-stamp">На рассмотрении</span></header>
    <h2>Папка текущего квартала</h2>
    <p>К делу «<PeopleText>{gs.currentEvent?.title}</PeopleText>» нужна ваша резолюция.
      Письма и доклады исполнителей подшиты отдельно.</p>
    <p>Поручения прошлых кварталов продолжают действовать. Можно запросить вмешательство или оставить исполнителям текущий план.</p>
    <p className="sv-incoming-status">Чтение не двигает время. Основная резолюция вступит в силу при завершении квартала.</p>
  </article>;
  if (message.action === 'energy' || message.action === 'health') return <IncomingProject key={message.action}
    gs={gs} projectId={message.action} onAction={onAction} Scene={Scene}/>;
  const props = { gs, onAction, Scene, onClose:() => onOpen('secretary') };
  return <article className="sv-paper sv-incoming-project" data-incoming-letter={message.key}>
    <header><small>{personProfiles(gs).find(person => person.id === message.person)?.name ?? 'Канцелярия'}</small>
      <span className="sv-stamp">{message.needsReply ? 'На рассмотрении' : 'Для сведения'}</span></header>
    <h2><PeopleText>{message.title}</PeopleText></h2>
    {message.action === 'sponsor' ? <SponsorPanel {...props} embedded/>
      : message.action === 'minister' ? <MinisterPanel {...props}/>
      : message.action === 'evidence' ? <EvidencePanel {...props}/>
      : <><p><PeopleText>{message.text}</PeopleText></p><GovernmentPanel {...props}
        initialProject={message.key === 'housing-next' ? 'housing' : message.key.startsWith('program:') ? message.key.split(':')[1] : 'energy'}
        onDetails={id => onOpen(id === 'health' ? 'health' : 'energy')}/></>}
  </article>;
}
