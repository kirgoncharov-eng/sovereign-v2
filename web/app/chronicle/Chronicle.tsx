"use client";

// «Хроника срока» (#298, #302). Между решениями строки идут сами, в темпе чтения; касание — следующая строка сразу.
// Лента стоит, когда нужен ответ: анкета ЦИК, письмо со сроком, предложение правительства, письмо человека, дело.
// Ответы — те же панели и функции, что в папке `/game`; логика игры не меняется. Скрытая вкладка ставит хронику на паузу.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  actOnDossier, actOnLetter, answerStory, candidacyLines, convene, hire, signInitiative, dateLabel, electionLines, fillForm, firstStep, memoir, newTerm, nextCase,
  openLetter, openingLines, programOf, quarterLines, renameCandidate, secretaryLine, signBudget, signCall, signChoice, signPress,
  startFromSeed, takeOffice, termOver, type ChronicleLine, type ChronicleStart, type Step,
} from "@/lib/client/chronicle.ts";
import { EMPTY_PERSONAL, type PersonalMemory } from "@/lib/client/chronicle-personal.ts";
import { contemporaries, type Rival } from "@/lib/client/chronicle-rivals.ts";
import {
  EMPTY_STOPS, dueStops, letterStop, openStops, rememberStop, stillWaiting, storyStops, type Stop, type StopMemory,
} from "@/lib/client/chronicle-stops.ts";
import { governmentBriefs } from "@/lib/client/government-brief.ts";
import { personProfiles } from "@/lib/client/people-text.ts";
import { presidentialMessages } from "@/lib/client/presidential-inbox.ts";
import { MONTHS } from "@/lib/game/calendar.ts";
import { track } from "@/lib/client/analytics.ts";
import { BIOGRAPHIES, CRISIS_THRESHOLD, IDEOLOGIES, LIMITS } from "@/lib/game/data.ts";
import { promiseDef } from "@/lib/game/promises.ts";
import { debate } from "@/lib/game/forecasts.ts";
import { hasPresidentialCouncil, isPresidentialDiscussion } from "@/lib/game/presidential-story.ts";
import { hasInvestigationDebate } from "@/lib/content/investigation-debates.ts";
import { PROMISE_PICK } from "@/lib/content/promises.ts";
import {
  CHRONICLE_GAME_KEY, CHRONICLE_SAVE_KEY, chronicleBelongsTo, encodeChronicle, parseChronicle, type ChronicleForm,
} from "@/lib/client/chronicle-save.ts";
import type { Choice, DifficultyId, GameEvent, GameState, IdeologyId, ResourceKey } from "@/lib/game/types.ts";
import {
  AdvisorDebate, BudgetPanel, CallPanel, ChoicePreview, CountrySheet, CouncilPanel, HistoricalArtProvider, PeopleSheet, PrologueCutscene, InspectDoc, PactSlips, Portrait, PressPanel,
  PromiseLines, ResourceChips, SpecialHeader, SquareView,
} from "@/app/game/SovereignGame.jsx";
import JournalistCall from "@/app/game/JournalistCall.jsx";
import ResourceInfo from "@/app/game/ResourceInfo.jsx";
import NegotiationCall from "@/app/game/NegotiationCall.jsx";
import { PeopleProvider } from "@/app/game/PeopleText.jsx";
import { IncomingLetter } from "@/app/game/QuarterInbox.jsx";
import GovernmentPanel from "@/app/game/GovernmentPanel.jsx";
import Letters from "@/app/game/Letters.jsx";
import StaffPanel from "@/app/game/StaffPanel.jsx";
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

// Полные названия опор — для остановки «Опоры у порога»; в шапке они сокращены.
const PILLAR: Record<ResourceKey, string> = {
  politicalCapital: "Влияние", economy: "Экономика", military: "Силовики", externalReputation: "Репутация",
  internalLegitimacy: "Легитимность", personalResource: "Личный ресурс",
};

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

/** Хроника внутри игры (#302, этап 4): новая партия 1978 года с титула или продолжение сохранённой. */
export interface ChronicleEntry {
  seed: number;
  diff: DifficultyId;
  /** Продолжение: состояние из общего сохранения — снимок ленты должен принадлежать именно этой партии. */
  resume?: GameState;
  analyticsRun?: GameState["analyticsRun"];
}

