"use client";
import { useState } from 'react';
import { livingActions, worldPerson } from '@/lib/game/living-world.ts';
import { projectFinished } from '@/lib/game/living-health.ts';
import { healthHasContinuation, healthNeedsAttention, AFTERMATH_TITLE } from '@/lib/game/health-aftermath.ts';
import { BARGAIN_PLANS } from '@/lib/game/health-bargain.ts';
import { trackAppointment } from '@/lib/client/desk-analytics.ts';
import { projectLetterAuthor } from '@/lib/client/presidential-inbox.ts';
import ProjectActions from './ProjectActions.jsx';
import { PeopleText } from './PeopleText.jsx';
import { LetterText } from './LetterText.jsx';

export default function IncomingProject({ gs, projectId, onAction }) {
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const health = projectId === 'health';
  const project = health ? gs.world?.health : gs.world?.project;
  if (!project) return null;
  const reports = gs.world.dispatches.filter(report => health ? report.project === 'health' : report.project === 'energy');
  const latest = reports.at(-1);
  const continuation = health ? project.aftermath : null;
  const bargain = continuation?.bargain;
  const needsAnswer = health && healthNeedsAttention(project);
  const finished = projectFinished(project);
  const waiting = continuation && !needsAnswer;
  const actions = livingActions(gs).filter(action => health ? action.id.startsWith('health:')
    : !['health:', 'sponsor:', 'government:', 'minister:', 'evidence:'].some(prefix => action.id.startsWith(prefix)));
  const pending = actions.find(action => action.id === pendingId) ?? null;
  const executor = project.executor && worldPerson(gs, project.executor);
  // Шапка — автор письма; прежний руководитель программы, если это другой человек, — в служебной строке ниже.
  const authorId = projectLetterAuthor(gs, projectId);
  const author = authorId && worldPerson(gs, authorId);
  const confirm = () => {
    if (!pending || pending.blocked) return;
    try {
      onAction(pending.id);
      trackAppointment(gs, pending.id);
      setReceipt({ turn:gs.turn, title:pending.title });
      setPendingId(null);
      setError('');
    } catch (failure) { setError(failure.message); }
  };
  return <article className="sv-paper sv-incoming-project" data-incoming-project={projectId}>
    <header><small>{health ? 'РАЙОННЫЕ БОЛЬНИЦЫ' : 'ЭНЕРГОСЕТЬ'} · ПОРУЧЕНИЯ И ДОКЛАДЫ</small>
      <span className="sv-stamp">{needsAnswer ? 'Ждёт ответа' : 'Лично в руки'}</span></header>
    <h2><PeopleText>{latest?.title ?? (health ? 'Врач рядом с домом' : 'Свет в окнах')}</PeopleText></h2>
    {author && <p className="sv-incoming-sender"><PeopleText>{author.name}</PeopleText> · {author.role}</p>}
    {latest && <LetterText text={latest.text}/>}
    <p className="sv-incoming-status">{project.status === 'unassigned' ? 'Руководитель не назначен'
      : `${author && executor && author.id !== executor.id ? 'Руководитель программы — ' : ''}`
        + `${executor?.name ?? 'Исполнитель'} · выполнено ${project.progress}%`}
      {finished ? ` · ${project.status === 'completed' ? 'программа завершена' : project.status === 'partial' ? 'частичный результат' : 'срок сорван'}`
        : ` · до срока ${Math.max(0, project.deadline - gs.turn)} кв.`}</p>
    {project.status === 'running' && <p className="sv-incoming-status">Финансирование: {project.funds} кв.
      {project.secured ? ' · резерв обеспечен' : ''}</p>}
    {health && project.followupTurn != null && !continuation && <p>Обязательства программы сохраняются.
      Следующий доклад через {Math.max(0, project.followupTurn - gs.turn)} кв.</p>}
    {continuation && <section className="sv-incoming-continuation" data-health-aftermath>
      <h3>{AFTERMATH_TITLE[continuation.branch]}</h3><p><PeopleText>{continuation.cause}</PeopleText></p>
      <p>{continuation.phase === 'open' ? `Требуется ответ. До срока ${Math.max(0, continuation.deadline - gs.turn)} кв.`
        : continuation.phase === 'working' || continuation.phase === 'scheduled'
          ? `Доклад ожидается через ${Math.max(0, continuation.due - gs.turn)} кв.`
          : 'Результат поручения — в докладе выше.'}</p>
      {bargain && bargain.phase !== 'waiting' && <div data-health-bargain>
        <h3>Условия исполнителей</h3><p><PeopleText>{bargain.ministerCondition}</PeopleText></p>
        <p><PeopleText>{bargain.doctorCondition}</PeopleText></p>
        {bargain.choice && <p>Подписано: {BARGAIN_PLANS[bargain.choice].title}</p>}
        {bargain.phase === 'open' && <p>Ответ нужен до итогового доклада: {Math.max(0, continuation.due - gs.turn)} кв.</p>}
        {bargain.reviewDue != null && <p>Цена кадровой уступки: −2 политкапитала через {Math.max(0, bargain.reviewDue - gs.turn)} кв.</p>}
      </div>}
    </section>}
    {receipt?.turn === gs.turn && <p className="sv-country-receipt" role="status">Подписано: {receipt.title}.
      Исполнение — в докладах следующего квартала.</p>}
    <h3>Резолюция</h3>
    {waiting ? <p>{continuation.phase === 'settled' ? 'Поручение завершено. Обязательства и последствия указаны в докладе.'
      : 'Ожидается следующий доклад. Нового ответа сейчас не требуется.'}</p>
      : <ProjectActions quarterMode gs={gs} actions={actions} quota={gs.world.lastActionTurn === gs.turn}
        terminal={finished && !(health && healthHasContinuation(project))} pending={pending}
        setPending={action => { setPendingId(action?.id ?? null); setError(''); }} confirm={confirm} error={error}/>}
    {(continuation?.factors.length || project.lastFactors.length) > 0 && <details><summary>Что влияет на исполнение</summary>
      <ul>{(continuation?.factors.length ? continuation.factors : project.lastFactors).map((factor, index) =>
        <li key={index}><PeopleText>{factor}</PeopleText></li>)}</ul></details>}
    {reports.length > 1 && <details><summary>Подшитые доклады и резолюции ({reports.length - 1})</summary>
      {reports.slice(0, -1).reverse().map(report => <section key={report.id}><h3><PeopleText>{report.title}</PeopleText></h3>
        <LetterText text={report.text}/></section>)}</details>}
  </article>;
}
