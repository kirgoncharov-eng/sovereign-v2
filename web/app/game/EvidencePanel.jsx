"use client";
import { useState } from 'react';
import { livingActions } from '@/lib/game/living-world.ts';
import { governmentPrice } from './GovernmentPanel.jsx';
import { PeopleText } from './PeopleText.jsx';

export default function EvidencePanel({ gs, onAction, onClose }) {
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const source = gs.world?.evidence;
  if (!source) return null;
  const actions = livingActions(gs).filter(a => a.id.startsWith('evidence:'));
  const chosen = actions.find(a => a.id === selected);
  function confirm() {
    if (!chosen || chosen.blocked) return;
    try { onAction(chosen.id); setSelected(null); setError(''); }
    catch (e) { setError(e.message || 'Не удалось записать решение'); }
  }
  return <section className="sv-sponsor" data-evidence-panel>
    <p><PeopleText>{source.text}</PeopleText></p>
    {source.authority === 'active' && source.networkVerifiedAt === undefined && <p className="sv-sponsor-help">Следующий пакет: иностранная цепочка · квартал {source.authoritySince + 4}. Отзыв доступа прекратит дальнейшие запросы службы.</p>}
    {source.referredAt !== undefined && <p className="sv-sponsor-help">Дело о финансировании кампании зарегистрировано. В назначении на таможню отказано.</p>}
    <p className="sv-sponsor-help">{source.phase === 'checking' ? `Проверка продолжается · документы в квартале ${source.due}.` : source.phase === 'verified' ? source.usedAt === undefined ? source.networkVerifiedAt !== undefined ? 'Иностранная цепочка подтверждена · документальный ответ доступен на требование о портовой концессии.' : 'Переводы подтверждены · можно ответить документами на требование о назначении. Иностранная цепочка ещё не установлена.' : 'Материалы переданы прокуратуре · расследование продолжается.' : 'Архивная копия · сведения ещё не проверены.'}</p>
    {source.authority !== 'none' && <p className="sv-sponsor-receipt"><strong>{source.authority === 'active' ? 'Полномочие действует: легитимность −1 каждый квартал.' : source.authority === 'withdrawn' ? 'Независимая санкция восстановлена; квартальное списание прекращено.' : 'Личный допуск закрыт после ухода руководителя; преемник его не получил.'}</strong>{source.authority === 'active' && ' Получение или использование папки не отзывает право на банковские запросы.'}</p>}
    <p className="sv-sponsor-help">Чтение не расходует ресурсы. Подпись использует общее личное поручение квартала; главное решение остаётся доступно.</p>
    <div className="sv-sponsor-options">{actions.map(a => <button key={a.id} data-evidence-action={a.id} aria-pressed={selected === a.id} disabled={!!a.blocked} onClick={() => { setSelected(a.id); setError(''); }}><strong>{a.title}</strong>{selected === a.id && <span>{a.detail}</span>}<em>{governmentPrice(a.cost)}</em>{a.blocked && <em>{a.blocked}</em>}</button>)}</div>
    {chosen && <div className="sv-sponsor-sign"><p>Подтвердить: {chosen.title}</p><strong>{governmentPrice(chosen.cost)}</strong>{chosen.id === 'evidence:service' && <p>Дополнительно: легитимность −1 каждый квартал. Полномочие действует до отзыва; полный пакет сведений — через четыре квартала.</p>}<button disabled={!!chosen.blocked} onClick={confirm}>Подтвердить поручение</button><button onClick={() => setSelected(null)}>Отложить</button></div>}
    {error && <p role="alert">{error}</p>}
    <button className="sv-desk-link" onClick={onClose}>Вернуться к главному делу →</button>
  </section>;
}
