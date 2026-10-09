"use client";
import { useState } from 'react';
import { livingActions } from '@/lib/game/living-world.ts';
import { sponsorPresent } from '@/lib/game/sponsor-world.ts';
import { PeopleText } from './PeopleText.jsx';

const LABELS = { offered: 'Можно выйти на контакт', accepted: 'Вы приняли помощь', demanding: 'Он предъявил условие', confirmed: 'Условие проведено', refused: 'Вы отказались', pressuring: 'Он задерживает поставки', independent: 'Рычаг поставок утрачен', released: 'Программа завершена', departed: 'Участник лишился прежней позиции' };
const RES = { economy: 'экономика', politicalCapital: 'политкапитал', personalResource: 'личный ресурс' };
export default function SponsorPanel({ gs, onAction, Scene, onViewChange, embedded = false, onClose }) {
  const [open, setOpen] = useState(embedded);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const s = gs.world?.sponsor;
  if (!s || gs.daily) return null;
  const person = gs.keyFigures.find(f => f.id === s.figure && f.name === s.name);
  const actions = livingActions(gs).filter(a => a.id.startsWith('sponsor:'));
  const chosen = actions.find(a => a.id === selected);
  function confirm() {
    if (!chosen || chosen.blocked) return;
    try {
      onAction(chosen.id);
      setSelected(null); setError('');
      setReceipt('Решение записано. Квартал ещё не завершён; в кабинете продолжается текущее дело. Поставки проверятся после его решения.');
    } catch (e) { setError(e.message || 'Не удалось записать решение'); }
  }
  return <section className="sv-sponsor" data-sponsor-panel>
    {!embedded && <><div className="sv-sponsor-heading"><small>ЛИЧНАЯ ИНИЦИАТИВА · ЧУЖИЕ ДЕНЬГИ</small><span>{LABELS[s.phase]}</span></div>
    <h3><PeopleText>{s.name}</PeopleText></h3>
    <p>{s.phase === 'offered' ? 'Спонсор кампании может помочь энергосети. Вы можете сами обсудить условия, пока в кабинете идёт другое дело.' : s.phase === 'demanding' ? `Помощь получила цену: ответьте на требование до конца квартала ${s.deadline}.` : s.phase === 'pressuring' ? 'Его компании задерживают нынешние поставки. Независимый договор уберёт этот рычаг; политическая история продолжится.' : s.phase === 'independent' ? 'Вы освободили снабжение от этого человека. Документы о кампании остаются в политической истории.' : 'Ваша договорённость и её последствия остаются частью правления.'}</p>
    <button className="sv-sponsor-open" aria-expanded={open} onClick={() => { setOpen(!open); onViewChange(!open); setSelected(null); }}>{open ? 'Свернуть контакт' : s.phase === 'offered' ? 'Назначить встречу →' : 'Открыть контакт и последствия →'}</button></>}
    {open && <div className="sv-sponsor-body">
      <Scene gs={gs} sceneKey="office" height={48}/>
      <div className="sv-sponsor-person">{person ? `${person.role} · отношение ${person.relation > 0 ? '+' : ''}${person.relation}` : 'Прежний участник больше не занимает эту позицию'}</div>
      <p><PeopleText>{s.lastMove}</PeopleText></p>
      <p className="sv-sponsor-help">Открытие встречи и чтение не двигают календарь. Подтверждённое поручение использует одно личное вмешательство квартала — то же, что больницы и энергосеть.</p>
      {!sponsorPresent(gs) && <p>Прежний контрагент утратил доступ. В следующем докладе договорённость будет пересмотрена по его реальным возможностям.</p>}
      <div className="sv-sponsor-options">{actions.map(a => <button key={a.id} aria-pressed={selected === a.id} disabled={!!a.blocked} onClick={() => { setSelected(a.id); setError(''); setReceipt(''); }}><strong>{a.title}</strong>{selected === a.id && <span>{a.detail}</span>}<em>{Object.entries(a.cost).map(([k, v]) => `${RES[k] ?? k} ${v}`).join(' · ') || 'Без списания ресурсов'}</em>{a.blocked && <em>{a.blocked}</em>}</button>)}</div>
      {chosen && <div className="sv-sponsor-sign"><p>Подтвердить: {chosen.title}</p><button disabled={!!chosen.blocked} onClick={confirm}>Подтвердить поручение</button></div>}
      {receipt && <p className="sv-sponsor-receipt" role="status">{receipt}</p>}
      {error && <p role="alert">{error}</p>}
      <button className="sv-sponsor-open" onClick={() => { setOpen(false); onViewChange(false); setSelected(null); onClose?.(); }}>Вернуться к делу в кабинете →</button>
      {!actions.length && <p className="sv-sponsor-help">Новых поручений по этой договорённости сейчас нет. Можно продолжить дело в кабинете или заняться другими вопросами страны.</p>}
    </div>}
  </section>;
}
