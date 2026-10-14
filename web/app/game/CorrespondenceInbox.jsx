"use client";
import { correspondenceStatus, correspondenceSubject } from '@/lib/client/correspondence.ts';
import { messageUnread } from '@/lib/client/presidential-inbox.ts';
import './correspondence.css';

export default function CorrespondenceInbox({ gs, messages, profiles, onOpen, compact = false, onAll }) {
  const visible = compact ? messages.filter(message => message.needsReply || messageUnread(gs, message)).slice(0, 2) : messages;
  if (compact && !visible.length) return null;
  return <section className={`sv-post ${compact ? 'sv-post-tray' : ''}`} aria-label="Входящая корреспонденция">
    {compact && <header className="sv-post-heading">
      <span aria-hidden="true" className="sv-post-envelope"/>
      <strong>Входящая корреспонденция</strong>
      <button onClick={onAll}>Все письма →</button>
    </header>}
    {!visible.length && <p>Новых обращений нет. Договорённости и люди доступны в соседних разделах.</p>}
    <div className="sv-post-list">{visible.map(message => {
      const person = profiles.find(profile => profile.id === message.person);
      const unread = messageUnread(gs, message);
      const unassigned = ['energy', 'health'].includes(message.action)
        && gs.world?.[message.action === 'energy' ? 'project' : 'health']?.status === 'unassigned';
      return <button key={message.key} className="sv-post-letter" onClick={() => onOpen(message)}
        data-correspondence={message.key} data-unread={unread || undefined} data-waiting={message.needsReply || undefined}>
        <span className="sv-post-route">
          <span>{correspondenceSubject(message)}</span>
          <span className="sv-post-status">
            {unread && <i aria-label="Не прочитано"/>}{correspondenceStatus(gs, message)}
          </span>
        </span>
        <strong>{compact ? `${person?.name ?? 'Канцелярия'} →` : message.title}</strong>
        {!compact && <span className="sv-post-sender">
          {person?.name ?? 'Канцелярия'}{person?.role ? ` · ${person.role}` : ''}
        </span>}
        {!compact && unassigned && <span className="sv-post-warning">
          Без назначения программа провалится: пострадают экономика и легитимность.
        </span>}
        {!compact && <span className="sv-post-open">
          {message.needsReply ? 'Прочитать и рассмотреть ответ' : 'Прочитать письмо'} →
        </span>}
      </button>;
    })}</div>
  </section>;
}
