"use client";
import { useState } from 'react';
import { governmentLoad } from '@/lib/game/government.ts';
import { governmentBriefs, governmentPrice } from '@/lib/client/government-brief.ts';
import { PeopleText } from './PeopleText.jsx';
export { governmentPrice } from '@/lib/client/government-brief.ts';

export default function GovernmentPanel({ gs, onAction, onClose, onDetails, initialProject = 'energy' }) {
  const [selected, setSelected] = useState(initialProject);
  const [pending, setPending] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [showProposals, setShowProposals] = useState(false);
  const briefs = governmentBriefs(gs);
  if (!gs.world?.government) return null;
  const brief = briefs.find(project => project.id === selected) ?? briefs[0];
  if (!brief) return null;
  const current = briefs.filter(project => project.status !== 'proposed');
  const proposals = briefs.filter(project => project.status === 'proposed');
  const choice = brief.options.find(action => action.id === pending);
  const priority = gs.world.government.priority === brief.id;
  const mandate = gs.world.mandate;
  const nextHousing = gs.world.government.housingNext;

  function selectProject(id) {
    setSelected(id);
    setPending(null);
    setReceipt('');
    setError('');
  }
  function confirm() {
    if (!choice || choice.blocked) return;
    try {
      onAction(choice.id);
      setPending(null);
      setReceipt('Поручение подписано, цена учтена. Первый доклад придёт после главного решения; новая подпись для него не нужна.');
      setError('');
    } catch (caught) { setError(caught.message); }
  }
  function projectButton(project) {
    return <button key={project.id} data-government-project={project.id}
      aria-pressed={brief.id === project.id} onClick={() => selectProject(project.id)}>
      <strong>{project.title}</strong>
      <span>{project.statusLabel}{project.status !== 'proposed' && project.status !== 'unassigned' ? ` · ${project.progress}%` : ''}
        {gs.world.government.priority === project.id ? ' · ваш приоритет' : ''}</span>
    </button>;
  }
  return <section className="sv-government" data-government-panel>
    <header>
      <small>ПОРУЧЕНИЯ ПРАВИТЕЛЬСТВУ</small>
      <h3>Что требует внимания?</h3>
      <p>В работе {governmentLoad(gs.world)}/2 программ. Одно личное поручение на квартал; чтение свободно.</p>
    </header>
    <div className="sv-government-list" aria-label="Текущие поручения">{current.map(projectButton)}</div>
    {proposals.length > 0 && <>
      <button className="sv-desk-link" aria-expanded={showProposals} onClick={() => setShowProposals(!showProposals)}>
        {showProposals ? 'Свернуть новые предложения' : `Новые предложения · ${proposals.length}`} →
      </button>
      {showProposals && <div className="sv-government-list" aria-label="Новые предложения">{proposals.map(projectButton)}</div>}
    </>}
    <article className="sv-government-detail" data-government-brief={brief.id}>
      <small>{brief.statusLabel}{brief.status !== 'proposed' && brief.status !== 'unassigned' ? ` · ${brief.progress}%` : ''}</small>
      <h3>{brief.title}</h3>
      <dl>
        <div><dt>Цель</dt><dd>{brief.goal}</dd></div>
        <div><dt>{brief.executorLabel}</dt><dd>
          {brief.executor ? <PeopleText>{brief.executor}</PeopleText> : brief.terminal ? 'Не был назначен.' : 'Выберите кандидата в поручениях ниже.'}
          {brief.competence && ` · компетенция ${brief.competence}/3`}
          {brief.interest && <p><PeopleText>{brief.interest}</PeopleText></p>}
        </dd></div>
        <div><dt>{brief.paid ? 'Бюджет запуска уже оплачен' : brief.terminal ? 'Бюджет не выделен' : 'Цена запуска'}</dt>
          <dd>{brief.terminal && !brief.paid ? 'Исполнитель не был назначен; запуск не оплачен.'
            : brief.price ?? 'Цена каждого нового поручения показана ниже.'}</dd></div>
        <div><dt>Срок</dt><dd data-government-deadline>{brief.timing}</dd></div>
      </dl>
      <p data-government-next>{brief.nextStep}</p>
      {brief.followup && <p data-government-followup><strong>После программы: </strong>{brief.followup}</p>}
      {brief.report && <section className="sv-government-factors" data-government-report>
        <h4>{brief.terminal ? 'Итог программы' : 'Последний доклад'}</h4>
        <p><PeopleText>{brief.report}</PeopleText></p>
      </section>}
      <details className="sv-government-context">
        <summary>Ожидаемый результат и риски</summary>
        <p>{brief.benefit}</p><p>{brief.politics}</p><p>{brief.risk}</p>
      </details>
      {brief.id === 'housing' && !nextHousing && ['accepted', 'used'].includes(mandate?.phase) && <p>
        <PeopleText>{mandate.name}</PeopleText> имеет право выбирать подрядчиков по договорённости об энергосети.
        При запуске жилья: +5 работы и экономика −1 за квартал; проверка закупок теряет 5 работы без доступа к документам.
        Отозвать право можно в его сообщении.
      </p>}
      {priority && <p className="sv-government-priority">
        Личный приоритет: +5 работы и личный ресурс −1 за квартал при запасе выше 4.
        Полный успех: легитимность +3; неполный итог: −4.
      </p>}
      {brief.previousReport && <details className="sv-government-context">
        <summary>Итог первой стройки</summary><p><PeopleText>{brief.previousReport}</PeopleText></p>
      </details>}
      {nextHousing && brief.id === 'housing' && <p>
        Первая стройка: {nextHousing.originProgress}%. Прежний координатор: <PeopleText>{nextHousing.previousName}</PeopleText>.
        {nextHousing.mode === 'expand' && ' Сети и заселение первого района этим бюджетом не оплачены.'}
      </p>}
      <div className="sv-government-actions">{brief.options.map(action => <button key={action.id}
        data-government-action={action.id} disabled={!!action.blocked} aria-pressed={pending === action.id}
        onClick={() => { setPending(action.id); setReceipt(''); setError(''); }}>
        <strong>{action.title}</strong><em>{governmentPrice(action.cost)}</em>
        {pending === action.id && <span>{action.detail}</span>}
        {action.blocked && <em>{action.blocked}</em>}
      </button>)}</div>
      {choice && <div className="sv-government-sign">
        <p>Подписать: {choice.title}</p><strong>{governmentPrice(choice.cost)}</strong>
        <button disabled={!!choice.blocked} onClick={confirm}>Подписать поручение</button>
        <button onClick={() => setPending(null)}>Отложить</button>
      </div>}
      {['energy', 'health'].includes(brief.id) && <button className="sv-desk-link" onClick={() => onDetails(brief.id)}>
        Подробности программы и другие поручения →
      </button>}
      {receipt && <p role="status">{receipt}</p>}{error && <p role="alert">{error}</p>}
    </article>
    <button className="sv-desk-link" onClick={onClose}>Вернуться к главному делу →</button>
  </section>;
}
