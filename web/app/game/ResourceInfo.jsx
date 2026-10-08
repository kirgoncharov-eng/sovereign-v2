"use client";
import { useEffect, useRef } from 'react';
import { LIMITS, RES_CONFIG } from '@/lib/game/data.ts';
import { RESOURCE_ABOUT, RESOURCE_LIMITS, RATING_ABOUT, ratingDetail, resourceDetail } from '@/lib/client/resource-detail.ts';

const signed = value => value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0';
export default function ResourceInfo({ gs, kind, onClose }) {
  const ref = useRef(null);
  const rating = kind === 'rating';
  const detail = rating ? ratingDetail(gs) : resourceDetail(gs, kind);
  const title = rating ? 'Рейтинг партии' : RES_CONFIG.find(r => r.key === kind).prompt;
  useEffect(() => {
    const away = event => { if (!ref.current?.contains(event.target) && !event.target.closest?.('[data-res], [data-rating]')) onClose(); };
    const key = event => { if (event.key === 'Escape') { onClose(); event.preventDefault(); } };
    document.addEventListener('pointerdown', away);document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away);document.removeEventListener('keydown', key); };
  }, [onClose]);
  return <div ref={ref} className="sv-paper sv-fade sv-resource-info" role="dialog" aria-label={title}>
    <div className="sv-resource-info-heading"><strong>{title}<span style={{whiteSpace:'nowrap'}}> · {detail.value}{rating?'%':' / 100'}</span></strong><button onClick={onClose} aria-label="Закрыть объяснение">×</button></div>
    <p>{rating ? RATING_ABOUT : RESOURCE_ABOUT[kind]}</p>
    <p className="sv-resource-info-note">{rating ? `На ${LIMITS.endRating}% и ниже — революция. Перед выборами смотрите также на поддержку конкурентов в досье.` : RESOURCE_LIMITS}</p>
    {detail.delta !== null && <div className="sv-resource-info-changes"><strong>После последнего решения: {signed(detail.delta)}{rating?' п. п.':''}</strong>
      {!rating&&detail.changes.length>0&&<ul>{detail.changes.map(([label,delta],index)=><li key={index}>{label}: {signed(delta)}</li>)}</ul>}
      {rating&&<p>Пересчитывается по отношениям групп, легитимности и экономике; это не отдельный запас для поручений.</p>}
    </div>}
    {!rating&&detail.upcoming.length>0&&<div className="sv-resource-info-changes"><strong>Известные обязательства</strong><ul>{detail.upcoming.map((item,index)=><li key={index}>{item.text}: {signed(item.delta)}</li>)}</ul><p className="sv-resource-info-note">Это отдельные известные изменения, а не итоговый прогноз: решение в кабинете и другие обстоятельства тоже повлияют на ресурс.</p></div>}
  </div>;
}
