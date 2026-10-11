"use client";

import { useEffect, useRef, useState } from "react";
import { reviewChoiceBrief, type AdvisorArtScene } from "@/lib/client/advisor-art-review.ts";
import { drawScene } from "@/lib/client/scenes.ts";
import { squareStateOf } from "@/lib/client/square-state.ts";
import { sceneOf, SCENE_CAPTION, type SceneKey } from "@/lib/content/scene-map.ts";
import { portraitCanvas } from "@/lib/client/portrait.ts";
import { advisorProfile } from "@/lib/game/advisors.ts";
import { isFemaleName, resolveTurn } from "@/lib/game/engine.ts";
import { classicApi } from "@/lib/game/classic.ts";
import { RES_CONFIG } from "@/lib/game/data.ts";
import type { GameState } from "@/lib/game/types.ts";
import styles from "./interface-review.module.css";

function Portrait({ name }: { name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    canvas.current?.getContext("2d")?.drawImage(portraitCanvas(name, isFemaleName(name)), 0, 0);
  }, [name]);
  return <canvas ref={canvas} width={240} height={300} aria-hidden="true" className={styles.portrait}/>;
}

function CasePicture({ state, sceneKey }: { state: GameState; sceneKey: SceneKey }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) drawScene(context, 220, 44, sceneKey, squareStateOf(state), 0);
  }, [state, sceneKey]);
  return <canvas ref={canvas} width={220} height={44} role="img"
    aria-label={SCENE_CAPTION[sceneKey]} className={styles.casePicture}/>;
}

