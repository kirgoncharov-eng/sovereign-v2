"use client";
import { worldPerson } from '@/lib/game/living-world.ts';
import { PeopleText } from './PeopleText.jsx';
import ProjectActions from './ProjectActions.jsx';

export default function OrderTour({ gs, mode, receipt, actionsProps, onAdjust, onDesk, onBrowse }) {
  const health = gs.world.health;
  const signed = receipt?.turn === gs.turn && receipt.project === 'health';
  const report = gs.world.dispatches.filter(item => item.project==='health' && ['report','news'].includes(item.kind)).at(-1);
  const actor = health.executor ? worldPerson(gs, health.executor) : null;
  return <div className="sv-order-tour" data-order-tour={signed?'signed':mode}>
    <div className="sv-country-label">{signed?(mode==='adjust'?'4 · ИЗМЕНЕНИЕ ОТПРАВЛЕНО':'2 · ПОРУЧЕНИЕ ОТПРАВЛЕНО'):mode==='assign'?'1 · ВЫБЕРИТЕ ЧЕЛОВЕКА':mode==='report'?'3 · ПРОВЕРЬТЕ РАБОТУ':'4 · СКОРРЕКТИРУЙТЕ ПОРУЧЕНИЕ'}</div>
    <h3>{signed?'Теперь исполнителю нужно время':mode==='assign'?'Кто займётся районными больницами':mode==='report'?'Первый квартал работы':'Что изменить в работе больниц'}</h3>
    {signed?<>
      <p>Подписано: {receipt.title}.</p>
      <p>Цена подписи: {Object.entries(receipt.cost).map(([key,value])=>`${({economy:'экономика',politicalCapital:'политкапитал',personalResource:'личный ресурс',externalReputation:'репутация'})[key]??key} ${value}`).join(' · ')}. Личное поручение этого квартала использовано.</p>
      <p><PeopleText>{actor?.name}</PeopleText> отвечает за программу. Сейчас укомплектовано {health.progress}% ставок. Новый результат появится после решения в кабинете; подпись сама по себе не заполняет кабинеты врачами.</p>
      <button onClick={onDesk}>Открыть дело в кабинете →</button>
    </>:mode==='report'?<>
      <p>Исполнитель: <PeopleText>{actor?.name}</PeopleText>. Укомплектовано {health.progress}% ставок.</p>
      {report&&<article><h4>{report.title}</h4><p><PeopleText>{report.text}</PeopleText></p></article>}
      <div className="sv-order-guide-actions"><button onClick={onAdjust} disabled={actionsProps.quota}>Изменить поручение →</button><button onClick={onDesk}>Продолжить текущий план →</button></div>
      {actionsProps.quota&&<p>Поручение этого квартала уже подписано. Новое вмешательство доступно после следующего решения в кабинете.</p>}
      <p className="sv-country-capacity">Чтение доклада не тратит поручение. Сохранение плана не требует новой подписи.</p>
    </>:<>
      <p>{mode==='assign'?'Вы назначаете руководителя и выделяете бюджет на четыре квартала. Сравните компетенцию, отношение и интерес человека. Цена указана под каждой кандидатурой.':'Выберите, что сейчас важнее: поддержка исполнителя, кадровый резерв, способ набора или другой руководитель. Можно сохранить план без нового поручения.'}</p>
      <button className="sv-order-later" onClick={onDesk}>{mode==='assign'?'Отложить и вернуться к делу':'Продолжить текущий план'} →</button>
      <ProjectActions {...actionsProps}/>
    </>}
    <button className="sv-order-later" onClick={onBrowse}>Все поручения и доклады →</button>
  </div>;
}
