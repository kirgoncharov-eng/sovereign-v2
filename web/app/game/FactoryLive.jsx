"use client";
import { useState } from 'react';
import { FACTORY_CALL } from '@/lib/client/factory-scene.ts';
import { telephoneFx } from '@/lib/client/fx.ts';
import { artSource } from '@/lib/client/historical-art.ts';
import styles from './factory-live.module.css';

export default function FactoryLive() {
  const [line, setLine] = useState(-1);
  const connected = line >= 0 && line < FACTORY_CALL.length;
  const toDecision = () => {
    setLine(FACTORY_CALL.length);
    document.getElementById('sv-resolution')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <section className={styles.scene} aria-label="Проходная тракторного завода и связь с секретариатом">
    <div className={styles.visual}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artSource('/art/gemini-next/wages-gate.webp')}
        alt="Проходная тракторного завода зимой"
        width={960}
        height={536}
        className={styles.picture}
      />
      {line < 0 && (
        <div className={styles.statusBadge} aria-label="Спецсвязь: вызов">
          <span className={styles.pulseDot} aria-hidden="true" />
          <span>СВЯЗЬ С ЗАВОДОМ</span>
        </div>
      )}
    </div>
    <div className={styles.console}>
      <div className={styles.caption}>
        <span className={styles.light} aria-hidden="true" />
        {line < 0 ? 'Секретариат: завод на линии' : connected ? 'Прямой провод с заводской проходной' : 'Разговор окончен. Решение за вами.'}
      </div>
      {line < 0 && (
        <div className={styles.actions}>
          <button type="button" onClick={() => { telephoneFx(); setLine(0); }}>
            Снять трубку
          </button>
          <button type="button" onClick={toDecision}>
            Сразу к решениям →
          </button>
        </div>
      )}
      {connected && (
        <div className={styles.call} aria-live="polite">
          <small>{FACTORY_CALL[line].speaker}</small>
          <p key={line}>{FACTORY_CALL[line].text}</p>
          <div className={styles.actions}>
            {line === 0 && <button type="button" onClick={() => setLine(1)}>«Вы готовы разговаривать?»</button>}
            <button type="button" onClick={toDecision}>{line === 0 ? 'Положить трубку' : '«Я вас услышал». К решениям →'}</button>
          </div>
        </div>
      )}
    </div>
  </section>;
}
