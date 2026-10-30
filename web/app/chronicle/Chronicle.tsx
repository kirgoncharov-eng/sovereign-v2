"use client";

// «Хроника срока» (#298, #302). Между решениями строки идут сами, в темпе чтения; касание — следующая строка сразу.
// Лента стоит, когда нужен ответ: анкета ЦИК, письмо со сроком, предложение правительства, письмо человека, дело.
// Ответы — те же панели и функции, что в папке `/game`; логика игры не меняется. Скрытая вкладка ставит хронику на паузу.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actOnLetter, answerStory, callEndingStep, candidacyLines, dateLabel, electionLines, fillForm, firstStep, memoir, newTerm, nextCase,
  openLetter, openingLines, pressStep, programOf, quarterLines, renameCandidate, secretaryLine, signCall, signOption, signPress,
  startFromSeed, takeOffice, termOver, type ChronicleLine, type ChronicleStart, type Step,
} from "@/lib/client/chronicle.ts";
import { EMPTY_PERSONAL, type PersonalMemory } from "@/lib/client/chronicle-personal.ts";
import { contemporaries, type Rival } from "@/lib/client/chronicle-rivals.ts";
import {
  EMPTY_STOPS, dueStops, openStops, rememberStop, stillWaiting, storyStops, type Stop, type StopMemory,
} from "@/lib/client/chronicle-stops.ts";
import { governmentBriefs } from "@/lib/client/government-brief.ts";
import { personProfiles } from "@/lib/client/people-text.ts";
import { MONTHS } from "@/lib/game/calendar.ts";
import { BIOGRAPHIES, IDEOLOGIES } from "@/lib/game/data.ts";
import { promiseDef } from "@/lib/game/promises.ts";
import { PROMISE_PICK } from "@/lib/content/promises.ts";
import { CHRONICLE_SAVE_KEY, encodeChronicle, parseChronicle, type ChronicleForm } from "@/lib/client/chronicle-save.ts";
import type { Approach } from "@/lib/content/calls.ts";
import type { DifficultyId, GameState, IdeologyId, ResourceKey } from "@/lib/game/types.ts";
import { HistoricalArtProvider, Portrait, ResourceChips, SquareView } from "@/app/game/SovereignGame.jsx";
import { PeopleProvider } from "@/app/game/PeopleText.jsx";
import { IncomingLetter } from "@/app/game/QuarterInbox.jsx";
import GovernmentPanel from "@/app/game/GovernmentPanel.jsx";
import Letters from "@/app/game/Letters.jsx";
import { LetterText } from "@/app/game/LetterText.jsx";
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

