'use client';
import { useState } from 'react';
import { livingActions } from '@/lib/game/living-world.ts';
import { groupNeedsReply } from '@/lib/game/group-initiative.ts';
import { LetterText } from './LetterText.jsx';
import './group-initiative.css';

const RESOURCE = { economy: 'Экономика', politicalCapital: 'Влияние' };

export default function GroupInitiativePanel({ gs, onAction, onClose }) {
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const group = gs.world?.groups;
  if (!group || gs.daily) return null;
  const actions = livingActions(gs).filter(a => a.id.startsWith('groups:'));
  const chosen = actions.find(a => a.id === selected);
  function confirm() {
    if (!chosen || chosen.blocked) return;
    try {
      onAction(chosen.id);
      setSelected(null); setError('');
      setReceipt('Ответ подписан. Квартал ещё идёт; следующий ход сторон появится после решения основного дела.');
    } catch (e) { setError(e.message || 'Не удалось подписать ответ'); }
  }
  return <section className="sv-sponsor" data-group-initiative={group.phase}>
    <LetterText text={group.text}/>
    {groupNeedsReply(group) && <p className="sv-sponsor-help">
      Подпись занимает личное вмешательство этого квартала. Можно не вмешиваться — срок продолжит идти.
    </p>}
    <div className="sv-sponsor-options">{actions.map(action => <button key={action.id}
      disabled={!!action.blocked} aria-pressed={chosen?.id === action.id}
      onClick={() => { setSelected(action.id); setError(''); setReceipt(''); }}>
      <strong>{action.title}</strong>
      <small>{Object.entries(action.cost).map(([key, amount]) => `${RESOURCE[key] ?? key} ${amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`}`).join(' · ') || 'Без списания ресурсов'}</small>
      {chosen?.id === action.id && <span>{action.detail}</span>}
      {action.blocked && <em>{action.blocked}</em>}
    </button>)}</div>
    {chosen && <div className="sv-sponsor-sign"><p>Подтвердить: {chosen.title}</p>
      <button disabled={!!chosen.blocked} onClick={confirm}>Подписать решение</button>
      <button onClick={() => setSelected(null)}>Отложить</button>
    </div>}
    {receipt && <p role="status">{receipt}</p>}
    {error && <p role="alert">{error}</p>}
    <button className="sv-sponsor-open" onClick={onClose}>{groupNeedsReply(group) ? 'Пока не вмешиваться →' : 'Вернуться к делу →'}</button>
  </section>;
}