export default function TurnInterfaceReview({ scenes }: { scenes: AdvisorArtScene[] }) {
  const [country, setCountry] = useState("Украина");
  const [onDesk, setOnDesk] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<GameState | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState("");
  const signingLock = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const choiceHeading = useRef<HTMLLegendElement>(null);
  const scene = scenes.find(candidate => candidate.state.country === country)!;
  const event = scene.state.currentEvent!;
  const choice = event.choices.find(candidate => candidate.id === selected);
  const brief = choice ? reviewChoiceBrief(scene.state, choice) : null;
  const paragraphs = event.description.split(/\n\s*\n/);
  const [dateline, ...story] = paragraphs;

  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  function reset(nextCountry = country) {
    if (signingLock.current) return;
    setCountry(nextCountry);
    setSelected(null);
    setResult(null);
    setError("");
  }

  async function sign() {
    if (!choice || signingLock.current || result) return;
    signingLock.current = true;
    setSigning(true);
    setError("");
    try {
      const narration = await classicApi.consequence(scene.state, choice.id);
      setResult(resolveTurn(scene.state, choice.id, narration));
    } catch {
      setError("Не удалось показать итог. Попробуйте ещё раз.");
    } finally {
      signingLock.current = false;
      setSigning(false);
    }
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.studio}>
        <p className={styles.eyebrow}>Суверен · студия</p>
        <h1>Один ход на столе</h1>
        <p>Играбельный образец. Одно настоящее дело, две компоновки, прежние текст и правила.</p>
        <div className={styles.controls}>
          <label>Страна
            <select aria-label="Страна" value={country} disabled={signing} onChange={change => reset(change.target.value)}>
              {scenes.map(candidate => <option key={candidate.state.country}>{candidate.state.country}</option>)}
            </select>
          </label>
          <div className={styles.switch} role="group" aria-label="Компоновка одного дела">
            <button type="button" aria-pressed={!onDesk} onClick={() => setOnDesk(false)}>Читать подряд</button>
            <button type="button" aria-pressed={onDesk} onClick={() => setOnDesk(true)}>На столе</button>
          </div>
        </div>
        <p className={styles.note}>Сравнивайте в одной стране. Подпись не меняет вашу обычную партию.</p>
      </header>

      <section className={`${styles.game} ${onDesk ? styles.desk : styles.linear}`} aria-label="Экран одного дела">
        <header className={styles.gameHeader}>
          <span>{country}</span><span>Квартал {scene.state.turn + 1}</span>
        </header>
        {!result ? <>
          <article className={styles.document}>
            <div className={styles.documentHeader}>
              <span className={styles.eyebrow}>Дело на подпись</span>
              <span className={styles.filing} aria-hidden="true">№ {String(scene.state.turn + 1).padStart(2, "0")}</span>
            </div>
            <h2>{event.title}</h2>
            <CasePicture state={scene.state} sceneKey={sceneOf(event)}/>
            <p className={styles.dateline}>{dateline}</p>
            {story.map((paragraph, index) => <p key={index} className={styles.story}>{paragraph}</p>)}
            <button type="button" className={styles.jump} onClick={() => choiceHeading.current?.focus()}>
              К резолюции ↓
            </button>
          </article>

          <section className={styles.debate} aria-label="Спор советников">
            <p className={styles.sectionLabel}>На полях · два мнения</p>
            {scene.takes.map(take => {
              const advisor = scene.state.advisors.find(candidate => candidate.id === take.id)!;
              const profile = advisorProfile(scene.state, advisor);
              const favorsIndex = event.choices.findIndex(candidate => candidate.id === take.favors);
              return <details key={`${country}-${take.id}-${onDesk}`} open={!onDesk} className={styles.advisor}>
                <summary>
                  <Portrait name={take.name}/>
                  <span className={styles.person}><strong>{take.name}</strong><small>{take.role}</small></span>
                  <span className={styles.position}>Вариант {favorsIndex + 1}<small>поддерживает</small></span>
                </summary>
                <blockquote>«{take.text}»</blockquote>
                <details className={styles.profile}>
                  <summary>Что известно об этом человеке</summary>
                  <p>{profile.bio}</p>
                  <p>Сильная сторона: {profile.area}. {profile.skill}.</p>
                  <p>Лояльность: {profile.loyaltyWord}. Манера: {profile.manner}.</p>
                  <p>Лагерь: {profile.camp?.name ?? "нет связи"}.</p>
                </details>
              </details>;
            })}
          </section>

          <section className={styles.resolution}>
            <fieldset className={styles.choices}>
              <legend ref={choiceHeading} tabIndex={-1}>Ваша резолюция</legend>
              {event.choices.map((candidate, index) => {
                const candidateBrief = reviewChoiceBrief(scene.state, candidate);
                return <label key={candidate.id} className={styles.choice}>
                  <input type="radio" name="resolution" value={candidate.id} checked={selected === candidate.id}
                    disabled={signing} onChange={() => setSelected(candidate.id)}/>
                  <span className={styles.number} aria-hidden="true">{index + 1}</span>
                  <span><strong>{candidate.text}</strong><small>{candidate.hint}</small>
                    {candidateBrief.warnings.map(warning => (
                      <span key={warning} className={styles.warning}>{warning}</span>
                    ))}
                  </span>
                </label>;
              })}
            </fieldset>
            {brief ? <aside className={styles.cost} aria-live="polite" aria-label="Цена и исполнение">
              <p className={styles.eyebrow}>До подписи</p>
              <p><strong>{brief.risk}</strong></p>
              {brief.costs.map(cost => (
                <p key={cost.label}><strong>{cost.label}</strong> — {cost.reason}</p>
              ))}
              <p className={styles.note}>Итог зависит от исполнения. Точный расчёт — после решения.</p>
            </aside> : <p className={styles.note}>Выберите вариант, чтобы увидеть объяснение цены и исполнения.</p>}
            <button type="button" className={styles.action} disabled={!choice || signing} onClick={sign}>
              {signing ? "Подписываем…" : choice
                ? `Подписать вариант ${event.choices.indexOf(choice) + 1}` : "Выберите резолюцию"}
            </button>
            {error && <p role="alert" className={styles.warning}>{error}</p>}
          </section>
        </> : <article className={styles.newspaper}>
          <p className={styles.eyebrow}>Газета · ответ мира</p>
          <h2 ref={resultHeading} tabIndex={-1}>{result.lastTurn!.headline}</h2>
          <CasePicture state={result} sceneKey={result.lastTurn!.scene ?? sceneOf(event)}/>
          <p className={styles.story}>{result.lastTurn!.narrative}</p>
          <div className={styles.receipt}>
            <span className={styles.stamp}>Подписано</span>
            <p>{choice?.text}</p>
          </div>
          <section aria-label="Что изменилось">
            <h3>Что изменилось</h3>
            <div className={styles.changes}>
              {RES_CONFIG.map(resource => {
                const delta = result.resources[resource.key] - scene.state.resources[resource.key];
                return delta !== 0 ? <div key={resource.key} className={styles.change}>
                  <span>{resource.prompt}</span><strong>{delta > 0 ? "+" : ""}{delta}</strong>
                </div> : null;
              })}
            </div>
          </section>
          <p className={styles.note}>В образце одно дело. Можно повторить его с другой резолюцией или компоновкой.</p>
          <button type="button" className={styles.action} onClick={() => reset()}>Повторить дело</button>
        </article>}
      </section>
    </main>
  );
}
