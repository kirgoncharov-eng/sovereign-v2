"use client";
// Имя советника, которое можно нажать: под ним открывается карточка — область, лояльность, лагерь, счёт прогнозов.
// Не класть внутрь другой кнопки (вариантов решения): вложенные кнопки недопустимы.
// Мышью карточка открывается наведением, касанием — нажатием; нажатие закрепляет её открытой.
import { useId, useState } from "react";
import { advisorProfile } from "@/lib/game/advisors.ts";

const stars = n => "★".repeat(n) + "☆".repeat(3 - n);
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export function AdvisorCard({ gs, advisor, id }) {
  const p = advisorProfile(gs, advisor);
  const tone = p.loyalty >= 55 ? "good" : p.loyalty >= 35 ? "warn" : "bad";
  return (
    <div id={id} className="sv-advisor-card" role="group" aria-label={`Карточка: ${advisor.name}`}>
      <div className="sv-advisor-card-role">{advisor.role}</div>
      {p.bio && <p className="sv-advisor-card-bio">{p.bio}</p>}
      <dl>
        {p.area && <><dt>Сильная сторона</dt><dd>{p.area} · {stars(advisor.skill)} · {p.skill}</dd></>}
        <dt>Лояльность</dt>
        <dd>
          <span className={`sv-advisor-card-${tone}`}>{p.loyaltyWord} · {p.loyalty}</span>
          <span className="sv-advisor-card-bar" aria-hidden="true"><span style={{ width:`${p.loyalty}%` }} className={`sv-advisor-card-fill-${tone}`}/></span>
        </dd>
        {p.camp && <><dt>Тянется к</dt><dd>«{p.camp.name}» · к вам {signed(p.camp.relation)}</dd></>}
        <dt>Прогнозы</dt>
        <dd>{p.record.total ? `верно ${p.record.right} из ${p.record.total}` : "ещё не проверялись"}</dd>
      </dl>
    </div>
  );
}

// after — текст строки после имени (например, должность): карточка открывается под всей строкой.
export default function AdvisorName({ gs, advisor, children, after = null }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const cardId = useId();
  if (!advisor) return <>{children}{after}</>;
  const open = pinned || hover;
  return (
    <span className="sv-advisor-name-wrap">
      <button type="button" className="sv-advisor-name" aria-expanded={open} aria-controls={cardId}
        onClick={event => { event.stopPropagation(); setPinned(v => !v); setHover(false); }}
        onPointerEnter={event => { if (event.pointerType === "mouse") setHover(true); }}
        onPointerLeave={event => { if (event.pointerType === "mouse") setHover(false); }}>
        {children ?? advisor.name}
      </button>
      {after}
      {open && <AdvisorCard gs={gs} advisor={advisor} id={cardId}/>}
    </span>
  );
}
