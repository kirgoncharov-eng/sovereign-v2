"use client";
import { useState } from "react";
import { REPUBLIC_PLACES, presidentialConversation } from "@/lib/game/presidential-story.ts";
import styles from "./presidential.module.css";
import { isFactoryOpening } from '@/lib/client/factory-scene.ts';
import { pageFx } from '@/lib/client/fx.ts';

export default function PresidentialOpening({ gs, onGo, onDossier }) {
  return <main className={styles.arrival}>
    <div className={styles.desk}>
      <div className={styles.runningHead}><span>НЕМАНСКАЯ РЕСПУБЛИКА</span><span>МИНСК · 1978</span></div>
      <div className={styles.window} aria-hidden="true">
        <svg viewBox="0 0 480 126" preserveAspectRatio="xMidYMax slice">
          <rect width="480" height="126" fill="#89958a"/>
          <path d="M0 88H24V64H60V88H89V42H135V88H173V60H210V88H264V54H296V88H331V35H340V88H350V49H387V88H408V62H451V88H480V126H0Z" fill="#53635e"/>
          <path d="M182 126V86H197V69H238V62H254V69H296V86H312V126Z" fill="#293b38"/>
          <path d="M202 91H211V118H202ZM220 91H229V118H220ZM238 91H247V118H238ZM256 91H265V118H256ZM274 91H283V118H274Z" fill="#c6b58b"/>
          <path d="M0 113H480V126H0Z" fill="#252d2b"/>
          <path d="M18 118H140M329 118H462" stroke="#b29b69" strokeDasharray="5 10" strokeWidth="2"/>
        </svg>
      </div>
      <article className={styles.document}>
        <p className={styles.eyebrow}>Лично президенту · первое утро</p>
        <h1>Кресло ваше.<br/>Долги — тоже.</h1>
        <p>Вы — {gs.leader.name}, новый президент. За окном Минск. На вашем столе — ведомость тракторного завода: два месяца без зарплаты.</p>
        <blockquote>«Директор просит денег. Банк ждёт возврата ссуды. Рабочие ждут вас. Что им передать?»</blockquote>
        <p className={styles.attribution}>Секретарь не садится. Ответ нужен сегодня.</p>
        <button type="button" className={styles.primary} onClick={onGo}>Открыть первое дело <span aria-hidden="true">→</span></button>
        <details className={styles.history}>
          <summary>Как страна дошла до этого утра</summary>
          <p>Это земли Беларуси в другой истории: Минск, Гродно, Брест, Полесье. После 1918 года республика сохранила независимость и стала называться Неманской.</p>
          <p>К 1978 году заводы зависят от российских заказов, западные рынки требуют уступок, а областные руководители привыкли торговаться со столицей. Ваш предшественник оставил вам работающий аппарат — и чужие договорённости.</p>
          <p>Каждый ход — сезон правления. Первый срок — только первый рубеж: удержав власть, можно продолжить. Советники знают больше вас, но каждый смотрит на страну со своей стороны.</p>
        </details>
        <button type="button" className={styles.quiet} onClick={onDossier}>Моё досье и предвыборные обещания →</button>
      </article>
      <p className={styles.footer}>Всё, что вы знаете о стране, вам кто-то сказал.</p>
    </div>
  </main>;
}

function SpokenExchange({ lines, staged }) {
  const [visible, setVisible] = useState(staged ? 1 : lines.length);
  const next = () => { pageFx(); setVisible(count => Math.min(lines.length, count + 1)); };
  return <>
    <div className={styles.conversation} aria-live="polite" aria-relevant="additions">
      {lines.slice(0, visible).map((line, position) => <div className={`${styles.line} ${styles.spoken}`} key={position}>
        <div className={styles.speaker}><b>{line.name}</b><small>{line.role}</small></div>
        <p>{line.text}</p>
      </div>)}
    </div>
    {visible < lines.length && <div className={styles.exchangeActions}>
      <button type="button" onClick={next}>{visible === 1 ? 'Выслушать возражение →' : 'Дать ответить →'}</button>
      <button type="button" onClick={() => setVisible(lines.length)}>Весь разговор</button>
    </div>}
    <p className={styles.attribution}>{visible < lines.length
      ? 'Можно продолжить разговор или подписать решение сейчас.'
      : 'Совет высказался. Резолюция и ответственность остаются вашими.'}</p>
  </>;
}

export function PresidentialCouncil({ gs, children }) {
  const [selected, setSelected] = useState(0);
  const choices = gs.currentEvent?.choices ?? [];
  const index = Math.min(selected, Math.max(0, choices.length - 1));
  return <section className={styles.council} aria-label="Разговор в кабинете">
    <p className={styles.eyebrow}>Закрытое совещание · без стенографиста</p>
    <h3>Что именно мы подпишем?</h3>
    <div className={styles.tabs} aria-label="Обсудить вариант">
      {choices.map((choice, position) => <button key={choice.id} type="button" aria-pressed={index === position}
        onClick={() => setSelected(position)}>{position + 1}. {choice.text}</button>)}
    </div>
    <SpokenExchange key={index} lines={presidentialConversation(gs, index)} staged={isFactoryOpening(gs)}/>
    {children(choices[index], index)}
  </section>;
}

export function RepublicAtlas({ gs }) {
  const [selected, setSelected] = useState('minsk');
  const place = REPUBLIC_PLACES.find(item => item.id === selected) ?? REPUBLIC_PLACES[0];
  return <section className={styles.atlas} aria-label="Карта республики">
    <p className={styles.eyebrow}>Неманская республика · записки о стране</p>
    <svg viewBox="0 0 330 245" role="img" aria-label="Схематическая карта: Минск, Гродно, Брест, Полесье">
      <defs><pattern id="republic-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="currentColor" opacity=".08"/></pattern></defs>
      <rect width="330" height="245" fill="url(#republic-grid)"/>
      <path d="M92 33L151 24L177 43L220 25L249 68L282 81L293 140L276 166L283 207L237 219L200 210L160 223L121 203L56 203L34 171L51 134L40 93L65 76Z"
        fill="currentColor" fillOpacity=".05" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M48 93Q98 123 147 103T208 74" fill="none" stroke="#8e9c92" strokeWidth="3"/>
      <path d="M65 173L170 105L65 92M170 105L211 192" fill="none" stroke="currentColor" strokeDasharray="3 5" opacity=".3"/>
      {REPUBLIC_PLACES.map(item => <g key={item.id}>
        <circle cx={item.x} cy={item.y} r={item.id === selected ? 5 : 3} fill={item.id === selected ? '#b59458' : 'currentColor'}/>
        <text x={item.x + 9} y={item.y - 8} fill="currentColor" fontSize="12">{item.name}</text>
      </g>)}
    </svg>
    <div className={styles.places}>{REPUBLIC_PLACES.map(item => <button type="button" key={item.id}
      aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.name}</button>)}</div>
    <h3>{place.title}</h3><p>{place.text}</p>
    <p className={styles.attribution}>Карта — справка о мире. Текущее положение и последствия ваших решений — в сводке ниже.</p>
    {gs.pending.length > 0 && <div className={styles.obligation}><b>Подпись ещё действует</b>
      {[...gs.pending].sort((first, second) => first.due - second.due).slice(0, 2).map(item =>
        <p key={item.id}>{item.label} · через {Math.max(0, item.due - gs.turn)} ход.</p>)}
    </div>}
  </section>;
}
