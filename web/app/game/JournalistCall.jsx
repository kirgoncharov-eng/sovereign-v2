"use client";

import { useState } from 'react';
import { journalistReply } from '@/lib/game/journalist-call.ts';
import { breaches } from '@/lib/game/people.ts';
import { PeopleText } from './PeopleText.jsx';
import { artSource, HISTORICAL_SCENE_ART } from '@/lib/client/historical-art.ts';

export default function JournalistCall({ gs, onFinish, stamping, renderPromises, Portrait }) {
  const [selected, setSelected] = useState(null);
  const [asked, setAsked] = useState(false);
  const event = gs.currentEvent;
  const caller = gs.keyFigures.find(person => person.id === event.call.figure);
  const faction = gs.factions.find(group => group.id === caller?.faction);
  const chosen = event.choices.find(choice => choice.id === selected);

  return (
    <section className="sv-paper sv-negotiation-call sv-negotiation-historical" data-negotiation-call data-journalist-call>
      <div id="sv-resolution">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <small style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--gold)", fontFamily: "var(--font-pixel, monospace)", fontSize: 12, textTransform: "uppercase" }}>
            <span className="sv-sheet-pulse-dot" aria-hidden="true" />
            ЗАЩИЩЁННАЯ ЛИНИЯ · РЕДАКЦИЯ
          </small>
          <span style={{ fontFamily: "var(--font-pixel, monospace)", fontSize: 11, color: "var(--tx3)" }}>
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

        {caller && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px dashed var(--bdr2)" }}>
            {Portrait && <Portrait name={caller.name} size={48} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 18, color: "var(--txt)" }}>
                  <PeopleText>{caller.name}</PeopleText>
                </strong>
                <span style={{ fontFamily: "var(--font-narrow)", fontSize: 14, color: caller.relation >= 0 ? "var(--grn)" : "var(--red)" }}>
                  отношение {caller.relation > 0 ? "+" : ""}{caller.relation}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-narrow)", fontSize: 14, color: "var(--tx3)" }}>
                {caller.role}{faction ? ` · «${faction.name}»` : ""}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: "10px 14px", background: "var(--bg3)", borderLeft: "3px solid var(--gold)", marginBottom: 12 }}>
          <p className="sv-negotiation-demand" style={{ margin: 0, fontStyle: "italic" }}>{event.call.demand}</p>
        </div>
        <p className="sv-negotiation-context">{event.call.context}</p>

        <button type="button" disabled={!!stamping} aria-expanded={asked} onClick={() => setAsked(!asked)}
          style={{ background: "transparent", border: "1px solid var(--bdr2)", padding: "6px 12px", fontFamily: "var(--font-narrow)", fontSize: 14, color: "var(--tx2)", cursor: "pointer", marginTop: 4 }}>
          {asked ? 'Свернуть уточнение ▴' : 'Что известно о задержании? ▾'}
        </button>
        {asked && (
          <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--bg2)", borderLeft: "2px solid var(--bdr2)" }}>
            <p className="sv-negotiation-context" style={{ margin: 0, fontStyle: "italic" }}>
              «В журнале есть время и фамилия. Статьи обвинения нет. Копии накладных у нас;
              оригиналы забрали вместе с корреспондентом. Прежде чем обещать проверку,
              скажите: кто получит документы и кто сможет увидеть заключение?»
            </p>
          </div>
        )}
      </div>

      <div className="sv-negotiation-options">
        {event.choices.map((choice, index) => (
          <button key={choice.id} id={`opt-${index + 1}`} data-negotiation-choice={choice.id}
            aria-pressed={selected === choice.id} disabled={!!stamping} onClick={() => setSelected(choice.id)}>
            <strong>{choice.text}</strong>
          </button>
        ))}
      </div>

      {chosen && (
        <div className="sv-negotiation-confirm" data-negotiation-confirm>
          <p><PeopleText>{caller?.name}</PeopleText>:</p>
          <blockquote>{journalistReply(gs, chosen.id)}</blockquote>
          <p><strong>В поручении: {chosen.text}</strong></p>
          <p>{chosen.hint}</p>
          {renderPromises?.(chosen)}
          {breaches(gs.pacts, chosen.politicalTags ?? []).map(pact => (
            <p key={pact.faction}>Нарушит союз с «{gs.factions.find(group => group.id === pact.faction)?.name}».</p>
          ))}
          <p>Ответ станет решением квартала. Документ об исполнении придёт с итогами следующего хода.</p>
          <button disabled={!!stamping} onClick={() => onFinish(chosen)} style={{ position: "relative" }}>
            Подтвердить решение
            {stamping === chosen.id && (
              <span className="sv-stamp sv-stamp-hit is-green">
                <span className="sv-stamp-text">РЕШЕНО</span>
                <span className="sv-stamp-sub">ПРЯМОЙ ПРОВОД · 1978</span>
              </span>
            )}
          </button>
          <button disabled={!!stamping} onClick={() => setSelected(null)}>Вернуться к вариантам</button>
        </div>
      )}
    </section>
  );
}