interface ChronicleProps {
  entry?: ChronicleEntry;
  /** Состояние партии для общего сохранения игры: «Продолжить» на титуле. */
  onState?: (state: GameState) => void;
  /** Власть кончилась: итоги, архив, достижения и «поделиться» — общий экран итогов игры. */
  onFinish?: (state: GameState) => void;
  onMenu?: () => void;
  /** Сохранение хроники не читается — партия продолжается на столе `/game`, а не теряется. */
  onFallback?: () => void;
}

// Время до первого решения — те же корзины, что в `/game`.
const firstBucket = (sec: number) => sec < 30 ? "до 30 с" : sec < 60 ? "30-60 с" : sec < 120 ? "1-2 мин" : sec < 300 ? "2-5 мин" : "больше 5 мин";

export default function Chronicle({ entry, onState, onFinish, onMenu, onFallback }: ChronicleProps = {}) {
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
  // Справка из шапки: окно опоры, «Страна» или «Люди». Пока она открыта, лента стоит.
  const [sheet, setSheet] = useState<ResourceKey | "country" | "people" | null>(null);
  // Пролог игры — утро вступления в должность: после победы на выборах, перед речью. Пока он идёт, лента стоит.
  const [inauguration, setInauguration] = useState<GameState | null>(null);
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
  const deskRef = useRef<HTMLElement>(null);
  const bar = useRef<HTMLElement>(null);
  const following = useRef(true);
  const speedRef = useRef<Speed>("calm");
  useEffect(() => { speedRef.current = speed; }, [speed]);
  // Хроника внутри игры шлёт те же события аналитики, что `/game`; отдельная страница прототипа — нет.
  const embedded = !!entry;
  // Снимок ленты: у хроники внутри игры свой ключ, у страницы-прототипа — свой.
  const saveKey = embedded ? CHRONICLE_GAME_KEY : CHRONICLE_SAVE_KEY;
  const firstCaseAt = useRef(0);
  const started = useRef(entry);
  useEffect(() => { if (game && onState) onState(game); }, [game, onState]);

  // Строки встают в очередь; на «Сразу» — сразу в хронику.
  const enqueue = useCallback((lines: ChronicleLine[]) => {
    if (!lines.length) return;
    if (speedRef.current === "all") {
      if (lines.some(line => line.kind === "ledger") && pendingResources.current) setVisibleResources(pendingResources.current);
      setShown(rest => [...rest, ...lines]);
    } else setQueue(rest => [...rest, ...lines]);
  }, []);

  // Старт: зерно даёт готовые ответы анкеты; игрок меняет их в анкете ЦИК.
  // Один раз на экран: повторный запуск эффекта (строгий режим React) не должен начинать срок второй раз.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      let restored = null;
      try {
        const raw = localStorage.getItem(saveKey);
        restored = parseChronicle(raw);
        if (raw && !restored) { setSaveBlocked(true); setStorageAvailable(false); }
      } catch { setStorageAvailable(false); }
      const requestedSeed = params.get("seed");
      const requestedDiff = params.get("diff");
      const from = started.current;
      // Внутри игры: новая партия с титула не подхватывает старую хронику. Продолжение берёт снимок, только если он
      // той же партии; иначе чужая лента не открывается и не перезаписывает сохранение — решает onFallback.
      if (from?.resume && (!restored || !chronicleBelongsTo(restored, from.resume))) { onFallback?.(); return; }
      const restoring = from ? !!from.resume : !!restored && (!requestedSeed || Number(requestedSeed) === restored.start.seed)
        && (!requestedDiff || requestedDiff === restored.start.diff);
      if (restored && restoring) {
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
      const begin = from ? startFromSeed(from.seed, from.diff) : readStart();
      const fresh = await newTerm(begin);
      const candidate = from?.analyticsRun ? { ...fresh, analyticsRun: from.analyticsRun } : fresh;
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
    // Старт один раз: вход из игры не меняется, а onFallback — обработчик экрана, а не повод начать заново.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enqueue]);

  useEffect(() => {
    if (!ready || busy || saveBlocked || !start || !game || !visibleResources) return;
    let cancelled = false;
    const data = encodeChronicle({
      start, game, shown, queue, step, picks, form, stop, stops, memory: memory.current, visibleResources, page, rivals, over,
    });
    Promise.resolve().then(() => {
      if (cancelled) return;
      try { localStorage.setItem(saveKey, data); setStorageAvailable(true); }
      catch { setStorageAvailable(false); }
    });
    return () => { cancelled = true; };
  }, [ready, busy, saveBlocked, saveKey, start, game, shown, queue, step, picks, form, stop, stops, visibleResources, page, rivals, over]);

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
    if (!queue.length || paused || hidden || sheet || inauguration || speed === "all") return;
    // Первая строка хроники — почти сразу: пустой лист с точками на первом экране не должен ждать паузы на чтение.
    const timer = setTimeout(revealNext, shown.length ? delayFor(queue[0], speed) : 300);
    return () => clearTimeout(timer);
  }, [queue, paused, hidden, sheet, inauguration, speed, revealNext, shown.length]);

  const deciding = !queue.length && !busy && !over && !!(step || stop || form);
  // Что сейчас ждёт ответа: новое дело, обращение, письмо внутри него или шаг анкеты.
  const decision = !deciding ? null : form ? `form:${form.field}` : stop ? `stop:${stop.key}:${stop.token}:${view ?? ""}`
    : step ? `case:${game?.turn}` : null;
  const shownDecision = useRef<string | null>(null);
  // Новое дело или обращение всегда открываем с заголовка, даже если прежнее дочитывали вниз;
  // строки хроники — следуя за последней, только если игрок сам не прокрутил ленту назад.
  useEffect(() => {
    if (decision && decision !== shownDecision.current) {
      shownDecision.current = decision;
      const section = () => (form || stop ? caseRef : deskRef).current;
      section()?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Шапка могла вырасти во время прокрутки (появилась «Ждут ответа»), а текст над делом — перестроиться, когда
      // догрузились шрифты (после «Продолжить» с перезагрузкой): заголовок не должен остаться под шапкой.
      let cancelled = false;
      const realign = () => {
        if (cancelled) return;
        const top = section()?.getBoundingClientRect().top, under = bar.current?.getBoundingClientRect().bottom;
        if (top !== undefined && under !== undefined && top < under) section()?.scrollIntoView({ block: "start" });
      };
      const timers = [700, 1600].map(delay => setTimeout(realign, delay));
      document.fonts?.ready.then(realign);
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }
    if (!following.current || deciding) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [shown.length, deciding, decision, form, stop, page, rivals]);

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
    if (!next) {
      if (state.turn === 0 && !firstCaseAt.current) firstCaseAt.current = Date.now();
      setStop(null); setStep(firstStep(state)); setGame(state); return;
    }
    // Если дело уже на столе (обращение открыто из «Ждут ответа»), оно остаётся под обращением, не сбрасываясь.
    const opened = next.message ? openLetter(state, next.message.person, next.message.key) : state;
    setGame(opened);
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
  // Дело под обращением остаётся смонтированным: начатая пресс-конференция или бюджет продолжатся с того же места.
  const openWaiting = (item: Stop) => {
    if (!game || busy) return;
    const opened = item.message ? openLetter(game, item.message.person, item.message.key) : game;
    setGame(opened);
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
      enqueue(electionLines(office));
      setInauguration(office);
      enqueue(openingLines(office));
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
    if (embedded) {
      track("turn", { n: after.turn });
      if (after.turn === 1 && firstCaseAt.current) track("first", { sec: firstBucket((Date.now() - firstCaseAt.current) / 1000) });
    }
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

  // Подпись дела: вариант, собранный экраном дела, — теми же функциями движка, что в `/game`.
  const signCase = async (signing: (state: GameState) => Promise<GameState>) => {
    if (!game || !step || busy) return;
    setBusy(true);
    try { await settle(game, await signing(game)); }
    finally { setBusy(false); }
  };

  // Совет собирается с паузой: если за это время дело сменилось, его предложения не ложатся на новое.
  const onConvene = (proposals: Choice[], discussed: GameEvent) =>
    setGame(current => current && current.currentEvent === discussed ? convene(current, proposals) : current);

  // Из справки — к письму папки: поручения и доклады, программы правительства, письма человека. Нужен стол с делом.
  const openFromSheet = (key: string | undefined) => {
    const item = game?.currentEvent && key ? letterStop(game, key) : null;
    if (!item) return;
    setSheet(null);
    openWaiting(item);
  };
  const canAct = !!game && !busy && !over && !form;

  const event = game?.currentEvent;
  const current = shown.at(-1)?.date;
  const waiting = game && event && !form && !over ? openStops(game) : [];

  return (
    <HistoricalArtProvider state={game}>
    <PeopleProvider gs={game} Portrait={Portrait}>
    {inauguration && <PrologueCutscene state={inauguration} onComplete={() => setInauguration(null)} />}
    {/* Таймер ответа на пресс-конференции стоит, пока поверх дела открыта справка, список «Ждут ответа» или пауза:
        игрок не теряет вопрос, пока смотрит страну или людей. */}
    <main className={`${styles.desk}${sheet || waitingOpen || paused ? ` ${styles.timersPaused}` : ""}`}>
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
          {/* data-res — как у опор в шапке `/game`: окно опоры не закрывается касанием по самой опоре, его закрывает переключатель. */}
          {HUD.map(h => <button key={h.key} data-res={h.key} aria-expanded={sheet === h.key} disabled={!game || !!form}
            onClick={() => setSheet(open => open === h.key ? null : h.key)}><small>{h.label}</small>{visibleResources[h.key]}</button>)}
        </div>}
        {game && !form && <div className={styles.sheets} role="group" aria-label="Справка">
          <button aria-expanded={sheet === "country"} onClick={() => setSheet(open => open === "country" ? null : "country")}>Страна</button>
          <button aria-expanded={sheet === "people"} onClick={() => setSheet(open => open === "people" ? null : "people")}>Люди</button>
          {waiting.length > 0 && <button className={styles.waitingButton} aria-expanded={waitingOpen} onClick={() => setWaitingOpen(open => !open)}
            disabled={busy}>Ждут ответа · {waiting.length}</button>}
        </div>}
        {game && sheet && sheet !== "country" && sheet !== "people" && <ResourceInfo key={sheet} gs={game} kind={sheet} canAct={canAct}
          onClose={() => setSheet(null)} onInitiative={(id: string) => commit(signInitiative(game, id))}
          onWorldAction={(id: string) => commit(actOnLetter(game, id))} />}
        {waiting.length > 0 && waitingOpen && <div className={styles.waiting}>
          <ul>{waiting.map(item => <li key={item.key}>
            <button onClick={() => openWaiting(item)} aria-current={stop?.key === item.key || undefined}>
              <small>{senderOf(game!, item)}{item.deadline !== undefined ? ` · ответ до конца квартала ${item.deadline}` : ""}</small>
              {item.title}
            </button>
          </li>)}</ul>
        </div>}
      </header>

      {game && (sheet === "country" || sheet === "people") && <aside className={styles.sheet} aria-label={sheet === "country" ? "Страна" : "Люди"}>
        <div className={`sv-paper ${styles.sheetPaper}`}>
          <div className={styles.sheetHead}>
            <strong>{sheet === "country" ? "Страна" : "Люди"}</strong>
            <button onClick={() => setSheet(null)} aria-label="Закрыть справку и вернуться к ленте">×</button>
          </div>
          {sheet === "country"
            ? <CountrySheet gs={game} onGovernment={() => openFromSheet(presidentialMessages(game).find(message => message.action === "government")?.key)}
              onReports={() => openFromSheet("energy")} />
            : <PeopleSheet gs={game}
              onInbox={(id: string) => id === "people" ? (setSheet(null), setWaitingOpen(true))
                : openFromSheet(presidentialMessages(game).find(message => message.person === id)?.key)}
              onDossier={(id: string, action: "collect" | "press") => { if (!canAct) throw new Error("Дождитесь завершения текущего решения"); commit(actOnDossier(game, id, action)); }}
              onHire={(id: string) => { if (!canAct) throw new Error("Дождитесь завершения текущего решения"); commit(hire(game, id)); }} />}
        </div>
      </aside>}

      <article className={styles.paper} aria-live="polite" onClick={() => { if (queue.length) revealNext(); }}>
        <div className={styles.masthead}>
          <h1>Хроника срока</h1>
          <p>Неманская республика{start && !embedded ? ` · зерно ${start.seed}` : ""}</p>
          {onMenu && <button className={styles.menu} onClick={e => { e.stopPropagation(); onMenu(); }}>Меню игры</button>}
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
            onStory={(story, reply) => commit(answerStory(game, story, reply))} onHire={id => commit(hire(game, id))}
            onPillar={key => setSheet(key)} onDone={finishStop} />
          <div className={styles.options}>
            <button disabled={busy} onClick={finishStop}>
              <strong>{stillWaiting(game, stop) ? "Отложить" : "Дальше"}</strong>
              {stillWaiting(game, stop) && <span>{silenceNote(game, stop)}</span>}
            </button>
          </div>
        </section>}

        {/* Дело остаётся смонтированным, пока открыто обращение: начатая пресс-конференция или бюджет не сбрасываются. */}
        {step && event && game && <section ref={deskRef} className={styles.case} aria-label="Дело на столе" hidden={!deciding || !!stop}
          onClick={e => e.stopPropagation()}>
          <div className={styles.caseHead}>На столе · {event.source}</div>
          <h2>{event.title}</h2>
          {event.description.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
          <CaseDesk key={`${game.turn}:${event.title}`} game={game} busy={busy} onSign={signCase} onConvene={onConvene} />
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
          {/* Внутри игры итоги, архив, достижения и «поделиться» — на общем экране итогов. */}
          {onFinish && game ? <div className={styles.again}>
            <button onClick={() => onFinish(game)}>Подвести итоги</button>
          </div> : <div className={styles.again}>
            <a href={`?diff=${start?.diff ?? "debut"}`} onClick={() => { try { localStorage.removeItem(CHRONICLE_SAVE_KEY); } catch {} }}>Прожить другой срок</a>
            <a href={`?seed=${start?.seed}&diff=${start?.diff ?? "debut"}`}
              onClick={() => { try { localStorage.removeItem(CHRONICLE_SAVE_KEY); } catch {} }}>Тот же январь, другие решения</a>
          </div>}
        </section>}
        <div ref={bottom} />
      </article>
    </main>
    </PeopleProvider>
    </HistoricalArtProvider>
  );
}

