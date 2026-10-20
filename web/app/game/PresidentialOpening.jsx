"use client";
import { useEffect, useRef, useState } from "react";
import { REPUBLIC_PLACES, presidentialConversation, hasAuthoredDebate } from "@/lib/game/presidential-story.ts";
import {
  HISTORICAL_SCENE_ART,
  HISTORICAL_LEADER_ART,
  BIO_TO_PORTRAIT,
  artSource,
  historicalPortraitArt,
} from "@/lib/client/historical-art.ts";
import { offeredPromises, promiseDef } from "@/lib/game/promises.ts";
import { BIOGRAPHIES, IDEOLOGIES } from "@/lib/game/data.ts";
import { freshLeaderName } from "@/lib/game/classic.ts";
import { portraitCanvas, PORTRAIT_W, PORTRAIT_H } from "@/lib/client/portrait.ts";
import { isFemaleName } from "@/lib/game/engine.ts";
import styles from "./presidential.module.css";
import { pageFx } from '@/lib/client/fx.ts';

const BIO_SHORT_BONUS = {
  officer: "силовики +8",
  military: "силовики +8",
  economist: "экономика +8",
  lawyer: "легитимность +8",
  diplomat: "репутация +8",
  mayor: "политкапитал +8",
};

function LeaderPortrait({ name, src }) {
  const ref = useRef(null);
  useEffect(() => {
    if (src || !ref.current || !name) return;
    const canvas = portraitCanvas(name, isFemaleName(name));
    const ctx = ref.current.getContext("2d");
    if (ctx) ctx.drawImage(canvas, 0, 0);
  }, [name, src]);

  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={artSource(src)}
        alt={name}
        className={styles.leaderPortrait}
      />
    );
  }
  return <canvas ref={ref} width={PORTRAIT_W} height={PORTRAIT_H} className={styles.leaderPortrait} aria-hidden="true" />;
}

