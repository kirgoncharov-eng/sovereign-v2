'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CHAPTER_SAVE, GOALS, RESOURCE_NAMES, chapterOptions, chapterScene, decideChapter, newChapter, restoreChapter, serializeChapter, type Chapter } from '@/lib/game/first-chapter';
import { chapterStory } from '@/lib/game/first-chapter-story';
import { worldPerson } from '@/lib/game/living-world';
import { TRAITS } from '@/lib/game/people';
import { leaderRating } from '@/lib/game/engine';
import { drawScene } from '@/lib/client/scenes';
import type { SceneKey } from '@/lib/content/scene-map';
import './chapter.css';
function Scene({ chapter, kind }: { chapter: Chapter; kind: SceneKey }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const g = chapter.game, seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, animation = 0, last = -Infinity;
    const paint = (time: number) => {
      if (time - last > 200) {
        drawScene(ctx, 240, 88, kind, { country: g.country, seed: g.seed, turn: g.turn,
          legitimacy: g.resources.internalLegitimacy, rating: leaderRating(g.factions, g.resources), military: g.resources.military,
          security: 0, crises: 0, election: false, season: seasons[g.turn % 4], economy: g.resources.economy,
          phase: kind === 'phone' ? 3 : kind === 'cabinet' ? 0 : 1 }, frame++);
        last = time;
      }
      if (!reduced) animation = requestAnimationFrame(paint);
    };
    paint(0);
    return () => cancelAnimationFrame(animation);
  }, [chapter, kind]);
  return <canvas ref={canvas} width={240} height={88} aria-label={kind === 'square' ? 'Площадь: сезон и состояние страны' : 'Место действия'} role="img" />;
}
export default function ChapterGame() {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(false);
  const top = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    newChapter().then(base => {
      if (!live) return;
      let saved: string | null = null;
      try { saved = localStorage.getItem(CHAPTER_SAVE); } catch { /* Play without saving. */ }
      const restored = saved ? restoreChapter(base, saved) : null;
      setChapter(restored ?? base); setReport(!!restored?.report);
      if (saved && !restored) setError('Сохранение пробной главы не удалось прочитать. Начинаем новую главу.');
    }).catch(() => { if (live) setError('Не удалось открыть главу. Обновите страницу.'); });
    return () => { live = false; };
  }, []);
  function commit() {
    if (!chapter || !selected) return;
    try {
      const next = decideChapter(chapter, selected);
      setChapter(next); setSelected(null); setReport(!!next.report); setError('');
      try { localStorage.setItem(CHAPTER_SAVE, serializeChapter(next)); } catch { setError('Браузер не сохраняет прогресс. Глава доступна до закрытия страницы.'); }
      top.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Решение не удалось подписать'); }
  }
  async function restart() {
    try {
      const base = await newChapter();
      try { localStorage.removeItem(CHAPTER_SAVE); } catch { /* Session still restarts. */ }
      setChapter(base); setReport(false); setSelected(null); setReset(false); setError('');
      top.current?.scrollIntoView({ behavior: 'instant' });
    } catch { setError('Не удалось начать главу. Обновите страницу.'); }
  }
  if (!chapter) return <main className="chapter"><h1>Суверен</h1><p role="status">{error || 'Секретарь готовит первую папку…'}</p></main>;
  const story = chapterStory(chapter), options = chapterOptions(chapter), choice = options.find(o => o.id === selected);
  const h = chapter.game.world!.health!;
  const season = ['Весна', 'Лето', 'Осень', 'Зима'][chapter.game.turn % 4];
  return <main className="chapter" ref={top}>
    <header className="chapter-header"><Link href="/">СУВЕРЕН</Link><span>Пробная глава · отдельное сохранение</span></header>
    <Scene chapter={chapter} kind="square" />
    <div className="chapter-date">{season} · кварталов прошло: {chapter.game.turn} из 8<button onClick={() => setReset(!reset)}>Начать заново</button></div>
    {reset && <div className="chapter-reset"><p>Сбросить только эту пробную главу?</p><button onClick={restart}>Да, начать новую главу</button><button onClick={() => setReset(false)}>Продолжить текущую</button></div>}
    <aside className="chapter-goal"><small>ВАШ ПРИОРИТЕТ</small><p>{chapter.goal ? GOALS[chapter.goal] : 'Сначала определите, чего хотите добиться'}</p><div>Больницы: {h.progress}% ставок · {h.approach === 'rotation' ? 'временные переводы' : 'постоянный набор'}</div>{chapter.promise && <div>Публичное обещание: сохранить ≥{chapter.promiseProgress}% к концу второго года</div>}</aside>
    <div className="chapter-resources">{(['economy', 'politicalCapital', 'internalLegitimacy', 'personalResource'] as const).map(k => <details key={k}><summary><span>{RESOURCE_NAMES[k]}</span><strong>{chapter.game.resources[k]}</strong></summary><p>{k === 'economy' ? 'Запас экономики и бюджета. Ниже 25 финансирование исполняется хуже.' : k === 'politicalCapital' ? 'Возможность провести свою волю через аппарат и коалицию. Назначения и согласования расходуют этот запас.' : k === 'internalLegitimacy' ? 'Признание права вашей власти управлять. Меняется от исполненной помощи и публичных обещаний.' : 'Ваше время и силы. Личное вмешательство требует этого ресурса.'}</p></details>)}</div>
    <details className="chapter-dossiers"><summary>Люди за этим решением · открыть досье</summary>{(['healthMinister', 'doctor', 'governor'] as const).map(id => { const p = worldPerson(chapter.game, id)!; return <article key={id}><strong>{p.name}</strong><small>{p.role} · {TRAITS[p.trait].label}</small><p>Компетенция {p.competence}/3 · отношение {p.relation > 0 ? '+' : ''}{p.relation}<br />{p.goal}</p></article>; })}</details>
    <section className="chapter-paper" aria-live="polite">
      <Scene chapter={chapter} kind={report ? 'archive' : chapterScene(chapter)} />
      <small>{report ? `Доклад · после квартала ${chapter.game.turn}` : story.source}</small>
      <h1>{report ? 'Что произошло после вашей подписи' : story.title}</h1>
      {(report ? chapter.report.split('\n\n') : story.paragraphs).map((p, i) => <p key={i}>{p}</p>)}
      {report ? <button className="chapter-primary" onClick={() => { setReport(false); top.current?.scrollIntoView({ behavior: 'instant' }); }}>{chapter.stage === 'end' ? 'Посмотреть итог главы' : 'К следующему решению →'}</button>
        : chapter.stage === 'end' ? <div className="chapter-end"><p>Измените руководителя, условия звонка или способ продолжения. Сравнивайте результат и цену, а не только финальный процент.</p><button className="chapter-primary" onClick={() => { setReset(true); top.current?.scrollIntoView({ behavior: 'instant' }); }}>Пройти другим путём</button><Link href="/">Перейти к свободной игре</Link></div>
        : <div className="chapter-options"><h2>{chapter.stage === 'followup' ? 'Ваш ответ на уточнение' : 'Ваше решение'}</h2><p className="chapter-choice-guide">Выберите вариант, затем подтвердите его кнопкой внизу.</p>{options.map(o => <button key={o.id} className={selected === o.id ? 'chosen' : ''} aria-pressed={selected === o.id} disabled={!!o.blocked} onClick={() => setSelected(o.id)}><strong>{o.title}</strong><span>{o.detail}</span>{Object.keys(o.cost).length > 0 && <em>{Object.entries(o.cost).map(([k, v]) => `${RESOURCE_NAMES[k as keyof typeof RESOURCE_NAMES]} ${v}`).join(' · ')}</em>}{o.blocked && <em>{o.blocked}</em>}</button>)}</div>}
    </section>
    {error && <p className="chapter-error" role="alert">{error}</p>}
    {!report && chapter.stage !== 'end' && choice && <footer className="chapter-sign"><span>{choice ? choice.title : 'Выберите вариант — затем подтвердите'}</span><button className="chapter-primary" disabled={!choice} onClick={commit}>{chapter.stage === 'goal' ? 'Выбрать приоритет' : ['press', 'followup', 'call'].includes(chapter.stage) ? 'Ответить' : ['briefing', 'execution'].includes(chapter.stage) ? 'Получить доклад' : 'Подписать'}</button></footer>}
  </main>;
}
