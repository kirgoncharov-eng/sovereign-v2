"use client";
const RESOURCE = { economy:'экономика', politicalCapital:'политкапитал', personalResource:'личный ресурс', externalReputation:'репутация' };
export default function ProjectActions({ actions, quota, terminal, pending, setPending, confirm, error }) {
  if (terminal) return <p>Проект завершён. Доклады остаются в досье; последующие обязательства могут появиться в повестке.</p>;
  if (quota) return <p className="sv-country-receipt">Личное поручение на этот квартал уже подписано. Оба проекта продолжат работу после решения в кабинете. Новую инициативу можно дать после следующего доклада.</p>;
  return <div>
    <p className="sv-country-capacity">Одно личное поручение на оба проекта за квартал. Деньги списываются из общих ресурсов страны. Можно оставить текущий план в работе.</p>
    {actions.map(action => <div key={action.id}>
      <button className="sv-country-action" disabled={!!action.blocked} aria-expanded={pending?.id === action.id} onClick={() => setPending(action)}>
        <strong>{action.title}</strong><span>{action.detail}</span>
        <small>{Object.entries(action.cost).map(([key,value]) => `${RESOURCE[key] ?? key} ${value}`).join(' · ')}{action.blocked ? ` · ${action.blocked}` : ''}</small>
      </button>
      {pending?.id === action.id && <div className="sv-country-confirm" role="group" aria-label="Подписать личное поручение">
        <h4>{action.title}</h4><p>Поручение займёт ваше личное вмешательство в этом квартале. Другой проект продолжит текущий план. Результат увидите после решения в кабинете.</p>
        <div><button onClick={confirm}>Подписать поручение</button><button onClick={() => setPending(null)}>Отложить</button></div>
      </div>}
    </div>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}
