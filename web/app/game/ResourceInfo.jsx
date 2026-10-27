'use client';
import { useEffect, useRef, useState } from 'react';
import { LIMITS, RES_CONFIG } from '@/lib/game/data.ts';
import {
  RESOURCE_ABOUT,
  RESOURCE_LIMITS,
  RATING_ABOUT,
  ratingDetail,
  resourceDetail,
} from '@/lib/client/resource-detail.ts';
import {
  deltaLines,
  existingResourceResponses,
  initiativeNote,
  resourceInitiatives,
} from '@/lib/client/initiative-note.ts';

const signed = (value) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');
export default function ResourceInfo({ gs, kind, onClose, onInitiative, onWorldAction, canAct = true }) {
  const ref = useRef(null);
  const noteRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (selected) {
      ref.current.scrollTop = 0;
      noteRef.current?.focus({ preventScroll: true });
    } else if (receipt) noteRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, receipt]);
  useEffect(() => {
    const fit = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
      ref.current.style.maxHeight = `${Math.max(120, window.innerHeight - top - 12)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', fit, { passive: true });
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('scroll', fit);
    };
  }, []);
  const rating = kind === 'rating';
  const detail = rating ? ratingDetail(gs) : resourceDetail(gs, kind);
  const title = rating ? 'Рейтинг партии' : RES_CONFIG.find((r) => r.key === kind).prompt;
  const options = rating ? [] : resourceInitiatives(gs, kind);
  const responses = options.length ? existingResourceResponses(gs, kind) : [];
  const option = options.find((entry) => entry.id === selected);
  const response = responses.find((entry) => entry.id === selected);
  const note = option
    ? initiativeNote(gs, option)
    : response
      ? {
          title: response.title,
          actor: 'Действующее поручение',
          immediate: deltaLines(response.cost),
          relations: [],
          commitments: [response.detail],
          blocked: response.blocked,
        }
      : null;
  const choose = (id) => {
    setSelected(id);
    setError(null);
    setReceipt(null);
  };
  const sign = () => {
    try {
      if (option) onInitiative(option.id);
      else onWorldAction(response.id);
      setReceipt(note);
      setSelected(null);
      setError(null);
    } catch (failure) {
      setError(failure.message || 'Не удалось подписать распоряжение. Проверьте текущие условия.');
    }
  };
  useEffect(() => {
    const away = (event) => {
      if (!ref.current?.contains(event.target) && !event.target.closest?.('[data-res], [data-rating]'))
        onClose();
    };
    const key = (event) => {
      if (event.key === 'Escape') {
        onClose();
        event.preventDefault();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="sv-paper sv-fade sv-resource-info" role="dialog" aria-label={title}>
      <div className="sv-resource-info-heading">
        <strong>
          {title}
          <span style={{ whiteSpace: 'nowrap' }}>
            {' '}
            · {detail.value}
            {rating ? '%' : ' / 100'}
          </span>
        </strong>
        <button onClick={onClose} aria-label="Закрыть объяснение">
          ×
        </button>
      </div>
      <div hidden={!!note}>
        <p>{rating ? RATING_ABOUT : RESOURCE_ABOUT[kind]}</p>
        <p className="sv-resource-info-note">
          {rating
            ? `На ${LIMITS.endRating}% и ниже — революция. Перед выборами смотрите также на поддержку конкурентов в досье.`
            : RESOURCE_LIMITS}
        </p>
        {detail.delta !== null && (
          <div className="sv-resource-info-changes">
            <strong>
              После последнего решения: {signed(detail.delta)}
              {rating ? ' п. п.' : ''}
            </strong>
            {!rating && detail.changes.length > 0 && (
              <ul>
                {detail.changes.map(([label, delta], index) => (
                  <li key={index}>
                    {label}: {signed(delta)}
                  </li>
                ))}
              </ul>
            )}
            {rating && (
              <p>
                Пересчитывается по отношениям групп, легитимности и экономике; это не отдельный запас для
                поручений.
              </p>
            )}
          </div>
        )}
      </div>
      {options.length > 0 && (
        <section className="sv-resource-responses" aria-label="Распоряжения по этой опоре">
          <div hidden={!!note}>
            <strong>Что можно поручить</strong>
            <p className="sv-resource-info-note">
              Одно личное распоряжение за квартал — вместе с поручениями стола. Каждый резерв доступен один
              раз за срок. Подпись не завершает квартал.
            </p>
            {receipt && (
              <div ref={noteRef} role="status" data-initiative-receipt>
                <strong>Подписано: {receipt.title}</strong>
                <p>Уже учтено: {receipt.immediate.join('; ')}.</p>
                {receipt.relations.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {receipt.commitments.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
            {responses.length > 0 && (
              <p className="sv-resource-info-note">Сначала — действующие поручения и источник потерь:</p>
            )}
            {responses.map((entry) => (
              <button key={entry.id} className="sv-resource-response" onClick={() => choose(entry.id)}>
                <strong>{entry.title}</strong>
                <span>{entry.blocked || 'Рассмотреть изменение действующего поручения'}</span>
              </button>
            ))}
            {options.map((entry) => {
              const summary = initiativeNote(gs, entry);
              return (
                <button
                  key={entry.id}
                  data-initiative={entry.id}
                  className="sv-resource-response"
                  aria-expanded={selected === entry.id}
                  onClick={() => choose(entry.id)}
                >
                  <strong>{summary.title}</strong>
                  <span>{summary.blocked || summary.actor}</span>
                </button>
              );
            })}
          </div>
          {note && (
            <div ref={noteRef} tabIndex={-1} className="sv-initiative-note" data-initiative-note>
              <strong>{note.title}</strong>
              <p>{note.actor}</p>
              <strong>{response ? 'Цена подписи' : 'Сразу после подписи'}</strong>
              <ul>
                {note.immediate.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {note.relations.length > 0 && (
                <>
                  <strong>Политическая цена и поддержка</strong>
                  <ul>
                    {note.relations.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
              {note.commitments.length > 0 && (
                <>
                  <strong>Условия и обязательства</strong>
                  <ul>
                    {note.commitments.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
              {note.blocked && <p role="status">{note.blocked}</p>}
              {!canAct && <p role="status">Дождитесь завершения текущего решения.</p>}
              {error && <p role="alert">{error}</p>}
              <div className="sv-initiative-buttons">
                <button onClick={() => setSelected(null)}>Отложить</button>
                <button data-sign-initiative disabled={!!note.blocked || !canAct} onClick={sign}>
                  Подписать распоряжение
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {!note && !rating && detail.upcoming.length > 0 && (
        <div className="sv-resource-info-changes">
          <strong>Известные обязательства</strong>
          <ul>
            {detail.upcoming.map((item, index) => (
              <li key={index}>
                {item.text}: {signed(item.delta)}
              </li>
            ))}
          </ul>
          <p className="sv-resource-info-note">
            Это отдельные известные изменения, а не итоговый прогноз: решение в кабинете и другие
            обстоятельства тоже повлияют на ресурс.
          </p>
        </div>
      )}
    </div>
  );
}
