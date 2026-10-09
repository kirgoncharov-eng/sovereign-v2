"use client";
import { useState } from 'react';
import { breaches } from '@/lib/game/people.ts';
import { PeopleText } from './PeopleText.jsx';

export default function NegotiationCall({ gs, onFinish, stamping, renderPromises }) {
  const [selected, setSelected] = useState(null);
  const event = gs.currentEvent;
  const person = gs.keyFigures.find(f => f.id === event.call.figure);
  const chosen = event.choices.find(c => c.id === selected);
  return <section className="sv-paper sv-negotiation-call" data-negotiation-call>
    <div id="sv-resolution"><small>ЗАЩИЩЁННАЯ ЛИНИЯ · КОНКРЕТНОЕ ТРЕБОВАНИЕ</small>
      <p><PeopleText>{person?.name}</PeopleText>{person && ` · отношение ${person.relation > 0 ? '+' : ''}${person.relation}`}</p>
      <p className="sv-negotiation-demand">{event.call.demand}</p>
      <p className="sv-negotiation-context">Закон уже действует: экономика +2, легитимность −1 каждый квартал. Решение в этом разговоре изменит закон или сохранит его.</p>
    </div>
    <div className="sv-negotiation-options">{event.choices.map((c, i) => <button key={c.id} id={`opt-${i + 1}`} data-negotiation-choice={c.id} aria-pressed={selected === c.id} disabled={!!stamping} onClick={() => setSelected(c.id)}><strong>{c.text}</strong>{selected === c.id && <span>{c.hint}</span>}</button>)}</div>
    {chosen && <div className="sv-negotiation-confirm" data-negotiation-confirm><p>Подтвердить решение: <strong>{chosen.text}</strong></p><p>{chosen.hint}</p>{renderPromises?.(chosen)}{breaches(gs.pacts, chosen.politicalTags ?? []).map(p => <p key={p.faction}>Нарушит союз с «{gs.factions.find(f => f.id === p.faction)?.name}»: его поддержка и квартальная помощь прекратятся.</p>)}<p>Это главное решение квартала. Личные поручения учитываются отдельно; разговор не расходует дополнительное поручение.</p><button disabled={!!stamping} onClick={() => onFinish(chosen)}>Подтвердить решение</button><button disabled={!!stamping} onClick={() => setSelected(null)}>Вернуться к вариантам</button></div>}
  </section>;
}
