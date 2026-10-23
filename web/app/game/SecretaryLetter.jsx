"use client";
import { useState } from 'react';
import { FAVORS, TRUST_WORDS } from '@/lib/content/secretary.ts';
import { pendingSecretaryFavor, secretaryActions, secretaryAvailable, secretaryText } from '@/lib/game/secretary.ts';
import { PeopleText } from './PeopleText.jsx';

const RESOURCE = { politicalCapital: 'политкапитал', personalResource: 'личный ресурс', internalLegitimacy: 'легитимность' };

function SecretaryActions({ gs, onAction, favors }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const actions = secretaryActions(gs).filter(action => action.id.startsWith('secretary:favor:') === favors);
  const selected = actions.find(action => action.id === pending);
  const price = action => Object.entries(action.cost).map(([key, value]) => `${RESOURCE[key] ?? key} ${value}`)
    .join(' · ').replaceAll('-', '−') || 'без списания ресурсов';
  return <div className="sv-secretary-actions">
    {actions.map(action => <button key={action.id} type="button" disabled={!!action.blocked} onClick={() => {
      setPending(action.id);
      setError('');
    }} data-secretary-action={action.id}>
      {action.title}<small>{price(action)}{action.blocked ? ` · ${action.blocked}` : ''}</small>
    </button>)}
    {selected && <section className="sv-country-confirm" role="group" aria-label="Подписать ответ секретарю">
      <p>{selected.detail}</p>
      <p>Цена подписи: {price(selected)}. Время не двигается.</p>
      <button type="button" data-secretary-confirm onClick={() => {
        try { onAction(selected.id); setPending(null); setError(''); }
        catch (failure) { setError(failure.message); }
      }}>Подписать ответ</button>
      <button type="button" onClick={() => setPending(null)}>Отложить</button>
    </section>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function SecretaryNote({ gs, onAction, Scene }) {
  const s = gs.world?.secretary;
  if (!s) return null;
  const available = secretaryAvailable(gs);
  return <>
    {available && <small className="sv-secretary-trust"><PeopleText>{s.name}</PeopleText> · {TRUST_WORDS[s.trust]}</small>}
    {available && s.gossip?.turn === gs.turn && <div data-secretary-gossip>
      <p><PeopleText>{s.gossip.text}</PeopleText></p>
      {s.gossip.checked !== null && <p className="sv-incoming-status">Проверка:
        {s.gossip.checked ? ' сведения подтвердились' : ' сведения не подтвердились'}.</p>}
      {s.gossip.protected && <p className="sv-incoming-status">Доступ к черновику ограничен на этот квартал.</p>}
      <SecretaryActions gs={gs} onAction={onAction} favors={false}/>
    </div>}
    {s.receiptTurn === gs.turn && s.receipt && <p role="status" data-secretary-receipt><PeopleText>{s.receipt}</PeopleText></p>}
    {available && s.scene?.turn === gs.turn && <figure className="sv-secretary-scene" data-secretary-scene={s.scene.id}>
      <Scene gs={gs} sceneKey={s.scene.id === 'hospitalQueue' ? 'hospital' : 'office'} partner={s.name} height={65} still/>
      <figcaption><PeopleText>{s.scene.text}</PeopleText></figcaption>
    </figure>}
  </>;
}

export default function SecretaryLetter({ gs, onAction }) {
  const s = gs.world.secretary;
  const favor = pendingSecretaryFavor(gs) ?? s.favors.at(-1);
  if (!favor) return null;
  const text = FAVORS[favor.id];
  return <article className="sv-paper sv-incoming-project" data-secretary-favor={favor.id}>
    <header><small><PeopleText>{s.name}</PeopleText> · ЛИЧНОЕ ПИСЬМО</small>
      <span className="sv-stamp">{favor.answer ? 'Ответ подписан' : 'Ждёт ответа'}</span></header>
    <h2>{text.title}</h2>
    <p><PeopleText>{secretaryText(gs, text.letter)}</PeopleText></p>
    {gs.world.health?.status === 'failed' && favor.id === 'mother'
      && <p><PeopleText>{secretaryText(gs, text.later.programFailed)}</PeopleText></p>}
    {favor.answer ? <p role="status"><PeopleText>{favor.outcome}</PeopleText></p>
      : <><h3>Резолюция</h3><SecretaryActions gs={gs} onAction={onAction} favors/></>}
    <p className="sv-incoming-status">{TRUST_WORDS[s.trust]}. Ответ на письмо не заменяет основную резолюцию.</p>
    {s.favors.length > 1 && <details><summary>Подшитые письма ({s.favors.length - 1})</summary>
      {s.favors.filter(old => old !== favor).map(old => <section key={old.id}><h3>{FAVORS[old.id].title}</h3>
        <p><PeopleText>{old.outcome}</PeopleText></p>
      </section>)}
    </details>}
  </article>;
}
