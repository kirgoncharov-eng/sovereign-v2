"use client";
export default function OrderGuide({ lesson, onAssign, onReport, onContinue, onBrowse }) {
  return <aside className="sv-order-guide" data-order-guide={lesson.phase}>
    <div className="sv-country-label">СЕКРЕТАРЬ · ПЕРВОЕ ПОРУЧЕНИЕ</div>
    <h3>{lesson.phase==='assign'?'Больницам нужен руководитель':lesson.phase==='signed'?'Поручение отправлено':lesson.phase==='report'?'Пришёл первый доклад':lesson.phase==='wait'?'Этот квартал уже занят':'Для назначения нужен резерв'}</h3>
    <p>{lesson.phase==='assign'?'«Вы решили дело в кабинете. Пока вы занимаетесь следующими вопросами, другой человек может организовать работу районных больниц. Выберите руководителя и выделите стартовый бюджет».':lesson.phase==='signed'?'«Подпись ещё не означает результат. Исполнитель начнёт работу, когда вы завершите следующее дело в кабинете. После него придёт первый доклад».':lesson.phase==='report'?'«Руководитель отчитался о первом квартале работы. Посмотрите, что удалось и что задерживает набор. Можно изменить поручение или оставить текущий план».':lesson.phase==='wait'?'«Личное поручение на этот квартал уже использовано. После следующего дела в кабинете вы сможете заняться больницами. Доклады можно читать свободно».':'«Сейчас назначения заблокированы запасом ресурсов. Проверьте стоимость в поручениях; пока можно продолжить управление из кабинета». '}</p>
    <div>
      {lesson.phase==='assign'&&<button onClick={onAssign}>Выбрать руководителя больниц →</button>}
      {lesson.phase==='report'&&<button onClick={onReport}>Открыть первый доклад →</button>}
      {['wait','blocked'].includes(lesson.phase)&&<button onClick={onBrowse}>Посмотреть поручения и доклады</button>}
      <button onClick={onContinue}>{lesson.phase==='assign'?'Отложить назначение':lesson.phase==='report'?'Продолжить текущий план':'Открыть следующее дело'} →</button>
    </div>
  </aside>;
}
