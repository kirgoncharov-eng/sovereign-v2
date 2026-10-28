"use client";

// «Хроника срока» (#298). Между решениями строки идут сами, в темпе чтения; касание — следующая строка сразу.
// На решении история стоит без таймера. Скрытая вкладка ставит хронику на паузу.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  callEndingStep, dateLabel, firstStep, memoir, newTerm, nextCase, openingLines, pressStep, quarterLines,
  signCall, signOption, signPress, startFromSeed, termOver, type ChronicleLine, type ChronicleStart, type Step,
} from "@/lib/client/chronicle.ts";
import { EMPTY_PERSONAL, type PersonalMemory } from "@/lib/client/chronicle-personal.ts";
import { contemporaries, type Rival } from "@/lib/client/chronicle-rivals.ts";
import { MONTHS } from "@/lib/game/calendar.ts";
import { CHRONICLE_SAVE_KEY, encodeChronicle, parseChronicle } from "@/lib/client/chronicle-save.ts";
import type { Approach } from "@/lib/content/calls.ts";
import type { DifficultyId, GameState, ResourceKey } from "@/lib/game/types.ts";
import styles from "./chronicle.module.css";

type Speed = "calm" | "quick" | "all";
const SPEEDS: { id: Speed; label: string }[] = [
  { id: "calm", label: "Спокойно" }, { id: "quick", label: "Быстрее" }, { id: "all", label: "Сразу" },
];
// Пауза перед строкой: чем длиннее строка, тем дольше её читают. «Быстрее» — вдвое короче.
const delayFor = (line: ChronicleLine, speed: Speed) =>
  speed === "all" ? 0 : Math.min(7000, 1100 + line.text.length * 30) / (speed === "quick" ? 2 : 1);

const HUD: { key: ResourceKey; label: string }[] = [
  { key: "politicalCapital", label: "Влияние" }, { key: "economy", label: "Экономика" }, { key: "military", label: "Силовики" },
  { key: "externalReputation", label: "Репутация" }, { key: "internalLegitimacy", label: "Легитимн." }, { key: "personalResource", label: "Личный" },
];

const DIFFS: DifficultyId[] = ["debut", "coalition", "crisis", "ruins"];

function readStart(): ChronicleStart {
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get("seed")) || Math.floor(Math.random() * 1_000_000) + 1;
  const diff = DIFFS.find(d => d === params.get("diff")) ?? "debut";
  return startFromSeed(seed, diff);
}

function readSpeed(): Speed {
  try { return (SPEEDS.find(s => s.id === localStorage.getItem("chronicle.speed"))?.id) ?? "calm"; } catch { return "calm"; }
}

type Memoir = Awaited<ReturnType<typeof memoir>>;

