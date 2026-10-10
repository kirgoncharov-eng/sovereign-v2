"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ADVISOR_REVIEW_ART, reviewChoiceBrief, type AdvisorArtScene } from "@/lib/client/advisor-art-review.ts";
import { portraitCanvas } from "@/lib/client/portrait.ts";
import { advisorProfile } from "@/lib/game/advisors.ts";
import { isFemaleName, resolveTurn } from "@/lib/game/engine.ts";
import { classicApi } from "@/lib/game/classic.ts";
import { RES_CONFIG } from "@/lib/game/data.ts";
import type { GameState } from "@/lib/game/types.ts";
import styles from "./art-review.module.css";

function ReviewPortrait({ name, illustrated }: { name: string; illustrated: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const asset = illustrated ? ADVISOR_REVIEW_ART[name] : undefined;
  useEffect(() => {
    if (asset || !canvas.current) return;
    canvas.current.getContext("2d")?.drawImage(portraitCanvas(name, isFemaleName(name)), 0, 0);
  }, [name, asset]);
  return asset
    ? <Image src={asset} width={448} height={560} alt="" unoptimized className={styles.portrait}/>
    : <canvas ref={canvas} width={240} height={300} aria-hidden="true" className={styles.portrait}/>;
}

export default function AdvisorArtReview({ scenes }: { scenes: AdvisorArtScene[] }) {
  const [country, setCountry] = useState("Украина");
  const [illustrated, setIllustrated] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<GameState | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const scene = scenes.find(candidate => candidate.state.country === country)!;
  const event = scene.state.currentEvent!;
  const choice = event.choices.find(candidate => candidate.id === selected);
  const brief = choice ? reviewChoiceBrief(scene.state, choice) : null;
  const paragraphs = event.description.split(/\n\s*\n/);
  const [dateline, opening, ...rest] = paragraphs;

  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  function resetScene(nextCountry = country) {
    setCountry(nextCountry);
    setSelected(null);
    setResult(null);
    setError("");
  }

  async function sign() {
    if (!choice || signing || result) return;
    setSigning(true);
    setError("");
    try {
      const narration = await classicApi.consequence(scene.state, choice.id);
      setResult(resolveTurn(scene.state, choice.id, narration));
    } catch {
      setError("Не удалось показать итог. Попробуйте ещё раз.");
    } finally {
      setSigning(false);
    }
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.reviewHeader}>
        <p className={styles.eyebrow}>Суверен · студия</p>
        <h1>Люди за решениями</h1>
        <p>Эскиз спора советников. Настоящее дело и расчёт; обычная партия и сохранение не затрагиваются.</p>
        <div className={styles.controls}>
          <label>Страна
            <select value={country} disabled={signing} onChange={event => resetScene(event.target.value)}>
              {scenes.map(candidate => <option key={candidate.state.country}>{candidate.state.country}</option>)}
            </select>
          </label>
          <button type="button" aria-pressed={illustrated} onClick={() => setIllustrated(value => !value)}>
            {illustrated ? "Сравнить с маленькими портретами" : "Показать крупные портреты"}
          </button>
        </div>
        {country !== "Украина" && <p className={styles.note}>Для этой страны пока используются существующие процедурные лица.</p>}
      </header>

      <section className={`${styles.phone} ${illustrated ? styles.illustrated : styles.compact}`} aria-label="Экран дела">
        <header className={styles.gameHeader}>
          <span>{country} · квартал {scene.state.turn + 1}</span>
          <span>Резолюция</span>
        </header>
        {!result ? (
          <article className={styles.paper}>
            <p className={styles.eyebrow}>На столе президента</p>
            <h2>{event.title}</h2>
            <p className={styles.note}>{dateline}</p>
            <p className={styles.opening}>{opening}</p>
            <details className={styles.story}>
              <summary>Открыть дело целиком</summary>
              {rest.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </details>

            <div className={styles.debate} aria-label="Спор советников">
              {scene.takes.map(take => {
                const advisor = scene.state.advisors.find(candidate => candidate.id === take.id)!;
                const profile = advisorProfile(scene.state, advisor);
                const favorsIndex = event.choices.findIndex(candidate => candidate.id === take.favors);
                return (
                  <section key={take.id} className={styles.advisor}>
                    <div className={styles.advisorHeading}>
                      <ReviewPortrait name={take.name} illustrated={illustrated}/>
                      <div><h3>{take.name}</h3><p>{take.role}</p>
                        <span className={styles.position}>За вариант {favorsIndex + 1}</span>
                      </div>
                    </div>
                    <blockquote>«{take.text}»</blockquote>
                    <details className={styles.profile}>
                      <summary>Что вы знаете об этом человеке</summary>
                      <p>{profile.bio}</p>
                      <p>Сильная сторона: {profile.area}. {profile.skill}.</p>
                      <p>Лояльность: {profile.loyaltyWord}. Манера: {profile.manner}.</p>
                      <p>Лагерь: {profile.camp?.name ?? "нет связи"}.</p>
                    </details>
                  </section>
                );
              })}
            </div>

            <fieldset className={styles.choices}>
              <legend>Ваша резолюция</legend>
              {event.choices.map((candidate, index) => {
                const candidateBrief = reviewChoiceBrief(scene.state, candidate);
                return (
                  <label key={candidate.id} className={`${styles.choice} ${selected === candidate.id ? styles.selected : ""}`}>
                    <input type="radio" name="resolution" value={candidate.id} checked={selected === candidate.id}
                      disabled={signing} onChange={() => setSelected(candidate.id)}/>
                    <span><strong>{index + 1}. {candidate.text}</strong><small>{candidate.hint}</small>
                      {candidateBrief.warnings.map(warning => <span key={warning} className={styles.warning}>{warning}</span>)}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {brief && <div className={styles.cost} aria-live="polite">
              <p className={styles.eyebrow}>{brief.risk}</p>
              {brief.costs.map(cost => <p key={cost.label}><strong>{cost.label.toLowerCase()}</strong> — {cost.reason}</p>)}
              <p className={styles.note}>Итог зависит от исполнения. Точный расчёт — в газете после решения.</p>
            </div>}
            <button type="button" className={styles.sign} disabled={!choice || signing} onClick={sign}>
              {signing ? "Подписываем…" : choice ? `Подписать вариант ${event.choices.indexOf(choice) + 1}` : "Выберите резолюцию"}
            </button>
            {error && <p role="alert">{error}</p>}
          </article>
        ) : (
          <article className={`${styles.paper} ${styles.result}`}>
            <p className={styles.eyebrow}>Газета · последствия решения</p>
            <h2 ref={resultHeading} tabIndex={-1}>{result.lastTurn!.headline}</h2>
            <p>{result.lastTurn!.narrative}</p>
            <div className={styles.stamp}>Подписано</div>
            <details>
              <summary>Что изменилось</summary>
              {RES_CONFIG.map(resource => {
                const delta = result.resources[resource.key] - scene.state.resources[resource.key];
                return delta !== 0 && <p key={resource.key}>{resource.prompt}: {delta > 0 ? "+" : ""}{delta}</p>;
              })}
            </details>
            <button type="button" className={styles.sign} onClick={() => resetScene()}>Повторить сцену</button>
          </article>
        )}
      </section>
    </main>
  );
}