export default function PresidentialOpening({ gs, onCustomize, onGo, onDossier }) {
  const [nameStep, setNameStep] = useState(1);

  const activeBioId = gs?.bio || "economist";
  const activePortraitId = gs?.leader?.portrait || BIO_TO_PORTRAIT[activeBioId] || "economist";
  const portraitMeta = HISTORICAL_LEADER_ART[activePortraitId] || HISTORICAL_LEADER_ART.economist;
  const portraitSrc = (gs ? historicalPortraitArt(gs, gs.leader.name) : null) || portraitMeta.src;

  const activeBio = BIOGRAPHIES.find(b => b.id === activeBioId) || BIOGRAPHIES[1];
  const ideoInfo = IDEOLOGIES.find(i => i.id === gs.ideo);
  const { suggested } = offeredPromises(gs.seed, gs.ideo);
  const initialPromises = (suggested || []).map(id => promiseDef(id, gs.country)).filter(Boolean);

  const rollName = () => {
    pageFx();
    const nextName = freshLeaderName(gs, false, nameStep);
    setNameStep(s => s + 1);
    onCustomize?.({ name: nextName });
  };

  const selectBio = bioId => {
    pageFx();
    onCustomize?.({
      bio: bioId,
      portrait: BIO_TO_PORTRAIT[bioId] || "economist",
    });
  };

  const selectIdeo = ideoId => {
    pageFx();
    onCustomize?.({ ideo: ideoId });
  };

  return <main className={styles.arrival}>
    <div className={styles.desk}>
      <div className={styles.runningHead}><span>НЕМАНСКАЯ РЕСПУБЛИКА · АППАРАТ ПРЕЗИДЕНТА</span><span>МИНСК · ЯНВАРЬ 1978</span></div>

      <figure className={styles.windowScene}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artSource(HISTORICAL_SCENE_ART.residenceMorning.src)}
          alt=""
          className="sv-px"
          style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }}
        />
        <div className={styles.sceneCaption}>
          <span>{HISTORICAL_SCENE_ART.residenceMorning.caption}</span>
          <span className={styles.sceneBadge}>ЯНВАРЬ 1978</span>
        </div>
      </figure>

      <article className={styles.document}>
        <p className={styles.eyebrow}>Лично президенту · Первое утро в резиденции</p>

        <h1>Кресло ваше.<br/>Долги — тоже.</h1>
        <p>Вы входите в кабинет на четвёртом этаже. За окном — морозный Минск. На вашем столе лежит первая папка: ведомость тракторного завода, два месяца без зарплаты.</p>
        <blockquote>«Директор просит денег. Банк ждёт возврата ссуды. Рабочие ждут вас. Что им передать?»</blockquote>
        <p className={styles.attribution}>Секретарь не садится. Ответ нужен сегодня.</p>

        <div className={styles.credentials}>
          <div className={styles.credentialsHeader}>
            <span>КТО ЗАНИМАЕТ КРЕСЛО · УДОСТОВЕРЕНИЕ ЦИК</span>
            <span>{portraitMeta.label.toUpperCase()}</span>
          </div>

          <div className={styles.credentialsMain}>
            <div className={styles.portraitColumn}>
              <div className={styles.portraitWrapper}>
                <LeaderPortrait name={gs.leader.name} src={portraitSrc} />
                <span className={styles.portraitStamp}>ЦИК · 1978</span>
              </div>
            </div>

            <div className={styles.credentialsText}>
              <div className={styles.nameRow}>
                <div className={styles.credentialsName}>{gs.leader.name}</div>
                {onCustomize && (
                  <button type="button" className={styles.rollNameBtn} onClick={rollName} title="Сменить имя и фамилию">
                    ↻ Имя
                  </button>
                )}
              </div>
              <div className={styles.credentialsRole}>
                Президент республики · Партия «{gs.leader.party}»{ideoInfo ? ` · ${ideoInfo.label.toLowerCase()}` : ""}
              </div>
              {gs.leader.bio && <div className={styles.credentialsBio}>{gs.leader.bio}</div>}
              {activeBio && (
                <div className={styles.credentialsBonus}>
                  {activeBio.note}
                </div>
              )}
            </div>
          </div>

          {onCustomize && (
            <div className={styles.personaSelectors}>
              <div className={styles.selectorGroup}>
                <div className={styles.selectorLabel}>ПРОШЛОЕ РЕМЕСЛО (МЕНЯЕТ ОБРАЗ И СТАРТОВУЮ ОПОРУ):</div>
                <div className={styles.pillRow}>
                  {BIOGRAPHIES.map(b => {
                    const active = activeBioId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={active}
                        className={`${styles.personaPill} ${active ? styles.personaPillActive : ""}`}
                        onClick={() => selectBio(b.id)}
                      >
                        <span className={styles.pillTitle}>{b.label}</span>
                        <span className={styles.pillSub}>{BIO_SHORT_BONUS[b.id]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.selectorGroup}>
                <div className={styles.selectorLabel}>ПОЛИТИЧЕСКИЙ КУРС (МЕНЯЕТ ПАРТИЮ И ОБЕЩАНИЯ):</div>
                <div className={styles.pillRowFour}>
                  {IDEOLOGIES.map(i => {
                    const active = gs.ideo === i.id;
                    return (
                      <button
                        key={i.id}
                        type="button"
                        aria-pressed={active}
                        className={`${styles.personaPill} ${active ? styles.personaPillActive : ""}`}
                        onClick={() => selectIdeo(i.id)}
                      >
                        <span className={styles.pillTitle}>{i.label}</span>
                        <span className={styles.pillSub}>{i.desc.split("·")[0].trim()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {initialPromises.length > 0 && (
          <div className={styles.promisesBlock}>
            <div className={styles.promisesTitle}>ПРЕДВЫБОРНЫЕ ОБЯЗАТЕЛЬСТВА ГРАЖДАНАМ:</div>
            <div className={styles.promisesList}>
              {initialPromises.map((p, i) => (
                <div key={p.id} className={styles.promiseItem}>
                  <span className={styles.promiseBadge}>ОБЯЗАТЕЛЬСТВО {i + 1}</span>
                  <span className={styles.promiseText}><b>{p.title}.</b> «{p.pitch}»</span>
                </div>
              ))}
            </div>
            <div className={styles.promisesHint}>
              Страна помнит каждое слово. Нарушение обещания обрушит доверие избирателей.
            </div>
          </div>
        )}

        <button type="button" className={styles.primary} onClick={onGo}>
          Вступить в должность · Открыть первое дело <span aria-hidden="true">→</span>
        </button>

        <details className={styles.history}>
          <summary>Как страна дошла до этого утра</summary>
          <p>Это земли Беларуси в другой истории: Минск, Гродно, Брест, Полесье. После 1918 года республика сохранила независимость и стала называться Неманской.</p>
          <p>К 1978 году заводы зависят от российских заказов, западные рынки требуют уступок, а областные руководители привыкли торговаться со столицей. Ваш предшественник оставил вам работающий аппарат — и чужие договорённости.</p>
          <p>Каждый ход — сезон правления. Первый срок — только первый рубеж: удержав власть, можно продолжить. Советники знают больше вас, но каждый смотрит на страну со своей стороны.</p>
        </details>
        <button type="button" className={styles.quiet} onClick={onDossier}>Изучить досье фигур и выбрать обещания вручную →</button>
      </article>
      <p className={styles.footer}>Всё, что вы знаете о стране, вам кто-то сказал.</p>
    </div>
  </main>;
}

function SpokenExchange({ gs, lines, staged }) {
  const [visible, setVisible] = useState(staged ? 1 : lines.length);
  const next = () => { pageFx(); setVisible(count => Math.min(lines.length, count + 1)); };
  return <>
    <div className={styles.conversation} aria-live="polite" aria-relevant="additions">
      {lines.slice(0, visible).map((line, position) => {
        const portraitSrc = gs ? historicalPortraitArt(gs, line.name) : null;
        return (
          <div className={`${styles.line} ${styles.spoken}`} key={position}>
            <div className={styles.speaker}>
              {portraitSrc && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={artSource(portraitSrc)}
                  alt={line.name}
                  width={44}
                  height={44}
                  className={styles.speakerPortrait}
                />
              )}
              <div className={styles.speakerInfo}>
                <b>{line.name}</b>
                <small>{line.role}</small>
              </div>
            </div>
            <p>{line.text}</p>
          </div>
        );
      })}
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
    <div className={styles.tabs} role="group" aria-label="Обсудить вариант">
      {choices.map((choice, position) => <button key={choice.id} type="button"
        aria-pressed={index === position} aria-label={`Обсудить вариант ${position + 1}: ${choice.text}`}
        onClick={() => setSelected(position)}>Вариант {position + 1}</button>)}
    </div>
    <SpokenExchange key={index} gs={gs} lines={presidentialConversation(gs, index)} staged={hasAuthoredDebate(gs, index)}/>
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