// Анкета ЦИК: те же поля, что на экране вступления `/game`, по одному шагу ленты.
const FORM_FIELDS: ChronicleForm["field"][] = ["name", "bio", "ideo", "program"];
const FORM_TITLE: Record<ChronicleForm["field"], string> = {
  name: "Фамилия и имя кандидата", bio: "Род занятий до выдвижения", ideo: "Политические взгляды",
  program: `Предвыборная программа: ${PROMISE_PICK} обещания`,
};

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
  const [form, setForm] = useState<ChronicleForm | null>(null);
  const [stop, setStop] = useState<Stop | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [stops, setStops] = useState<StopMemory>(EMPTY_STOPS);
  const [waitingOpen, setWaitingOpen] = useState(false);
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
  const bar = useRef<HTMLElement>(null);
  const following = useRef(true);
  const speedRef = useRef<Speed>("calm");
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Строки встают в очередь; на «Сразу» — сразу в хронику.
  const enqueue = useCallback((lines: ChronicleLine[]) => {
    if (!lines.length) return;
    if (speedRef.current === "all") {
      if (lines.some(line => line.kind === "ledger") && pendingResources.current) setVisibleResources(pendingResources.current);
      setShown(rest => [...rest, ...lines]);
    } else setQueue(rest => [...rest, ...lines]);
  }, []);

  // Старт: зерно даёт готовые ответы анкеты; игрок меняет их в анкете ЦИК.
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
        setForm(restored.form);
        setStop(restored.stop);
        setStops(restored.stops);
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
      const candidate = await newTerm(begin);
      speedRef.current = readSpeed();
      setStart(begin);
      setSpeed(speedRef.current);
      setGame(candidate);
      setVisibleResources(candidate.resources);
      pendingResources.current = candidate.resources;
      enqueue(candidacyLines(candidate));
      setForm({ field: "name", nameStep: 1, promises: programOf(candidate).suggested });
      setReady(true);
    })();
  }, [enqueue]);

  useEffect(() => {
    if (!ready || busy || saveBlocked || !start || !game || !visibleResources) return;
    let cancelled = false;
    const data = encodeChronicle({
      start, game, shown, queue, step, picks, form, stop, stops, memory: memory.current, visibleResources, page, rivals, over,
    });
    Promise.resolve().then(() => {
      if (cancelled) return;
      try { localStorage.setItem(CHRONICLE_SAVE_KEY, data); setStorageAvailable(true); }
      catch { setStorageAvailable(false); }
    });
    return () => { cancelled = true; };
  }, [ready, busy, saveBlocked, start, game, shown, queue, step, picks, form, stop, stops, visibleResources, page, rivals, over]);

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

  const deciding = !queue.length && !busy && !over && !!(step || stop || form);
  // Что сейчас ждёт ответа: новое дело, обращение, письмо внутри него или шаг анкеты.
  const decision = !deciding ? null : form ? `form:${form.field}` : stop ? `stop:${stop.key}:${stop.token}:${view ?? ""}`
    : step ? `case:${game?.turn}:${picks.length}` : null;
  const shownDecision = useRef<string | null>(null);
  // Новое дело или обращение всегда открываем с заголовка, даже если прежнее дочитывали вниз;
  // строки хроники — следуя за последней, только если игрок сам не прокрутил ленту назад.
  useEffect(() => {
    if (decision && decision !== shownDecision.current) {
      shownDecision.current = decision;
      caseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Шапка могла вырасти во время прокрутки (появилась «Ждут ответа»): заголовок не должен остаться под ней.
      const settle = setTimeout(() => {
        const top = caseRef.current?.getBoundingClientRect().top, under = bar.current?.getBoundingClientRect().bottom;
        if (top !== undefined && under !== undefined && top < under) caseRef.current?.scrollIntoView({ block: "start" });
      }, 700);
      return () => clearTimeout(settle);
    }
    if (!following.current || deciding) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [shown.length, deciding, decision, page, rivals]);

  // Высота шапки меняется с кнопкой «Ждут ответа» и раскрытым списком: по ней дело встаёт под шапку, а не за неё.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--chronicle-bar", `${Math.ceil(element.getBoundingClientRect().height)}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const chooseSpeed = (next: Speed) => {
    setSpeed(next);
    speedRef.current = next;
    setPaused(false);
    if (next === "all" && queue.length) {
      if (queue.some(line => line.kind === "ledger") && pendingResources.current) setVisibleResources(pendingResources.current);
      setShown(lines => [...lines, ...queue]);
      setQueue([]);
    }
    try { localStorage.setItem("chronicle.speed", next); } catch {}
  };

  // Ответ на обращение меняет опоры сразу, как печать на письме в папке.
  const commit = (next: GameState) => {
    setGame(next);
    pendingResources.current = next.resources;
    setVisibleResources(next.resources);
  };

  // ── Порядок квартала, как в `/game`: письма людей из газеты → новое дело → обращения → дело ──

  // Обращения, пока на столе дело. Секретарь приносит их строкой; нечего приносить — дело.
  const toLetters = (state: GameState, memo: StopMemory) => {
    const [next] = dueStops(state, openStops(state), memo);
    setView(null);
    if (!next) { setStop(null); setStep(firstStep(state)); setGame(state); return; }
    const opened = next.message ? openLetter(state, next.message.person, next.message.key) : state;
    setGame(opened);
    setStep(null);
    setStop(next);
    setStops(rememberStop(opened, next, memo));
  };

  const toCase = async (state: GameState, memo: StopMemory) => {
    const withCase = await nextCase(state);
    if (dueStops(withCase, openStops(withCase), memo).length) {
      const line = secretaryLine(withCase);
      if (line) enqueue([line]);
    }
    toLetters(withCase, memo);
  };

  // После подписи: письма людей из газеты квартала — ответить можно только до следующего дела.
  const toStories = async (state: GameState, memo: StopMemory) => {
    const [story] = dueStops(state, storyStops(state), memo);
    if (story) {
      setGame(state);
      setStep(null);
      setStop(story);
      setStops(rememberStop(state, story, memo));
      return;
    }
    await toCase(state, memo);
  };

  const finishStop = async () => {
    if (!game || !stop || busy) return;
    setBusy(true);
    setWaitingOpen(false);
    try {
      setStop(null);
      setView(null);
      if (stop.kind === "story") await toStories(game, stops);
      else toLetters(game, stops);
    } finally { setBusy(false); }
  };

  // Игрок сам открывает отложенное из «Ждут ответа»: та же остановка, как письмо из папки в `/game`.
  // Начатую пресс-конференцию не прерываем: её ответы ещё не подписаны.
  const openWaiting = (item: Stop) => {
    if (!game || busy || picks.length) return;
    const opened = item.message ? openLetter(game, item.message.person, item.message.key) : game;
    setGame(opened);
    setStep(null);
    setStop(item);
    setView(null);
    setWaitingOpen(false);
    setStops(rememberStop(opened, item, stops));
  };

  const submitForm = async () => {
    if (!game || !form || busy) return;
    const at = FORM_FIELDS.indexOf(form.field);
    if (at < FORM_FIELDS.length - 1) { setForm({ ...form, field: FORM_FIELDS[at + 1] }); return; }
    setBusy(true);
    try {
      const office = takeOffice(game, form.promises);
      setForm(null);
      commit(office);
      enqueue([...electionLines(office), ...openingLines(office)]);
      await toCase(office, stops);
    } finally { setBusy(false); }
  };

  // Подпись: хроника квартала встаёт в очередь; дальше — письма людей, новое дело и обращения, когда строки дочитаны.
  const settle = async (before: GameState, after: GameState) => {
    pendingResources.current = after.resources;
    const quarter = quarterLines(before, after, memory.current);
    memory.current = quarter.memory;
    enqueue(quarter.lines);
    setPicks([]);
    following.current = true;
    if (termOver(after)) {
      setGame(after);
      setStep(null);
      setOver(true);
      const ending = await memoir(after);
      // Падение власти — последней строкой хроники, а не только словом в мемуарах.
      if (ending.fall) enqueue([ending.fall]);
      setPage(ending);
      if (start) setRivals(await contemporaries(start));
      return;
    }
    setStep(null);
    await toStories(after, stops);
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
  const waiting = game && event && !form && !over ? openStops(game) : [];

  return (
    <HistoricalArtProvider state={game}>
    <PeopleProvider gs={game} Portrait={Portrait}>
    <main className={styles.desk}>
      <header ref={bar} className={styles.bar}>
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
        {waiting.length > 0 && <div className={styles.waiting}>
          <button aria-expanded={waitingOpen} onClick={() => setWaitingOpen(open => !open)} disabled={busy}>
            Ждут ответа · {waiting.length}
          </button>
          {waitingOpen && <ul>{waiting.map(item => <li key={item.key}>
            <button onClick={() => openWaiting(item)} aria-current={stop?.key === item.key || undefined}>
              <small>{senderOf(game!, item)}{item.deadline !== undefined ? ` · ответ до конца квартала ${item.deadline}` : ""}</small>
              {item.title}
            </button>
          </li>)}</ul>}
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

        {deciding && form && game && <section ref={caseRef} className={styles.case} aria-label="Анкета кандидата" onClick={e => e.stopPropagation()}>
          <div className={styles.caseHead}>ЦИК Неманской республики · анкета кандидата · {FORM_FIELDS.indexOf(form.field) + 1} из {FORM_FIELDS.length}</div>
          <h2>{FORM_TITLE[form.field]}</h2>
          <CandidateForm game={game} form={form} onGame={commit} onForm={setForm} />
          <div className={styles.options}>
            <button disabled={busy || (form.field === "program" && form.promises.length !== PROMISE_PICK)} onClick={submitForm}>
              <strong>{form.field === "program" ? "Подать документы в ЦИК" : "Дальше"}</strong>
            </button>
          </div>
        </section>}

        {deciding && stop && game && <section ref={caseRef} className={styles.case} aria-label="Ждёт ответа" onClick={e => e.stopPropagation()}>
          <div className={styles.caseHead}>{stillWaiting(game, stop) ? "Ждёт ответа" : "Ответ подписан"} · {senderOf(game, stop)}</div>
          <StopBody game={game} stop={stop} view={view} onView={setView} onAct={id => commit(actOnLetter(game, id))}
            onStory={(story, reply) => commit(answerStory(game, story, reply))} onDone={finishStop} />
          <div className={styles.options}>
            <button disabled={busy} onClick={finishStop}>
              <strong>{stillWaiting(game, stop) ? "Отложить" : "Дальше"}</strong>
              {stillWaiting(game, stop) && <span>{silenceNote(game, stop)}</span>}
            </button>
          </div>
        </section>}

        {deciding && step && event && <section ref={caseRef} className={styles.case} aria-label="Дело на столе" onClick={e => e.stopPropagation()}>
          <div className={styles.caseHead}>На столе · {event.source}</div>
          <h2>{event.title}</h2>
          {event.description.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
          <Ask step={step} />
          <div className={styles.options}>
            {step.options.map((option, i) => (
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
    </PeopleProvider>
    </HistoricalArtProvider>
  );
}

const senderOf = (game: GameState, stop: Stop) => stop.kind === "story" ? stop.title
  : personProfiles(game).find(person => person.id === stop.person)?.name ?? "Канцелярия";

// Цена молчания — та, что уже назначил движок: срок ответа или то, что без ответа работа не начнётся.
function silenceNote(game: GameState, stop: Stop) {
  if (stop.kind === "story") return "Молчание тоже ответ: со следующим делом письмо уйдёт в архив.";
  if (stop.deadline !== undefined) {
    const left = stop.deadline - game.turn;
    return left <= 1 ? "Это последний квартал для ответа." : `Ответ нужен до конца квартала ${stop.deadline}; лента напомнит в последний квартал.`;
  }
  if (stop.kind === "proposal") return "Без запуска программа не начнётся; лента вернётся к ней, когда опора окажется у порога.";
  return "Ответ можно дать позже: обращение остаётся в «Ждут ответа».";
}

function CandidateForm({ game, form, onGame, onForm }: {
  game: GameState; form: ChronicleForm; onGame: (state: GameState) => void; onForm: (form: ChronicleForm) => void;
}) {
  if (form.field === "name") return <>
    <p className={styles.formValue}>{game.leader.name}<small>Партия «{game.leader.party}»</small></p>
    <div className={styles.choices}>
      <button onClick={() => { onGame(renameCandidate(game, form.nameStep)); onForm({ ...form, nameStep: form.nameStep + 1 }); }}>Другое имя</button>
    </div>
  </>;
  if (form.field === "bio") return <div className={styles.choices}>
    {BIOGRAPHIES.map(bio => <button key={bio.id} aria-pressed={game.bio === bio.id} onClick={() => onGame(fillForm(game, { bio: bio.id }))}>
      <strong>{bio.label}</strong><span>{bio.note}</span>
    </button>)}
  </div>;
  if (form.field === "ideo") return <div className={styles.choices}>
    {IDEOLOGIES.map(ideo => <button key={ideo.id} aria-pressed={game.ideo === ideo.id}
      onClick={() => {
        const next = fillForm(game, { ideo: ideo.id as IdeologyId });
        onGame(next);
        onForm({ ...form, promises: programOf(next).suggested });
      }}>
      <strong>{ideo.label}</strong><span>{ideo.desc}</span>
    </button>)}
  </div>;
  const { offered } = programOf(game);
  const toggle = (id: string) => onForm({ ...form, promises: form.promises.includes(id) ? form.promises.filter(other => other !== id)
    : form.promises.length < PROMISE_PICK ? [...form.promises, id] : form.promises });
  return <div className={styles.choices}>
    {offered.map(id => {
      const def = promiseDef(id, game.country);
      if (!def) return null;
      const on = form.promises.includes(id);
      return <button key={id} aria-pressed={on} disabled={!on && form.promises.length >= PROMISE_PICK} onClick={() => toggle(id)}>
        <strong>{def.title}</strong><span>«{def.pitch}»</span>
      </button>;
    })}
  </div>;
}

// Тело остановки — те же панели, что у письма в папке `/game`: поручения, секретарь, спонсор, министр, правительство.
function StopBody({ game, stop, view, onView, onAct, onStory, onDone }: {
  game: GameState; stop: Stop; view: string | null; onView: (key: string | null) => void;
  onAct: (id: string) => void; onStory: (story: string, reply: string) => void; onDone: () => void;
}) {
  if (stop.kind === "story") return <Letters letters={[stop.letter]} answers={game.storyReplies} onReply={onStory} Chips={ResourceChips} open />;
  // Из письма можно перейти к связанному поручению; «к главному делу» — закончить остановку.
  const onOpen = (key: string) => key === "secretary" ? onDone() : onView(key);
  if (stop.key === "government-proposals" && !view) {
    const first = governmentBriefs(game).find(brief => brief.status === "proposed")?.id ?? "energy";
    return <article className="sv-paper sv-incoming-project">
      <h2>{stop.title}</h2>
      <LetterText text={stop.message!.text} />
      <GovernmentPanel gs={game} onAction={onAct} onClose={onDone} initialProject={first}
        onDetails={(id: string) => onView(id === "health" ? "health" : "energy")} />
    </article>;
  }
  return <IncomingLetter gs={game} page={view ?? stop.key} onAction={onAct} onOpen={onOpen} Scene={SquareView} />;
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
    case "report": return <p className={styles.letter}><small>{line.who ?? "Доклад"}</small>{line.text}</p>;
    case "secretary": return <p className={styles.echo}><small>Приёмная · {line.who}</small>{line.text}</p>;
    case "echo": return <p className={styles.echo}><small>Отклик прежних решений</small>{line.text}</p>;
    case "personal": return <p className={styles.personal}>{line.text}</p>;
    case "ledger": {
      const [summary, danger] = line.text.split(" Опасно мало: ");
      return <p className={styles.ledger}>{summary}{danger && <strong> Опасно мало: {danger}</strong>}</p>;
    }
    default: return <p className={line.kind === "opening" ? styles.opening : styles.scene}>{line.text}</p>;
  }
}
