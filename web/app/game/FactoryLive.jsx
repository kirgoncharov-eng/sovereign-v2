"use client";
import { useState } from 'react';
import { FACTORY_CALL } from '@/lib/client/factory-scene.ts';
import { telephoneFx } from '@/lib/client/fx.ts';
import styles from './factory-live.module.css';

export default function FactoryLive() {
  const [line, setLine] = useState(-1);
  const connected = line >= 0 && line < FACTORY_CALL.length;
  const toDecision = () => {
    setLine(FACTORY_CALL.length);
    document.getElementById('sv-resolution')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  return <section className={styles.scene} aria-label="В кабинете президента">
    <svg className={styles.office} viewBox="0 0 300 124" role="img" aria-label="Кабинет: телефон, папка завода, окно на зимний Минск">
      <rect width="300" height="124" fill="#39463d"/>
      <rect x="17" y="10" width="123" height="78" fill="#172c2b"/>
      <rect x="22" y="15" width="113" height="67" fill="#8b9b98"/>
      <path d="M22 63H31V42H52V63H65V33H92V63H107V46H135V82H22Z" fill="#586c65"/>
      <path d="M22 75H135V82H22Z" fill="#d7d8c8"/>
      <g className={styles.snow} fill="#e6e3d4"><path d="M32 23h2v2h-2zm18 14h2v2h-2zm29-16h2v2h-2zm25 24h2v2h-2zm21-21h2v2h-2z"/></g>
      <path d="M76 12H81V85H76ZM20 46H138V50H20Z" fill="#283c34"/>
      <rect x="167" y="16" width="37" height="38" fill="#252f29"/>
      <circle cx="185" cy="35" r="14" fill="#c9bea0"/>
      <path d="M185 25V35H194" fill="none" stroke="#3d473b" strokeWidth="2"/>
      <path className={styles.clock} d="M185 35L185 23" stroke="#9a573b" strokeWidth="1"/>
      <path d="M0 95L46 78H263L300 95V124H0Z" fill="#69543a"/>
      <path d="M0 98H300V103H0Z" fill="#a48b5d"/>
      <g className={styles.paper}><path d="M122 80H178L187 96H112Z" fill="#d5c496"/>
        <path d="M132 84H166M126 88H173M122 92H148" stroke="#867b5a" strokeWidth="1"/></g>
      <g className={line < 0 ? styles.ringing : undefined}>
        <path d="M211 82H250L257 96H204Z" fill="#202b27"/>
        <path d="M211 79V73H252V79H245V77H218V79Z" fill="#17211e"/>
        <circle cx="231" cy="87" r="6" fill="#7d8269"/><circle cx="231" cy="87" r="3" fill="#29352c"/>
      </g>
      <path d="M63 79V55H68V79M50 55L58 43H77L86 55Z" fill="#b19c64"/>
      <path d="M54 79H79V82H54Z" fill="#29352c"/>
    </svg>
    <div className={styles.caption}><span className={styles.light} aria-hidden="true"/>
      {line < 0 ? 'Секретариат: завод на линии' : connected ? 'Соединение с заводом' : 'Разговор окончен. Решение за вами.'}
    </div>
    {line < 0 && <div className={styles.actions}>
      <button type="button" onClick={() => { telephoneFx(); setLine(0); }}>Снять трубку</button>
      <button type="button" onClick={toDecision}>Сразу к решениям →</button>
    </div>}
    {connected && <div className={styles.call} aria-live="polite">
      <small>{FACTORY_CALL[line].speaker}</small><p key={line}>{FACTORY_CALL[line].text}</p>
      <div className={styles.actions}>
        {line === 0 && <button type="button" onClick={() => setLine(1)}>«Вы готовы разговаривать?»</button>}
        <button type="button" onClick={toDecision}>{line === 0 ? 'Положить трубку' : '«Я вас услышал». К решениям →'}</button>
      </div>
    </div>}
  </section>;
}
