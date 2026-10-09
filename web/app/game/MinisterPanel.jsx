"use client";
import { useState } from 'react';
import { livingActions } from '@/lib/game/living-world.ts';
import { governmentPrice } from './GovernmentPanel.jsx';
import { PeopleText } from './PeopleText.jsx';

export default function MinisterPanel({ gs, Scene, onAction, onClose }) {
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const mandate = gs.world?.mandate;
  if (!mandate || gs.daily) return null;
  const person = gs.world.people.find(p => p.id === 'minister' && p.name === mandate.name);
  const actions = livingActions(gs).filter(a => a.id.startsWith('minister:'));
  const chosen = actions.find(a => a.id === selected);
  function confirm() {
    if (!chosen || chosen.blocked) return;
    try {
      onAction(chosen.id);
      setSelected(null);
      setReceipt('Подпись записана. Календарь не изменился. Самостоятельное действие министра проверится после главного решения.');
      setError('');
    } catch (e) { setError(e.message || 'Не удалось записать решение'); }
  }
  return <section className="sv-sponsor" data-minister-panel>
    <Scene gs={gs} sceneKey="office" height={48}/>
    <div className="sv-sponsor-person">{person ? `Министр энергетики · отношение ${person.relation > 0 ? '+' : ''}${person.relation} · интерес: контроль строительных закупок` : 'Прежний министр больше не занимает должность'}</div>
    <p><PeopleText>{mandate.text}</PeopleText></p>
    <p className="sv-sponsor-help">Чтение бесплатно. Подпись использует одно личное вмешательство квартала, общее с другими поручениями. Координатор программы и распорядитель закупок — разные роли.</p>
    <div className="sv-sponsor-options">{actions.map(a => <button key={a.id} data-minister-action={a.id} aria-pressed={selected === a.id} disabled={!!a.blocked} onClick={() => { setSelected(a.id); setReceipt(''); setError(''); }}><strong>{a.title}</strong><span>{a.detail}</span><em>{governmentPrice(a.cost)}</em>{a.blocked && <em>{a.blocked}</em>}</button>)}</div>
    {chosen && <div className="sv-sponsor-sign"><p>Подтвердить: {chosen.title}</p><strong>{governmentPrice(chosen.cost)}</strong><button disabled={!!chosen.blocked} onClick={confirm}>Подтвердить поручение</button><button onClick={() => setSelected(null)}>Отложить</button></div>}
    {receipt && <p className="sv-sponsor-receipt" role="status">{receipt}</p>}
    {error && <p role="alert">{error}</p>}
    <button className="sv-desk-link" onClick={onClose}>Вернуться к главному делу →</button>
  </section>;
}
