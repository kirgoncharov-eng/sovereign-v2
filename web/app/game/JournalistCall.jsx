"use client";

import { useState } from 'react';
import { journalistReply } from '@/lib/game/journalist-call.ts';
import { breaches } from '@/lib/game/people.ts';
import { PeopleText } from './PeopleText.jsx';

export default function JournalistCall({ gs, onFinish, stamping, renderPromises }) {
  const [selected, setSelected] = useState(null);
  const [asked, setAsked] = useState(false);
  const event = gs.currentEvent;
  const caller = gs.keyFigures.find(person => person.id === event.call.figure);
  const chosen = event.choices.find(choice => choice.id === selected);
  return (
    <section className="sv-paper sv-negotiation-call" data-negotiation-call data-journalist-call>
      <div id="sv-resolution">
        <small>ЗАЩИЩЁННАЯ ЛИНИЯ · РЕДАКЦИЯ</small>
        <p><PeopleText>{caller?.name}</PeopleText></p>
        <p className="sv-negotiation-demand">{event.call.demand}</p>
        <p className="sv-negotiation-context">{event.call.context}</p>
        <button type="button" disabled={!!stamping} aria-expanded={asked} onClick={() => setAsked(!asked)}>
          {asked ? 'Свернуть уточнение' : 'Что известно о задержании?'}
        </button>
        {asked && <p className="sv-negotiation-context">
          «В журнале есть время и фамилия. Статьи обвинения нет. Копии накладных у нас;
          оригиналы забрали вместе с корреспондентом. Прежде чем обещать проверку,
          скажите: кто получит документы и кто сможет увидеть заключение?»
        </p>}
      </div>
      <div className="sv-negotiation-options">
        {event.choices.map((choice, index) => (
          <button key={choice.id} id={`opt-${index + 1}`} data-negotiation-choice={choice.id}
            aria-pressed={selected === choice.id} disabled={!!stamping} onClick={() => setSelected(choice.id)}>
            <strong>{choice.text}</strong>
          </button>
        ))}
      </div>
      {chosen && <div className="sv-negotiation-confirm" data-negotiation-confirm>
        <p><PeopleText>{caller?.name}</PeopleText>:</p>
        <blockquote>{journalistReply(gs, chosen.id)}</blockquote>
        <p><strong>В поручении: {chosen.text}</strong></p>
        <p>{chosen.hint}</p>
        {renderPromises?.(chosen)}
        {breaches(gs.pacts, chosen.politicalTags ?? []).map(pact => (
          <p key={pact.faction}>Нарушит союз с «{gs.factions.find(group => group.id === pact.faction)?.name}».</p>
        ))}
        <p>Ответ станет решением квартала. Документ об исполнении придёт с итогами следующего хода.</p>
        <button disabled={!!stamping} onClick={() => onFinish(chosen)}>Подтвердить решение</button>
        <button disabled={!!stamping} onClick={() => setSelected(null)}>Вернуться к вариантам</button>
      </div>}
    </section>
  );
}