export default function Chronicle() {
  const [start, setStart] = useState<ChronicleStart | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [shown, setShown] = useState<ChronicleLine[]>([]);
  const [queue, setQueue] = useState<ChronicleLine[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState<Speed>("calm");
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [page, setPage] = useState<Memoir | null>(null);
  const [rivals, setRivals] = useState<Rival[] | null>(null);
  const [over, setOver] = useState(false);
  const [visibleResources, setVisibleResources] = useState<GameState["resources"] | null>(null);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const memory = useRef<PersonalMemory>(EMPTY_PERSONAL);
  const pendingResources = useRef<GameState["resources"] | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const caseRef = useRef<HTMLElement>(null);
  const following = useRef(true);

  // Старт: биография и взгляды выпадают по зерну; первое дело готовится, пока идут строки начала.
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      let restored = null;
      try {
        const raw = localStorage.getItem(CHRONICLE_SAVE_KEY);
        restored = parseChronicle(raw);
        if (raw && !restored) { setSaveBlocked(true); setStorageAvailable(false); }
      } catch { setStorageAvailable(false); }
      const requestedSeed = params.get("seed");
      const requestedDiff = params.get("diff");
      if (restored && (!requestedSeed || Number(requestedSeed) === restored.start.seed)
        && (!requestedDiff || requestedDiff === restored.start.diff)) {
        setStart(restored.start);
        setGame(restored.game);
        setShown(restored.shown);
        setQueue(restored.queue);
        setStep(restored.step);
        setPicks(restored.picks);
        setVisibleResources(restored.visibleResources);
        pendingResources.current = restored.game.resources;
        setPage(restored.page);
        setRivals(restored.rivals);
        setOver(restored.over);
        memory.current = restored.memory;
        setSpeed(readSpeed());
        setReady(true);
        return;
      }
      const begin = readStart();
      const state = await newTerm(begin);
      const pace = readSpeed();
      setStart(begin);
      setSpeed(pace);
      if (pace === "all") setShown(openingLines(state)); else setQueue(openingLines(state));
      const withCase = await nextCase(state);
      setGame(withCase);
      setVisibleResources(withCase.resources);
      pendingResources.current = withCase.resources;
      setStep(firstStep(withCase));
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready || busy || saveBlocked || !start || !game || !visibleResources) return;
    let cancelled = false;
    const data = encodeChronicle({
      start, game, shown, queue, step, picks, memory: memory.current, visibleResources, page, rivals, over,
    });
    Promise.resolve().then(() => {
      if (cancelled) return;
      try { localStorage.setItem(CHRONICLE_SAVE_KEY, data); setStorageAvailable(true); }
      catch { setStorageAvailable(false); }
    });
    return () => { cancelled = true; };
  }, [ready, busy, saveBlocked, start, game, shown, queue, step, picks, visibleResources, page, rivals, over]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Следим за последней строкой, только если игрок сам не прокрутил хронику назад.
  useEffect(() => {
    const onScroll = () => {
      following.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const revealNext = useCallback(() => {
    if (!queue.length) return;
    if (queue[0].kind === "ledger" && pendingResources.current) setVisibleResources(pendingResources.current);
    setShown(lines => [...lines, queue[0]]);
    setQueue(queue.slice(1));
  }, [queue]);

  useEffect(() => {
    if (!queue.length || paused || hidden || speed === "all") return;
    const timer = setTimeout(revealNext, delayFor(queue[0], speed));
    return () => clearTimeout(timer);
  }, [queue, paused, hidden, speed, revealNext]);

  const deciding = !queue.length && !!step && !busy && !over;
  // Новое дело показываем с заголовка; строки хроники — следуя за последней.
  useEffect(() => {
    if (!following.current) return;
    if (deciding) caseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [shown.length, deciding, page, rivals]);

  const chooseSpeed = (next: Speed) => {
    setSpeed(next);
    setPaused(false);
    if (next === "all" && queue.length) {
      if (queue.some(line => line.kind === "ledger") && pendingResources.current) setVisibleResources(pendingResources.current);
      setShown(lines => [...lines, ...queue]);
      setQueue([]);
    }
    try { localStorage.setItem("chronicle.speed", next); } catch {}
  };

  // Подпись: хроника квартала встаёт в очередь, следующее дело готовится сразу, а показывается, когда строки дочитаны.
  const settle = async (before: GameState, after: GameState) => {
    pendingResources.current = after.resources;
    const quarter = quarterLines(before, after, memory.current);
    memory.current = quarter.memory;
    if (speed === "all") {
      setVisibleResources(after.resources);
      setShown(lines => [...lines, ...quarter.lines]);
    }
    else setQueue(rest => [...rest, ...quarter.lines]);
    setPicks([]);
    following.current = true;
    if (termOver(after)) {
      setGame(after);
      setStep(null);
      setOver(true);
      const ending = await memoir(after);
      // Падение власти — последней строкой хроники, а не только словом в мемуарах.
      if (ending.fall) {
        const fall = ending.fall;
        if (speed === "all") setShown(lines => [...lines, fall]); else setQueue(rest => [...rest, fall]);
      }
      setPage(ending);
      if (start) setRivals(await contemporaries(start));
      return;
    }
    const withCase = await nextCase(after);
    setGame(withCase);
    setStep(firstStep(withCase));
  };

  const answer = async (key: string, index: number) => {
    if (!game || !step || busy) return;
    setBusy(true);
    try {
      if (step.kind === "press") {
        const next = [...picks, index];
        if (next.length < game.currentEvent!.press!.questions.length) {
          setPicks(next);
          setStep(pressStep(game, next));
        } else await settle(game, await signPress(game, next));
      } else if (step.kind === "call-approach") {
        setStep(callEndingStep(game, key as Approach));
      } else if (step.kind === "call-ending") {
        await settle(game, await signCall(game, step.approach, key as "deal" | "refuse" | "later"));
      } else {
        await settle(game, await signOption(game, key));
      }
    } finally {
      setBusy(false);
    }
  };

  const event = game?.currentEvent;
  const current = shown.at(-1)?.date;

  return (
    <main className={styles.desk}>
      <header className={styles.bar}>
        <div className={styles.barTop}>
          <span className={styles.now}>{current ? `${MONTHS[current.month]} ${current.year}` : "1978"}</span>
          <div className={styles.speeds} role="group" aria-label="Темп хроники">
            {SPEEDS.map(s => (
              <button key={s.id} aria-pressed={speed === s.id && !paused} onClick={() => chooseSpeed(s.id)}>{s.label}</button>
            ))}
            <button aria-pressed={paused} aria-label={paused ? "Продолжить" : "Пауза"} onClick={() => setPaused(p => !p)}>{paused ? "▶" : "❚❚"}</button>
          </div>
        </div>
        {visibleResources && <div className={styles.hud} aria-label="Опоры власти">
          {HUD.map(h => <span key={h.key}><small>{h.label}</small>{visibleResources[h.key]}</span>)}
        </div>}
      </header>

      <article className={styles.paper} aria-live="polite" onClick={() => { if (queue.length) revealNext(); }}>
        <div className={styles.masthead}>
          <h1>Хроника срока</h1>
          <p>Неманская республика · {start ? `зерно ${start.seed}` : ""}</p>
          {!storageAvailable && <p>Сохранение недоступно или повреждено: после закрытия страницы срок начнётся заново.</p>}
        </div>
        {shown.map((line, i) => {
          const previous = shown[i - 1];
          const newDay = !previous || previous.date.day !== line.date.day || previous.date.month !== line.date.month;
          const newYear = !previous || previous.date.year !== line.date.year;
          return (
            <div key={line.id} className={styles.entry}>
              {newDay && line.kind !== "ledger" && line.kind !== "signed" && <time className={styles.date}>{dateLabel(line.date, newYear)}</time>}
              <Line line={line} dated={dateLabel(line.date, newYear)} />
            </div>
          );
        })}
        {queue.length > 0 && !paused && <p className={styles.more} aria-hidden="true">· · ·</p>}
        {queue.length > 0 && paused && <p className={styles.more}>Хроника на паузе</p>}

        {deciding && event && <section ref={caseRef} className={styles.case} aria-label="Дело на столе" onClick={e => e.stopPropagation()}>
          <div className={styles.caseHead}>На столе · {event.source}</div>
          <h2>{event.title}</h2>
          {event.description.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
          <Ask step={step!} />
          <div className={styles.options}>
            {step!.options.map((option, i) => (
              <button key={option.key} disabled={busy} onClick={() => answer(option.key, i)}>
                <strong>{option.text}</strong>
                {option.hint && <span>{option.hint}</span>}
              </button>
            ))}
          </div>
        </section>}
        {busy && <p className={styles.more}>Секретарь уносит папку…</p>}

        {page && !queue.length && <section className={styles.memoir} onClick={e => e.stopPropagation()}>
          <div className={styles.caseHead}>Мемуары · {page.years}</div>
          <h2>«{page.title}»</h2>
          <p className={styles.outcome}>{page.outcome}</p>
          <p>{page.verdict}</p>
          <p className={styles.epitaph}>{page.epitaph}</p>
          <h3>Другие жизни того же срока</h3>
          <p className={styles.note}>Та же страна, та же казна, тот же январь 1978-го. Другие руки на тех же папках.</p>
          {!rivals && <p className={styles.more}>Листаем чужие хроники…</p>}
          {rivals?.map(rival => (
            <div key={rival.label} className={styles.rival}>
              <strong>{rival.label}</strong>
              <span>{rival.outcome} · поддержка {rival.support}%</span>
              <span>Начал с решения: «{rival.firstChoice}»</span>
            </div>
          ))}
          <div className={styles.again}>
            <a href={`?diff=${start?.diff ?? "debut"}`} onClick={() => { try { localStorage.removeItem(CHRONICLE_SAVE_KEY); } catch {} }}>Прожить другой срок</a>
            <a href={`?seed=${start?.seed}&diff=${start?.diff ?? "debut"}`}
              onClick={() => { try { localStorage.removeItem(CHRONICLE_SAVE_KEY); } catch {} }}>Тот же январь, другие решения</a>
          </div>
        </section>}
        <div ref={bottom} />
      </article>
    </main>
  );
}

function Ask({ step }: { step: Step }) {
  if (step.kind === "press") return <p className={styles.question}><small>{step.who} · вопрос {step.question + 1} из 3</small>{step.asked}</p>;
  if (step.kind === "call-approach") return <p className={styles.question}><small>На линии</small>{step.demand}</p>;
  if (step.kind === "call-ending") return <p className={styles.question}><small>Ответ</small>{step.reply}</p>;
  return null;
}

function Line({ line, dated }: { line: ChronicleLine; dated: string }) {
  const who = line.who && !line.text.startsWith(line.who) ? line.who : null;
  switch (line.kind) {
    case "signed": return <p className={styles.signed}><small>Подписано · {dated}</small>{line.text}</p>;
    case "fall": return <p className={styles.fall}>{line.text}</p>;
    case "speech": return <blockquote className={styles.speech}>{line.text}<cite>{line.who}</cite></blockquote>;
    case "voice": return <p className={styles.voice}>{line.text}</p>;
    case "paper": return <p className={styles.paperLine}><small>{line.who}</small>{line.text}</p>;
    case "press": return <p className={styles.press}><small>{line.who}</small> {line.text}</p>;
    case "letter": return <p className={styles.letter}><small>Письмо{who ? ` · ${who}` : ""}</small>{line.text}</p>;
    case "echo": return <p className={styles.echo}><small>Отклик прежних решений</small>{line.text}</p>;
    case "personal": return <p className={styles.personal}>{line.text}</p>;
    case "ledger": {
      const [summary, danger] = line.text.split(" Опасно мало: ");
      return <p className={styles.ledger}>{summary}{danger && <strong> Опасно мало: {danger}</strong>}</p>;
    }
    default: return <p className={line.kind === "opening" ? styles.opening : styles.scene}>{line.text}</p>;
  }
}
