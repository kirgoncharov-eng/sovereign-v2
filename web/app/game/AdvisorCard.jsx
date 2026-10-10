"use client";
// Имя советника, которое можно нажать: под ним открывается карточка — область, лояльность, лагерь, счёт прогнозов.
// Не класть внутрь другой кнопки (вариантов решения): вложенные кнопки недопустимы.
// Мышью карточка открывается наведением, касанием — нажатием; нажатие закрепляет её открытой.
import { useId, useState } from "react";
import { advisorProfile } from "@/lib/game/advisors.ts";

const stars = skill => "★".repeat(skill) + "☆".repeat(3 - skill);
const signed = value => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0");

export function AdvisorCard({ gs, advisor, id }) {
  const profile = advisorProfile(gs, advisor);
  const tone = profile.loyalty >= 55 ? "good" : profile.loyalty >= 35 ? "warn" : "bad";
  const fill = { width:`${profile.loyalty}%` };
  const forecasts = profile.record.total ? `верно ${profile.record.right} из ${profile.record.total}` : "ещё не проверялись";
  return (
    <div id={id} className="sv-advisor-card" role="group" aria-label={`Карточка: ${advisor.name}`}>
      <div className="sv-advisor-card-role">{advisor.role}</div>
      {profile.bio && <p className="sv-advisor-card-bio">{profile.bio}</p>}
      <dl>
        {profile.area && <><dt>Сильная сторона</dt><dd>{profile.area} · {stars(advisor.skill)} · {profile.skill}</dd></>}
        <dt>Лояльность</dt>
        <dd>
          <span className={`sv-advisor-card-${tone}`}>{profile.loyaltyWord} · {profile.loyalty}</span>
          <span className="sv-advisor-card-bar" aria-hidden="true">
            <span style={fill} className={`sv-advisor-card-fill-${tone}`}/>
          </span>
          {profile.disloyal && (
            <span className="sv-advisor-card-bad">
              Советует уже в пользу своего лагеря{profile.camp ? ` «${profile.camp.name}»` : ""}, а не вашу
            </span>
          )}
        </dd>
        {profile.camp && <><dt>Тянется к</dt><dd>«{profile.camp.name}» · к вам {signed(profile.camp.relation)}</dd></>}
        <dt>Манера</dt><dd>{profile.manner}</dd>
        <dt>Прогнозы</dt>
        <dd>{forecasts}</dd>
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
        onClick={event => { event.stopPropagation(); setPinned(isPinned => !isPinned); setHover(false); }}
        onPointerEnter={event => { if (event.pointerType === "mouse") setHover(true); }}
        onPointerLeave={event => { if (event.pointerType === "mouse") setHover(false); }}>
        {children ?? advisor.name}
      </button>
      {after}
      {open && <AdvisorCard gs={gs} advisor={advisor} id={cardId}/>}
    </span>
  );
}
