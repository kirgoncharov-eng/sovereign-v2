"use client";
import { PeopleText } from './PeopleText.jsx';
export default function CommitmentBrief({ entries, onOpen, canOpen }) {
  const active = entries.filter(entry => entry.active), past = entries.filter(entry => !entry.active);
  const card = entry => <article key={entry.id} data-commitment={entry.id} className="sv-brief-card"><h3><PeopleText>{entry.title}</PeopleText></h3><dl>
    <div><dt>Помощь сейчас</dt><dd>{entry.received}</dd></div>
    <div><dt>Ваше обязательство</dt><dd>{entry.promised}</dd></div>
    <div><dt>Текущая цена</dt><dd>{entry.price}</dd></div>
    <div><dt>Следующий шаг</dt><dd>{entry.next}</dd></div>
  </dl><button disabled={!canOpen(entry)} className="sv-desk-link" onClick={()=>onOpen(entry)}>{entry.target.kind==='person'?'Открыть договорённость':entry.target.kind==='project'?'Открыть больничное поручение':'Открыть личный приоритет'} →</button>{!canOpen(entry)&&<p className="sv-desk-intro">Прежний участник больше недоступен; итог сохранён здесь.</p>}</article>;
  return <section data-commitment-brief><p className="sv-desk-intro">Текущие условия · чтение бесплатно.</p>
    {active.length ? active.map(card) : <p className="sv-desk-intro">Действующих договорённостей пока нет. Предложения людей доступны в обращениях.</p>}
    {past.length>0&&<details className="sv-brief-history"><summary>Завершённые и отклонённые · {past.length}</summary>{past.map(card)}</details>}
  </section>;
}
