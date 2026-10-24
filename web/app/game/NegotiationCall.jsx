"use client";
import { useState } from 'react';
import { breaches } from '@/lib/game/people.ts';
import { PeopleText } from './PeopleText.jsx';
import { artSource, HISTORICAL_SCENE_ART } from '@/lib/client/historical-art.ts';
import { ALTERNATE_COUNTRY } from '@/lib/game/alternate-world.ts';

export default function NegotiationCall({ gs, onFinish, stamping, renderPromises, Portrait }) {
  const [selected, setSelected] = useState(null);
  const event = gs.currentEvent;
  const person = gs.keyFigures.find(f => f.id === event.call.figure);
  const chosen = event.choices.find(c => c.id === selected);
  const isHistorical = gs?.country === ALTERNATE_COUNTRY;

  if (!isHistorical) {
    return (
      <section className="sv-paper sv-negotiation-call" data-negotiation-call>
        <div id="sv-resolution"><small>ЗАЩИЩЁННАЯ ЛИНИЯ · КОНКРЕТНОЕ ТРЕБОВАНИЕ</small>
          <p><PeopleText>{person?.name}</PeopleText>{person && ` · отношение ${person.relation > 0 ? '+' : ''}${person.relation}`}</p>
          <p className="sv-negotiation-demand">{event.call.demand}</p>
          <p className="sv-negotiation-context">Закон уже действует: экономика +2, легитимность −1 каждый квартал. Решение в этом разговоре изменит закон или сохранит его.</p>
        </div>
        <div className="sv-negotiation-options">{event.choices.map((c, i) => <button key={c.id} id={`opt-${i + 1}`} data-negotiation-choice={c.id} aria-pressed={selected === c.id} disabled={!!stamping} onClick={() => setSelected(c.id)}><strong>{c.text}</strong>{selected === c.id && <span>{c.hint}</span>}</button>)}</div>
        {chosen && <div className="sv-negotiation-confirm" data-negotiation-confirm><p>Подтвердить решение: <strong>{chosen.text}</strong></p><p>{chosen.hint}</p>{renderPromises?.(chosen)}{breaches(gs.pacts, chosen.politicalTags ?? []).map(p => <p key={p.faction}>Нарушит союз с «{gs.factions.find(f => f.id === p.faction)?.name}»: его поддержка и квартальная помощь прекратятся.</p>)}<p>Это главное решение квартала. Личные поручения учитываются отдельно; разговор не расходует дополнительное поручение.</p><button disabled={!!stamping} onClick={() => onFinish(chosen)}>Подтвердить решение</button><button disabled={!!stamping} onClick={() => setSelected(null)}>Вернуться к вариантам</button></div>}
      </section>
    );
  }

  const faction = gs.factions.find(f => f.id === person?.faction);

  return (
    <section className="sv-paper sv-negotiation-call sv-negotiation-historical" data-negotiation-call>
      <div id="sv-resolution">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <small style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--gold)", fontFamily: "var(--font-pixel, monospace)", fontSize:13, textTransform: "uppercase" }}>
            <span className="sv-sheet-pulse-dot" aria-hidden="true" />
            ЗАЩИЩЁННАЯ ЛИНИЯ · КОНКРЕТНОЕ ТРЕБОВАНИЕ
          </small>
          <span style={{ fontFamily: "var(--font-pixel, monospace)", fontSize:13, color: "var(--tx3)" }}>
            АППАРАТ СПЕЦСВЯЗИ
          </span>
        </div>

        <figure className="sv-scene" style={{ margin: "0 0 14px", border: "2px solid var(--txt)", boxShadow: "var(--hard)", position: "relative", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artSource(HISTORICAL_SCENE_ART.phone.src)}
            alt=""
            className="sv-px"
            style={{ width: "100%", aspectRatio: "16 / 9", maxHeight: 135, objectFit: "cover", display: "block" }}
          />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(14, 12, 10, 0.92))", padding: "12px 10px 4px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: "var(--font-narrow)", fontSize: 13, color: "#f1e9d2" }}>
              {HISTORICAL_SCENE_ART.phone.caption}
            </span>
          </div>
        </figure>

        {person && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px dashed var(--bdr2)" }}>
            {Portrait && <Portrait name={person.name} size={48} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 18, color: "var(--txt)" }}>
                  <PeopleText>{person.name}</PeopleText>
                </strong>
                <span style={{ fontFamily: "var(--font-narrow)", fontSize: 14, color: person.relation >= 0 ? "var(--grn)" : "var(--red)" }}>
                  отношение {person.relation > 0 ? "+" : ""}{person.relation}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-narrow)", fontSize: 14, color: "var(--tx3)" }}>
                {person.role}{faction ? ` · «${faction.name}»` : ""}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "10px 14px", background: "var(--bg3)", borderLeft: "3px solid var(--gold)", marginBottom: 12 }}>
          <p className="sv-negotiation-demand" style={{ margin: 0, fontStyle: "italic" }}>{event.call.demand}</p>
        </div>
        <p className="sv-negotiation-context">{event.call.context || "Закон уже действует: экономика +2, легитимность −1 каждый квартал. Решение в этом разговоре изменит закон или сохранит его."}</p>
      </div>

      <div className="sv-negotiation-options">
        {event.choices.map((c, i) => (
          <button
            key={c.id}
            id={`opt-${i + 1}`}
            data-negotiation-choice={c.id}
            aria-pressed={selected === c.id}
            disabled={!!stamping}
            onClick={() => setSelected(c.id)}
          >
            <strong>{c.text}</strong>
            {selected === c.id && <span>{c.hint}</span>}
          </button>
        ))}
      </div>

      {chosen && (
        <div className="sv-negotiation-confirm" data-negotiation-confirm>
          <p>Подтвердить решение: <strong>{chosen.text}</strong></p>
          <p>{chosen.hint}</p>
          {renderPromises?.(chosen)}
          {breaches(gs.pacts, chosen.politicalTags ?? []).map(p => (
            <p key={p.faction}>Нарушит союз с «{gs.factions.find(f => f.id === p.faction)?.name}»: его поддержка и квартальная помощь прекратятся.</p>
          ))}
          <p>Это главное решение квартала. Личные поручения учитываются отдельно; разговор не расходует дополнительное поручение.</p>
          <button disabled={!!stamping} onClick={() => onFinish(chosen)} style={{ position: "relative" }}>
            Подтвердить решение
            {stamping === chosen.id && (
              <span className="sv-stamp sv-stamp-hit is-green">
                <span className="sv-stamp-text">СОГЛАСОВАНО</span>
                <span className="sv-stamp-sub">СПЕЦСВЯЗЬ · 1978</span>
              </span>
            )}
          </button>
          <button disabled={!!stamping} onClick={() => setSelected(null)}>Вернуться к вариантам</button>
        </div>
      )}
    </section>
  );
}