const senderOf = (game: GameState, stop: Stop) => stop.kind === "story" ? stop.title : stop.kind === "staff" ? "Отдел кадров"
  : stop.kind === "initiative" ? "Аппарат президента"
  : personProfiles(game).find(person => person.id === stop.person)?.name ?? "Канцелярия";

// Цена молчания — та, что уже назначил движок: срок ответа или то, что без ответа работа не начнётся.
function silenceNote(game: GameState, stop: Stop) {
  if (stop.kind === "story") return "Молчание тоже ответ: со следующим делом письмо уйдёт в архив.";
  if (stop.deadline !== undefined) {
    const left = stop.deadline - game.turn;
    return left <= 1 ? "Это последний квартал для ответа." : `Ответ нужен до конца квартала ${stop.deadline}; лента напомнит в последний квартал.`;
  }
  if (stop.kind === "proposal") return "Без запуска программа не начнётся; лента вернётся к ней, когда опора окажется у порога.";
  if (stop.kind === "staff") return "Кресла остаются за прежними людьми; резерв до конца года открыт в разделе «Люди».";
  if (stop.kind === "initiative") return "Опора останется у порога. Меру можно подписать позже — в окне опоры в шапке.";
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
function StopBody({ game, stop, view, onView, onAct, onStory, onHire, onPillar, onDone }: {
  game: GameState; stop: Stop; view: string | null; onView: (key: string | null) => void; onAct: (id: string) => void;
  onStory: (story: string, reply: string) => void; onHire: (id: string) => void; onPillar: (key: ResourceKey) => void; onDone: () => void;
}) {
  // Опоры у порога (#302, этап 3): та же мера, что в окне опоры `/game`, — окно открывается из остановки.
  if (stop.kind === "initiative") return <div className="sv-paper sv-incoming-project">
    <h2>{stop.title}</h2>
    <p>Ниже {CRISIS_THRESHOLD} опора может обернуться кризисом, на {LIMITS.endResource} и ниже власть падает.
      Для этих опор сейчас есть мера. Одно личное распоряжение за квартал — вместе с поручениями стола.</p>
    <div className={styles.choices}>
      {(stop.resources ?? []).map(key => <button key={key} onClick={() => onPillar(key)}>
        <strong>{PILLAR[key]} · {game.resources[key]}</strong><span>Что можно поручить →</span>
      </button>)}
    </div>
  </div>;
  if (stop.kind === "story") return <Letters letters={[stop.letter]} answers={game.storyReplies} onReply={onStory} Chips={ResourceChips} open />;
  if (stop.kind === "staff") return <div className="sv-paper sv-incoming-project"><StaffPanel gs={game} onHire={onHire} /></div>;
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

type Signing = (state: GameState) => Promise<GameState>;

// Дело на столе — те же части, что резолюция в `/game`: цена варианта, спор советников, совет, документ на проверку,
// экраны бюджета, звонка, переговоров и пресс-конференции. Вариант выбирают касанием, подписывают отдельной кнопкой.
function CaseDesk({ game, busy, onSign, onConvene }: {
  game: GameState; busy: boolean; onSign: (signing: Signing) => void; onConvene: (proposals: Choice[], discussed: GameEvent) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const event = game.currentEvent!;
  const refuse = (state: GameState) => signChoice(state, event.choices[1].id);
  const promises = (choice: Choice) => <PromiseLines gs={game} c={choice} />;
  let body;
  if (event.budget) body = <BudgetPanel gs={game} stamping={null} onSkip={() => onSign(refuse)}
    onFinish={(alloc: Record<string, number>, debt: boolean) => onSign(state => signBudget(state, alloc, debt))} />;
  else if (event.call?.negotiation === "journalist") body = <JournalistCall gs={game} stamping={null} renderPromises={promises} Portrait={Portrait}
    onFinish={(choice: Choice) => onSign(state => signChoice(state, choice.id))} />;
  else if (event.call?.negotiation) body = <NegotiationCall gs={game} stamping={null} renderPromises={promises} Portrait={Portrait}
    onFinish={(choice: Choice) => onSign(state => signChoice(state, choice.id))} />;
  else if (event.call) body = <CallPanel gs={game} call={event.call} seed={game.seed} stamping={null} onHang={() => onSign(refuse)}
    onFinish={(approach: Parameters<typeof signCall>[1], ending: Parameters<typeof signCall>[2]) => onSign(state => signCall(state, approach, ending))} />;
  else if (event.press) body = <PressPanel gs={game} press={event.press} stamping={null} onSkip={() => onSign(refuse)}
    onFinish={(picks: number[]) => onSign(state => signPress(state, picks))} />;
  else {
    const takes = debate(game);
    const councilOnly = hasPresidentialCouncil(game) || hasInvestigationDebate(game);
    const optProps = (choice: Choice, n: number) => ({
      id: `opt-${n}`, className: `sv-opt sv-choice-row${armed === choice.id ? " is-armed" : ""}`, "data-armed": armed === choice.id || undefined,
      "aria-pressed": armed === choice.id, disabled: busy, onClick: () => setArmed(choice.id),
    });
    const chosen = armed ? [...event.choices, ...(event.council ?? [])].find(choice => choice.id === armed) : null;
    body = <>
      {!councilOnly && !isPresidentialDiscussion(game) && <AdvisorDebate gs={game} takes={takes} />}
      <div className={styles.resolution}>
        {(councilOnly ? [] : event.choices).map((choice, i) => <button key={choice.id} {...optProps(choice, i + 1)}>
          <ChoicePreview gs={game} c={choice} debated={!!takes} />
        </button>)}
      </div>
      <CouncilPanel gs={game} stamping={null} debated={!!takes} onConvened={onConvene}
        optProps={(choice: Choice, index: number) => optProps(choice, councilOnly ? index + 1 : event.choices.length + index + 1)} />
      {chosen && <div className={styles.sign}>
        <button disabled={busy} onClick={() => onSign(state => signChoice(state, chosen.id))}><strong>Подписать</strong><span>{chosen.text}</span></button>
        <button disabled={busy} onClick={() => setArmed(null)}>Отменить выбор</button>
      </div>}
    </>;
  }
  return <div className={`sv-paper ${styles.deskPaper}`}>
    <PactSlips gs={game} />
    {event.special && <SpecialHeader gs={game} event={event} />}
    {event.doc && <InspectDoc doc={event.doc} />}
    {body}
  </div>;
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
