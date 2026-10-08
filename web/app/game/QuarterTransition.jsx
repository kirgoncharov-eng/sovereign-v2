"use client";
import { useEffect, useRef } from 'react';
import { drawQuarter } from '@/lib/client/quarter-pixels.ts';

export default function QuarterTransition({ scene, onDone }) {
  const canvas = useRef(null), skip = useRef(null);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) { onDone(); return; }
    const started = performance.now(), ctx = canvas.current.getContext('2d');
    const draw = () => { if (!document.hidden) drawQuarter(ctx, 240, 92, scene, performance.now() - started); };
    draw(); skip.current?.focus({preventScroll:true});
    const frames = setInterval(draw, 120), end = setTimeout(onDone, scene.duration);
    const changed = () => { if (motion.matches) onDone(); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); onDone(); } };
    motion.addEventListener('change', changed); window.addEventListener('keydown', key);
    return () => { clearInterval(frames); clearTimeout(end); motion.removeEventListener('change', changed); window.removeEventListener('keydown', key); };
  }, [scene, onDone]);
  return <section className="sv-quarter" data-quarter-scene={scene.kind} aria-label="Между кварталами">
    <div className="sv-quarter-card">
      <div className="sv-quarter-date">{scene.from} → {scene.to}</div>
      <h2>{scene.title}</h2>
      <canvas ref={canvas} width={240} height={92} className="sv-px" role="img" aria-label={scene.kind==='hospital'?'Посыльный с документами покидает резиденцию. У районной больницы продолжается работа.':'Посыльный с документами пересекает площадь. Наступает новый квартал.'}/>
      <p>{scene.detail}</p>
      <div className="sv-quarter-time" aria-hidden="true"><span style={{animationDuration:`${scene.duration}ms`}}/></div>
      <button ref={skip} onClick={onDone}>К итогам решения →</button>
    </div>
  </section>;
}
