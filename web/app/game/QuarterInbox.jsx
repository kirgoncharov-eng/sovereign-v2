"use client";
import { useEffect, useRef } from 'react';
import { presidentialMessages, messageUnread } from '@/lib/client/presidential-inbox.ts';
import { personProfiles } from '@/lib/client/people-text.ts';
import { quarterResolution } from '@/lib/client/quarter-inbox.ts';
import { LetterText } from './LetterText.jsx';
import IncomingProject from './IncomingProject.jsx';
import SponsorPanel from './SponsorPanel.jsx';
import MinisterPanel from './MinisterPanel.jsx';
import EvidencePanel from './EvidencePanel.jsx';
import GovernmentPanel from './GovernmentPanel.jsx';
import { PeopleText } from './PeopleText.jsx';
import SecretaryLetter, { SecretaryNote } from './SecretaryLetter.jsx';
import { secretaryInventory } from '@/lib/game/secretary.ts';
import './quarter-inbox.css';

// Документы папки в порядке срочности: опись, главное дело, письма (#244 — один словарь статусов).
function folderEntries(gs) {
  const profiles = personProfiles(gs);
  const prepared = quarterResolution(gs);
  return [
    ...(gs.world ? [{ key:'secretary', title:'Опись папки', sender:gs.world.secretary?.present ? gs.world.secretary.name : 'Канцелярия',
      status:'Что сверху и что подождёт' }] : []),
    ...(gs.currentEvent ? [{ key:'main', title:gs.currentEvent.title, sender:gs.currentEvent.source, prepared:!!prepared,
      status:prepared ? 'Резолюция готова к подписи' : 'Ждёт вашей резолюции', urgent:!prepared }] : []),
    ...presidentialMessages(gs).map(message => ({ key:message.key, title:message.title,
      sender:profiles.find(person => person.id === message.person)?.name ?? 'Канцелярия',
      status:message.needsReply ? 'Ждёт ответа' : messageUnread(gs, message) ? 'Новый доклад' : 'Для сведения',
      urgent:!!message.needsReply })),
  ];
}

export default function QuarterInbox({ gs, page, onOpen }) {
  const entries = folderEntries(gs);
  const strip = useRef(null);
  // Лента на телефоне держит открытый документ в начале видимой части, не двигая саму страницу.
  useEffect(() => {
    const current = strip.current?.querySelector('[aria-current]');
    if (current && strip.current.scrollWidth > strip.current.clientWidth) strip.current.scrollLeft = current.offsetLeft - strip.current.offsetLeft - 4;
  }, [page]);
  if (!gs.currentEvent || entries.length < 2) return null;
  const waiting = entries.filter(entry => entry.urgent).length;
  // На телефоне — та же папка лентой карточек вместо системного выпадающего списка (#279): статус виден сразу.
  return <nav className="sv-quarter-folder" aria-label="Папка входящих">
    <div className="sv-quarter-folder-heading"><span className="sv-quarter-title">НА РАССМОТРЕНИЕ</span>
      <span className="sv-quarter-count">{`В ПАПКЕ ${entries.length}${waiting ? ` · ЖДУТ ВАС ${waiting}` : ''}`}</span></div>
    <div className="sv-quarter-letters" ref={strip}>{entries.map(entry => <button type="button" key={entry.key}
      data-quarter-document={entry.key} data-urgent={entry.urgent || undefined}
      aria-current={page === entry.key ? 'page' : undefined} onClick={() => onOpen(entry.key)}>
      <small>{entry.sender}</small><strong>{entry.title}</strong><span>{entry.status}</span>
    </button>)}</div>
  </nav>;
}

export function IncomingLetter({ gs, page, onAction, onOpen, Scene }) {
  const message = presidentialMessages(gs).find(letter => letter.key === page);
  if (page === 'secretary' || !message) return <article className="sv-paper sv-incoming-project" data-quarter-secretary>
    <header><small>КАНЦЕЛЯРИЯ ПРЕЗИДЕНТА</small><span className="sv-stamp">Опись</span></header>
    <h2>Опись папки</h2>
    <p><PeopleText>{secretaryInventory(gs) ?? (gs.world?.secretary ? '' : 'Секретарь разложила бумаги по срочности.')}</PeopleText></p>
    <SecretaryNote gs={gs} onAction={onAction} Scene={Scene}/>
    <ol className="sv-folder-inventory">{folderEntries(gs).filter(entry => entry.key !== 'secretary').map(entry =>
      <li key={entry.key}>{entry.key === 'main'
        ? <><strong>Сверху — «<PeopleText>{entry.title}</PeopleText>».</strong> {entry.prepared ? 'Резолюция готова к подписи.'
          : 'Ждёт вашей резолюции: квартал закроется, когда вы её подпишете.'}</>
        : <PeopleText>{`${entry.sender} — «${entry.title}». ${entry.status}.`}</PeopleText>}</li>)}</ol>
    <p className="sv-incoming-status">Пока папка на столе, время стоит.</p>
  </article>;
  if (message.action === 'secretary') return <SecretaryLetter gs={gs} onAction={onAction}/>;
  if (message.action === 'energy' || message.action === 'health') return <IncomingProject key={message.action}
    gs={gs} projectId={message.action} onAction={onAction}/>;
  const props = { gs, onAction, Scene, onClose:() => onOpen('secretary') };
  return <article className="sv-paper sv-incoming-project" data-incoming-letter={message.key}>
    <header><small>{personProfiles(gs).find(person => person.id === message.person)?.name ?? 'Канцелярия'}</small>
      <span className="sv-stamp">{message.needsReply ? 'Ждёт ответа' : 'Для сведения'}</span></header>
    <h2><PeopleText>{message.title}</PeopleText></h2>
    {message.action === 'sponsor' ? <SponsorPanel {...props} embedded/>
      : message.action === 'minister' ? <MinisterPanel {...props}/>
      : message.action === 'evidence' ? <EvidencePanel {...props}/>
      : <><LetterText text={message.text}/><GovernmentPanel {...props}
        initialProject={message.key === 'housing-next' ? 'housing' : message.key.startsWith('program:') ? message.key.split(':')[1] : 'energy'}
        onDetails={id => onOpen(id === 'health' ? 'health' : 'energy')}/></>}
  </article>;
}
