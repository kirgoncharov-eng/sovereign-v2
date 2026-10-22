"use client";
import { worldPerson } from '@/lib/game/living-world.ts';
const RESOURCE = { economy:'экономика', politicalCapital:'политкапитал', personalResource:'личный ресурс', externalReputation:'репутация' };
export default function ProjectActions({ gs, actions, quota, terminal, pending, setPending, confirm, error, quarterMode = false }) {
  if (terminal) return <p>{quarterMode ? 'Проект завершён. Итоги и обязательства — в докладах этого письма.'
    : 'Проект завершён. Итоги и обязательства остаются в поручениях и докладах.'}</p>;
  if (quota) return <p className="sv-country-receipt">Личное поручение на этот квартал уже подписано.
    {quarterMode ? ' Исполнение продолжится при завершении квартала.' : ' Оба проекта продолжат работу после решения в кабинете.'}
    {' '}Новую инициативу можно дать после следующего доклада.</p>;
  return <div>
    <p className="sv-country-capacity">{quarterMode
      ? 'Одно личное поручение на квартал — на сеть или на больницы. Без него проекты идут по прежнему плану.'
      : 'Одно личное поручение на оба проекта за квартал. Деньги списываются из общих ресурсов страны. Можно оставить текущий план в работе.'}</p>
    {actions.map(action => {
      const costDescription = Object.entries(action.cost)
        .map(([key, value]) => `${RESOURCE[key] ?? key} ${value}`).join(' · ') || 'без списания ресурсов';
      const appointment = action.id.match(/^(?:health:)?(?:appoint|replace):(.+)$/);
      const actor = appointment && gs ? worldPerson(gs, appointment[1]) : null;
      return <div key={action.id}>
      <button className="sv-country-action" disabled={!!action.blocked} aria-expanded={pending?.id === action.id} onClick={() => setPending(action)}>
        <strong>{action.title}</strong>
        {actor ? <>
          <span>{actor.role}{actor.id==='governor'?' · политический куратор программы':''}</span>
          <span className="sv-executor-compare"><span>Компетенция <b>{actor.competence}/3</b></span><span>К вам <b>{actor.relation>0?'+':''}{actor.relation}</b></span></span>
          <span>Интерес: {actor.goal}.</span>
        </> : <span>{action.detail}</span>}
        <small>Цена: {costDescription}</small>
        {action.blocked && <span className="sv-project-blocked">Недоступно{quarterMode ? '. ' : ': '}{action.blocked}</span>}
      </button>
      {pending?.id === action.id && <div className="sv-country-confirm" role="group" aria-label="Подписать личное поручение">
        <h4>{action.title}</h4><p>{action.detail}</p>
        <p>Цена подписи: {costDescription}.</p>
        <p>Поручение займёт ваше личное вмешательство в этом квартале.
          Другой проект продолжит текущий план. {quarterMode
            ? 'Результат — в докладах следующего квартала.'
            : 'Результат увидите после решения в кабинете.'}</p>
        <div><button onClick={confirm}>Подписать поручение</button><button onClick={() => setPending(null)}>Отложить</button></div>
      </div>}
    </div>;})}
    {error && <p role="alert">{error}</p>}
  </div>;
}
