"use client";
import { useState } from 'react';
import { PROJECTS, governmentLoad, governmentProject } from '@/lib/game/government.ts';
import { livingActions, worldPerson } from '@/lib/game/living-world.ts';
import { PeopleText } from './PeopleText.jsx';
const LABEL = { unassigned:'Ждёт запуска', proposed:'Предложение', running:'Исполняется', completed:'Выполнено', partial:'Частично', failed:'Срок сорван' };
const RESOURCE = { economy:'экономика', politicalCapital:'политкапитал', personalResource:'личный ресурс', internalLegitimacy:'легитимность' };
export const governmentPrice = cost => Object.entries(cost).map(([k,v])=>`${RESOURCE[k]??k} ${v}`).join(' · ') || 'Без списания ресурсов';
export default function GovernmentPanel({ gs, onAction, onClose, onDetails }) {
  const [selected,setSelected]=useState('energy'),[pending,setPending]=useState(null),[receipt,setReceipt]=useState(''),[error,setError]=useState('');
  const world=gs.world;
  if(!world?.government)return null;
  const def=PROJECTS.find(p=>p.id===selected),project=governmentProject(world,selected),priority=world.government.priority===selected;
  const actions=livingActions(gs);
  const delegate=actions.find(a=>a.id===(selected==='energy'?'appoint:minister':selected==='health'?'health:appoint:healthMinister':`government:start:${selected}`));
  const focus=actions.find(a=>a.id===`government:priority:${selected}`);
  const release=priority&&actions.find(a=>a.id==='government:release');
  const support=actions.find(a=>a.id===`government:support:${selected}`);
  const options=[delegate,focus,support,release].filter(Boolean);
  const choice=options.find(a=>a.id===pending);
  const coordinator=selected==='energy'?project.executor&&worldPerson(gs,project.executor)?.name:selected==='health'?project.executor&&worldPerson(gs,project.executor)?.name:project.name;
  function confirm(){if(!choice||choice.blocked)return;try{onAction(choice.id);setPending(null);setReceipt('Подпись записана. Квартал ещё не закончен; исполнение проверится после главного решения.');setError('');}catch(e){setError(e.message)}}
  return <section className="sv-government" data-government-panel>
    <header><small>ПРЕДЛОЖЕНИЯ ПРАВИТЕЛЬСТВА</small><h3>Что вы хотите провести?</h3><p>Кабинет ведёт до двух программ одновременно. Сейчас в работе: {governmentLoad(world)}/2. Одно личное вмешательство на запуск, переговоры или изменение поручения за квартал; чтение свободно.</p></header>
    <div className="sv-government-list" aria-label="Пять направлений правительства">{PROJECTS.map(d=>{const p=governmentProject(world,d.id);return <button key={d.id} data-government-project={d.id} aria-pressed={selected===d.id} onClick={()=>{setSelected(d.id);setPending(null);setReceipt('');setError('')}}><strong>{d.title}</strong><span>{LABEL[p.status]}{p.status!=='proposed'&&p.status!=='unassigned'?` · ${p.progress}%`:''}{world.government.priority===d.id?' · ваш приоритет':''}</span></button>})}</div>
    <article className="sv-government-detail"><h3>{def.title}</h3>
      <dl><div><dt>Для страны</dt><dd>{def.benefit}</dd></div><div><dt>Политический смысл</dt><dd>{def.politics}</dd></div><div><dt>Причины риска</dt><dd>{def.risk}</dd></div><div><dt>Стартовый бюджет</dt><dd>{governmentPrice(def.cost)} · четыре квартала</dd></div></dl>
      {selected==='housing'&&['accepted','used'].includes(world.mandate?.phase)&&<p className="sv-government-factors"><PeopleText>{world.mandate.name}</PeopleText> получил право выбирать подрядчиков по вашей прежней договорённости об энергосети. При запуске жилья он воспользуется им самостоятельно: +5 работы и экономика −1 за каждый квартал исполнения; проверка закупок теряет 5 работы без прямого доступа к документам. Отозвать право можно в его сообщении.</p>}
      {coordinator&&<p>Исполняет: <PeopleText>{coordinator}</PeopleText>. Работа {project.progress}%. {project.due?`Срок — конец квартала ${project.due}.`:''}</p>}
      {project.lastFactors?.length>0&&<p className="sv-government-factors">Последний доклад: {project.lastFactors.join('. ')}.</p>}
      {priority&&<p className="sv-government-priority">Ваш личный приоритет: +5 пунктов работы и личный ресурс −1 за квартал при запасе выше 4. Полный успех: легитимность +3; неполный итог: −4.</p>}
      {(selected==='energy'||selected==='health')&&<button className="sv-desk-link" onClick={()=>onDetails(selected)}>Открыть исполнителей, поручения и доклады →</button>}
      <div className="sv-government-actions">{options.map(a=><button key={a.id} data-government-action={a.id} disabled={!!a.blocked} aria-pressed={pending===a.id} onClick={()=>{setPending(a.id);setReceipt('');setError('')}}><strong>{a.title}</strong><span>{a.detail}</span><em>{governmentPrice(a.cost)}</em>{a.blocked&&<em>{a.blocked}</em>}</button>)}</div>
      {choice&&<div className="sv-government-sign"><p>Подписать: {choice.title}</p><strong>{governmentPrice(choice.cost)}</strong><button disabled={!!choice.blocked} onClick={confirm}>Подписать поручение</button><button onClick={()=>setPending(null)}>Отложить</button></div>}
      {receipt&&<p role="status">{receipt}</p>}{error&&<p role="alert">{error}</p>}
      {!options.length&&<p>Эта программа завершена. Итог остаётся в истории; другие предложения можно открыть слева или выше.</p>}
    </article><button className="sv-desk-link" onClick={onClose}>Вернуться к главному делу →</button>
  </section>;
}
