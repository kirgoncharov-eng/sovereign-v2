"use client";
import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, useId } from "react";
import { ACTIONS, APP_VERSION, BIOGRAPHIES, COUNTRIES, ADVISOR_SKILL, ELECTIONS, ELECTION_LABEL, END_TYPES, LIMITS, NON_VOTING_BLOCS, DIFFICULTIES, IDEOLOGIES, difficultyEffects, ideologyEffects, MAX_TURNS, RES_CONFIG, SAVE_VERSION } from "@/lib/game/data.ts";
import { choiceEffects, computePolls, delayedEffects, planTurn, successChance, createInitialState, isSurvival, isFemaleName, endCause, plural, conveneCouncil, resolveTurn, seededRandom, setVerdict, startEvent, warningLevel } from "@/lib/game/engine.ts";
import { approachWorks, budgetChoice, budgetLimit, callChoice, callReply, classicApi, pressChoice } from "@/lib/game/classic.ts";
import { BUDGET_ITEMS, BUDGET_MAX } from "@/lib/content/budget.ts";
import { APPROACHES, CALL_ENDINGS, TRAIT_TIP } from "@/lib/content/calls.ts";
import { BOND_LABEL, PACT_BROKEN, PACT_INCOME, TRAITS, pactIncome as pactIncomeOf, bondOf, breaches, pactIncome, traitOf } from "@/lib/game/people.ts";
import { ARCS } from "@/lib/content/arcs.ts";
import { PROMISE_PICK } from "@/lib/content/promises.ts";
import { initPromises, offeredPromises, promiseDef, promiseGoalText, promiseImpact } from "@/lib/game/promises.ts";
import { monthYear, turnDate } from "@/lib/game/calendar.ts";
import { lawDef } from "@/lib/game/laws.ts";
import { botLink, shareCaption, shareQuery, shareResultOf } from "@/lib/share.ts";
import { INSPECT_TEXT } from "@/lib/content/inspect.ts";
import { ACHIEVEMENTS, ALL_ENDINGS, compactMeta, dailyCase, importMeta, parseMeta, readMetaRaw, recordRun, subscribeMeta, unlockedCountries } from "@/lib/client/meta.ts";

// Весь текст — из библиотеки авторских сценариев, без сети и без модели.
// Ответ готов мгновенно — даём сцене короткую театральную паузу.
const theatrical = (fn, ms) => async (...args) => (await Promise.all([fn(...args), new Promise(r => setTimeout(r, ms))]))[0];
const expressApi = {
  setup: theatrical(classicApi.setup, 600),
  event: theatrical(classicApi.event, 500),
  consequence: theatrical(classicApi.consequence, 1100),
  council: theatrical(classicApi.council, 800),
  ending: theatrical(classicApi.ending, 1500),
};
const game = expressApi;
import { cloudGet, cloudSet, inTelegram, initTelegram, onTelegramReady, setBackButton, setMainButton, telegramShare, tgButtons, requestWriteAccess, tgInitData, telegramStory, canTelegramStory } from "@/lib/client/telegram.ts";
import { track, feedbackEnabled, sendFeedback, isTester, toggleTester, syncSubscription } from "@/lib/client/analytics.ts";
import { fetchBoard, inviteUrl, rememberRef, submitDaily } from "@/lib/client/daily.ts";
import { resultCard } from "@/lib/client/card.ts";
import { runScore } from "@/lib/game/daily.ts";
import { outcomeFx, pageFx, setSound, soundOn, stampFx } from "@/lib/client/fx.ts";
import { PORTRAIT_H, PORTRAIT_W, portraitCanvas } from "@/lib/client/portrait.ts";
import { drawFlagAt, drawSquare } from "@/lib/client/square.ts";
import { drawScene } from "@/lib/client/scenes.ts";
import { SCENE_CAPTION, sceneOf } from "@/lib/content/scene-map.ts";
import { clearSave, parseSave, readSaveRaw, subscribeSave, writeSave } from "@/lib/client/save.ts";

const barColor = v => v >= 60 ? "var(--grn)" : v >= 35 ? "var(--amb)" : "var(--red)";
const relColor = v => v >= 30 ? "var(--grn)" : v > -30 ? "var(--amb)" : "var(--red)";
const signed = v => v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0";

// Цвета — CSS-переменные: на столе и на листе бумаги (.sv-paper) они разные.
const G = Object.fromEntries(["bg","bg2","bg3","bdr","bdr2","gold","gld2","blue","bl2","txt","tx2","tx3","grn","amb","red"].map(k => [k, `var(--${k})`]));
const mono   = "var(--font-ptmono), 'PT Mono', 'Courier New', monospace";
const serif  = "var(--font-serif), 'PT Serif', Georgia, serif";
const narrow = "var(--font-narrow)";
const pixel  = "var(--font-pixel)";

// Значки опор власти в духе Reigns: силуэт заполняется снизу по уровню ресурса.
const RES_SHAPES = {
  politicalCapital: <path d="M2 9.5 12 3l10 6.5zM4 11h3v7H4zm4.5 0h3v7h-3zm4.5 0h3v7h-3zm4.5 0h3v7h-3zM2 19h20v2.5H2z"/>,
  economy: <g><rect x="3" y="17.5" width="14" height="3.5" rx="1.6"/><rect x="5" y="13" width="14" height="3.5" rx="1.6"/><rect x="3.5" y="8.5" width="14" height="3.5" rx="1.6"/><rect x="6" y="4" width="14" height="3.5" rx="1.6"/></g>,
  military: <path d="M12 2 20.5 5v6.2c0 5.2-3.6 9.6-8.5 10.8-4.9-1.2-8.5-5.6-8.5-10.8V5zm0 5.2-1.3 2.9-3.1.3 2.3 2.1-.7 3.1 2.8-1.6 2.8 1.6-.7-3.1 2.3-2.1-3.1-.3z" fillRule="evenodd"/>,
  externalReputation: <path d="M4 2h2.2v20H4zm2.2 1.4c3-1.6 5.4 1.4 8.2 0 2.2-1.1 4-1 6 0v9.4c-2-1-3.8-1.1-6 0-2.8 1.4-5.2-1.6-8.2 0z"/>,
  internalLegitimacy: <g><circle cx="6.5" cy="8.5" r="2.7"/><circle cx="17.5" cy="8.5" r="2.7"/><circle cx="12" cy="6.5" r="3.2"/><path d="M1.5 20.5a5 5.6 0 0 1 10 0zm11 0a5 5.6 0 0 1 10 0z"/><path d="M5.8 21.5a6.2 7.4 0 0 1 12.4 0z"/></g>,
  personalResource: <path d="M7 7a5 5 0 1 1 0 10A5 5 0 0 1 7 7zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm4.6.8H22v2.6h-2v3.2h-2.4v-3.2h-1.4v2.2h-2.4v-2.2h-2.2z" fillRule="evenodd"/>,
};
function ResIcon({ k, value = 100, size = 24, color = "currentColor", dim = "var(--bdr2)" }) {
  const id = useId();
  const shape = RES_SHAPES[k];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display:"block", flexShrink:0 }}>
      <defs><clipPath id={id}><rect x="0" y={24 * (1 - Math.max(0, Math.min(100, value)) / 100)} width="24" height="24"/></clipPath></defs>
      <g fill={dim}>{shape}</g>
      <g fill={color} clipPath={`url(#${id})`}>{shape}</g>
    </svg>
  );
}

// Фото на документ: карандашный портрет, переснятый в низком разрешении
// и отпечатанный пятью тонами с растровой сеткой — как карточки в Papers, Please.
const PHOTO_W = 40, PHOTO_H = 50;
const PHOTO_TONES = [[42, 36, 29], [84, 74, 60], [133, 122, 98], [184, 172, 142], [226, 218, 192]];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const photoCache = new Map();
function photoCanvas(name) {
  let c = photoCache.get(name);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = PHOTO_W; c.height = PHOTO_H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#e2d9c0"; ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(portraitCanvas(name, isFemaleName(name)), 0, 0, PORTRAIT_W, PORTRAIT_H, 0, 0, PHOTO_W, PHOTO_H);
  const img = ctx.getImageData(0, 0, PHOTO_W, PHOTO_H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4, x = p % PHOTO_W, y = Math.floor(p / PHOTO_W);
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    // контраст посильнее: штрихи после уменьшения становятся серыми
    const v = Math.max(0, Math.min(1, (lum - 0.5) * 1.7 + 0.55));
    const t = Math.max(0, Math.min(4, Math.floor(v * 4 + BAYER[(y % 4) * 4 + (x % 4)] / 16)));
    [d[i], d[i + 1], d[i + 2]] = PHOTO_TONES[t];
  }
  ctx.putImageData(img, 0, 0);
  photoCache.set(name, c);
  return c;
}
function Portrait({ name, size = 44, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !name) return;
    c.getContext("2d").drawImage(photoCanvas(name), 0, 0);
  }, [name]);
  return <canvas ref={ref} width={PHOTO_W} height={PHOTO_H} aria-hidden="true" className="sv-px"
    style={{ width:size, height:Math.round(size * 1.25), border:"2px solid #2a241d", flexShrink:0, ...style }}/>;
}
// Кто из известных людей произносит реплику: имя стоит в её начале.
const speakerOf = (gs, text) => [...(gs.keyFigures ?? []), ...(gs.advisors ?? [])].find(p => String(text).includes(p.name));

function Divider() { return <div style={{ height:1, background:G.bdr, margin:"0 0 24px" }}/>; }
function Label({ children }) { return <div style={{ fontFamily:pixel, fontSize:13, letterSpacing:".04em", textTransform:"uppercase", color:G.tx3, marginBottom:10 }}>{children}</div>; }
// Лист бумаги на столе. accent оставлен для совместимости вызовов и не рисуется.
function Card({ children, style, className = "" }) {
  return <div className={`sv-paper ${className}`} style={{ borderRadius:0, padding:"20px 22px", ...style }}>{children}</div>;
}
function PrimaryBtn({ children, onClick, disabled, danger, id }) {
  return (
    <button id={id} onClick={onClick} disabled={disabled}
      onMouseOver={e=>{ if (!disabled) e.currentTarget.style.filter="brightness(1.08)"; }} onMouseOut={e=>{e.currentTarget.style.filter="none";}}
      style={{ background:danger?G.red:G.gold, border:"2px solid rgba(0,0,0,.55)", color:"var(--on-gold)", padding:"11px 28px", borderRadius:0, fontFamily:pixel, fontSize:15, letterSpacing:".04em", textTransform:"uppercase", opacity:disabled?.45:1, boxShadow:"var(--hard)" }}>
      {children}
    </button>
  );
}
// Без точных цифр: стрелка — направление, две стрелки — сильная перемена.
const BIG_DELTA = 6;
const arrows = v => (v > 0 ? "▲" : "▼").repeat(Math.abs(v) >= BIG_DELTA ? 2 : 1);
function IconDelta({ k, value, exact = true }) {
  const pos = value > 0;
  const name = RES_CONFIG.find(r => r.key === k)?.prompt;
  return (
    <span title={exact ? `${name}: ${signed(value)}` : `${name}: ${pos ? "вырастет" : "упадёт"}${Math.abs(value) >= BIG_DELTA ? " сильно" : ""}`} style={{ display:"inline-flex", alignItems:"center", gap:4, fontFamily:narrow, fontSize:16, fontWeight:700, color:pos?G.grn:G.red, whiteSpace:"nowrap" }}>
      <ResIcon k={k} size={17} color={pos?G.grn:G.red}/>{exact ? signed(value) : <span style={{ fontSize:13, letterSpacing:"-.05em" }}>{arrows(value)}</span>}
      <span style={{ position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0 0 0 0)" }}>{SHORT[k]}</span>
    </span>
  );
}
function ResourceChips({ delta, exact = true }) {
  const items = RES_CONFIG.filter(r => delta?.[r.key]);
  if (!items.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px" }}>
      {items.map(r => <IconDelta key={r.key} k={r.key} value={delta[r.key]} exact={exact}/>)}
    </div>
  );
}
function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ marginBottom:10, padding:"12px 16px", borderRadius:0, background:"rgba(184,82,82,0.12)", border:`1px solid ${G.red}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
      <span style={{ fontFamily:narrow, fontSize:15, color:G.red, letterSpacing:".06em" }}>✖ {message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ background:"transparent", border:`1px solid ${G.red}`, color:G.red, padding:"6px 16px", borderRadius:0, fontSize:15, letterSpacing:".05em" }}>
          ПОВТОРИТЬ
        </button>
      )}
    </div>
  );
}

function ResBar({ k, label, val, prev }) {
  const c = barColor(val);
  const delta = prev !== undefined ? val - prev : 0;
  return (
    <div style={{ marginBottom:9 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:7, fontFamily:narrow, fontSize:15, color:G.tx2 }}><ResIcon k={k} size={16} color={G.tx2}/>{label}</span>
        <span style={{ fontFamily:narrow, fontSize:15, color:c, fontWeight:"bold" }}>
          {val}{delta!==0&&<span style={{ color:delta>0?G.grn:G.red, marginLeft:3 }}>{signed(delta)}</span>}
        </span>
      </div>
      <div style={{ height:2, background:G.bdr, borderRadius:0 }}>
        <div style={{ height:"100%", width:`${val}%`, background:c, borderRadius:0, transition:"all .7s ease" }}/>
      </div>
    </div>
  );
}

function RelBar({ label, val, prevVal }) {
  const c = relColor(val);
  const delta = prevVal !== undefined ? val - prevVal : 0;
  const pct = ((val + 100) / 200) * 100;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>{label}</span>
        <span style={{ fontFamily:narrow, fontSize:15, color:c }}>
          {signed(val)}
          {delta !== 0 && <span style={{ color:delta>0?G.grn:G.red, marginLeft:3 }}>{signed(delta)}</span>}
        </span>
      </div>
      <div style={{ height:2, background:G.bdr, borderRadius:0, position:"relative" }}>
        <div style={{ position:"absolute", left:"50%", top:-1, width:1, height:4, background:G.bdr2 }}/>
        <div style={{ height:"100%", width:`${pct}%`, background:c, borderRadius:0, transition:"all .6s ease" }}/>
      </div>
    </div>
  );
}

function nextElection(turn) {
  const t = Object.keys(ELECTIONS).map(Number).find(x => x > turn);
  return t ? { label: ELECTION_LABEL[ELECTIONS[t]], in: t - turn } : null;
}
// Партия делится на четыре главы по пять ходов: у каждой своё название.
const CHAPTERS = ["Первые сто дней", "Накануне выборов", "Второе дыхание", "Развязка"];
const chapterOf = turn => Math.min(3, Math.floor((turn - 1) / 5));
const ROMAN = ["I", "II", "III", "IV"];

// Подпись под резолюцией: «А. Шевчик».
const signature = name => { const [f, ...rest] = String(name).split(" "); return rest.length ? `${f[0]}. ${rest.join(" ")}` : name; };
// Входящий номер документа: стабилен для хода партии, выглядит как настоящий.
const docNumber = gs => `${(gs.seed % 700) + 101 + gs.turn * 13}-с`;
const inTurns = n => n === 1 ? "после этого хода" : `через ${plural(n, "ход", "хода", "ходов")}`;

function PollWidget({ gs }) {
  const [info, setInfo] = useState(false);
  const polls = computePolls(gs.country, gs.factions, gs.resources);
  const prev = gs.prevFactions && gs.prevResources ? computePolls(gs.country, gs.prevFactions, gs.prevResources) : null;
  const next = nextElection(gs.turn);
  const top = Math.max(...polls.parties.map(p => p.share));
  const rows = [
    { id:"me", name:gs.leader.party || "Ваша партия", share:polls.leader, prev:prev?.leader, me:true },
    ...polls.parties.map(p => ({ ...p, prev:prev?.parties.find(x => x.id === p.id)?.share })),
    { id:"und", name:"Не определились", share:polls.undecided, muted:true },
  ];
  const leading = polls.leader > top;
  return (
    <Card style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3 }}>ОПРОС</span>
        <button onClick={()=>setInfo(v=>!v)} aria-expanded={info} title="Как считается рейтинг"
          style={{ background:"transparent", border:`1px solid ${G.bdr}`, color:G.tx3, borderRadius:0, width:18, height:18, fontSize:10, lineHeight:"16px", padding:0 }}>?</button>
      </div>
      {info && (
        <div style={{ fontFamily:serif, fontSize:12, color:G.tx2, lineHeight:1.5, marginBottom:10, padding:"8px 10px", background:G.bg3, borderRadius:0 }}>
          Голосуют группы общества — по своему весу. Группа поддерживает вас тем сильнее, чем лучше её отношение к вам и чем выше легитимность и экономика. Недовольные уходят к партии-конкуренту своего лагеря. Запад и Кремль не голосуют. Рейтинг ≤ {LIMITS.endRating}% — революция.
        </div>
      )}
      {rows.map(r => {
        const d = r.prev !== undefined ? r.share - r.prev : 0;
        const c = r.me ? G.gold : r.muted ? G.tx3 : G.bl2;
        return (
          <div key={r.id} style={{ marginBottom:7 }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:6, marginBottom:2 }}>
              <span style={{ fontFamily:narrow, fontSize:15, color:r.me?G.gld2:G.tx2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.me ? "★ " : ""}{r.name}</span>
              <span style={{ fontFamily:narrow, fontSize:15, color:c, whiteSpace:"nowrap" }}>
                {r.share}%{d !== 0 && <span style={{ color:d>0?G.grn:G.red, marginLeft:3 }}>{signed(d)}</span>}
              </span>
            </div>
            <div style={{ height:r.me?4:2, background:G.bdr, borderRadius:0 }}>
              <div style={{ height:"100%", width:`${r.share}%`, background:c, borderRadius:0, transition:"all .7s ease" }}/>
            </div>
          </div>
        );
      })}
      <div style={{ fontFamily:narrow, fontSize:15, color:leading?G.grn:G.amb, marginTop:8, letterSpacing:".06em" }}>
        {leading ? "▲ ВЫ ЛИДИРУЕТЕ" : "▼ КОНКУРЕНТ ВПЕРЕДИ"}{next ? ` · ${next.label.toLowerCase()} ${inTurns(next.in)}` : ""}
      </div>
    </Card>
  );
}

// Точный расклад знают только советники: вариант от совета показан в цифрах, остальные — стрелками.
function ChoicePreview({ gs, c }) {
  const exact = !!c.advisor;
  const fx = choiceEffects(gs, c);
  const crisis = c.resolvesCrisis && gs.activeCrises.find(x => x.id === c.resolvesCrisis);
  const later = delayedEffects(c);
  return (
    <>
      {c.advisor && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <Portrait name={c.advisor.name} size={30}/>
          <span className="sv-hand" style={{ fontSize:18, lineHeight:1.2 }}>предлагает {c.advisor.name}, {c.advisor.role.toLowerCase()} {stars(c.advisor.skill)}</span>
        </div>
      )}
      <div style={{ fontFamily:serif, fontSize:17, fontWeight:700, lineHeight:1.35, marginBottom:3 }}>{c.text}</div>
      <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginBottom:8 }}>
        {c.deal?.pure ? <i style={{ fontFamily:serif }}>{c.hint}</i> : <>{c.tags.map(t => ACTIONS[t].label).join(" · ")} · <ChanceBadge p={successChance(gs, c)} exact={exact}/> · <i style={{ fontFamily:serif }}>{c.hint}</i></>}
      </div>
      <ResourceChips delta={fx.resources} exact={exact}/>
      {later.length > 0 && !exact && <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:6 }}>⧗ Аукнется позже — как, знают советники</div>}
      {later.length > 0 && exact && (
        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:6, lineHeight:1.45 }}>
          Позже: {later.map((d, k) => {
            const fx = RES_CONFIG.filter(r => d.res[r.key]).map(r => `${SHORT[r.key].toLowerCase()} ${signed(d.res[r.key])}`).join(", ");
            const good = Object.values(d.res).reduce((a, b) => a + (b ?? 0), 0) >= 0;
            return <span key={`${d.label}${k}`} style={{ color:good ? G.grn : G.red }}>{k ? "; " : ""}{d.label} ({fx}) через {plural(d.turns, "ход", "хода", "ходов")}</span>;
          })}
        </div>
      )}
      {crisis && <div style={{ fontFamily:narrow, fontSize:15, color:G.grn, marginTop:6 }}>Закроет кризис «{crisis.title}», если исполнят</div>}
      <DealLines gs={gs} c={c} exact={exact}/>
      <PromiseLines gs={gs} c={c}/>
      <LawLines gs={gs} c={c}/>
    </>
  );
}

// Законопроект: что закон будет делать каждый ход, если пройдёт, — или что исчезнет с его отменой.
function LawEffects({ def }) {
  const fac = Object.entries(def.drift ?? {}).filter(([, d]) => d < 0).map(([b]) => b);
  return (
    <span style={{ display:"inline-flex", flexWrap:"wrap", gap:"2px 12px", alignItems:"center" }}>
      <ResourceChips delta={def.perTurn} exact={false}/>
      {fac.length > 0 && <span style={{ color:G.red }}>недовольны: {fac.map(b => BLOC_LABEL[b] ?? b).join(", ")}</span>}
    </span>
  );
}
const BLOC_LABEL = { security:"силовики", business:"бизнес", church:"церковь", liberal:"либералы", west:"Запад", russia:"Москва", nationalist:"националисты", regional:"регионы", ruling:"правящая партия" };
function LawLines({ gs, c }) {
  const def = c.law && lawDef(c.law.id);
  if (!def) return null;
  const inForce = gs.laws?.some(l => l.id === def.id);
  return (
    <div style={{ fontFamily:narrow, fontSize:15, marginTop:6, lineHeight:1.45, color:G.tx2 }}>
      {c.law.act === "enact"
        ? <><div>⚖ Если парламент примет — закон «{def.title}» будет действовать каждый ход:</div><LawEffects def={def}/></>
        : <div>⚖ Отменит закон «{def.title}»{inForce ? " — его действие прекратится" : ""}</div>}
    </div>
  );
}

// Свод законов в досье и на экране итогов.
function LawsCard({ gs, final = false, style }) {
  if (!gs.laws?.length) return null;
  const start = COUNTRIES[gs.country].startYear;
  return (
    <Card style={{ marginTop:10, ...style }}>
      <Label>{"СВОД ЗАКОНОВ"}</Label>
      {gs.laws.map(l => {
        const def = lawDef(l.id);
        if (!def) return null;
        return (
          <div key={l.id} title={def.short} style={{ padding:"6px 0", borderTop:`1px dashed ${G.bdr}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, fontFamily:narrow, fontSize:15 }}>
              <span style={{ color:G.txt }}>«{def.title}»</span>
              <span style={{ color:G.tx3, whiteSpace:"nowrap" }}>с {monthYear(turnDate(gs.seed, start, Math.max(0, l.since - 1)))}</span>
            </div>
            {!final && <div style={{ fontFamily:narrow, fontSize:14, marginTop:2 }}><LawEffects def={def}/></div>}
            {final && <div style={{ fontFamily:serif, fontSize:13, color:G.tx3 }}>{def.short}</div>}
          </div>
        );
      })}
    </Card>
  );
}

// Как решение скажется на обещаниях: шаг к исполнению или прямое нарушение.
function PromiseLines({ gs, c }) {
  const { advances, breaks } = promiseImpact(gs.promises, c.deal?.pure ? [] : c.tags);
  if (!advances.length && !breaks.length) return null;
  return (
    <div style={{ fontFamily:narrow, fontSize:15, marginTop:6, lineHeight:1.45 }}>
      {advances.map(t => <div key={t} style={{ color:G.grn }}>✔ Шаг к обещанию «{t}», если исполнят</div>)}
      {breaks.map(t => <div key={t} style={{ color:G.red }}>✖ Нарушит обещание «{t}»</div>)}
    </div>
  );
}

// Что сделка меняет в людях и союзах — и какие договоры решение нарушит.
function DealLines({ gs, c, exact = true }) {
  const fac = id => gs.factions.find(f => f.id === id)?.name ?? id;
  const sg = v => (exact ? signed(v) : arrows(v));
  const lines = [];
  for (const p of breaches(gs.pacts, c.tags)) {
    lines.push([G.red, `Нарушит договор с «${fac(p.faction)}»: они ${sg(PACT_BROKEN.faction)}, остальные ${sg(PACT_BROKEN.others)}`]);
  }
  const d = c.deal;
  if (d) {
    const fig = gs.keyFigures.find(f => f.id === d.figure);
    if (d.pact) {
      const bloc = gs.factions.find(f => f.id === d.pact.faction)?.bloc;
      const res = RES_CONFIG.find(r => r.key === PACT_INCOME[bloc]);
      lines.push([G.grn, `Договор на ${plural(d.pact.turns, "ход", "хода", "ходов")}: ${SHORT[res.key].toLowerCase()} ${exact ? `+${pactIncome(d.pact)}` : "растёт"} каждый ход, их голоса на выборах`]);
      lines.push([G.tx3, `Нельзя: ${d.pact.ban.map(t => `«${ACTIONS[t].label}»`).join(", ")}`]);
      if (d.pact.against) lines.push([G.red, `«${fac(d.pact.against)}» станут врагами`]);
    }
    if (fig && d.replace) lines.push([G.tx2, `${fig.name} уходит с поста`]);
    else if (fig && d.figureRel) lines.push([d.figureRel > 0 ? G.grn : G.red, `${fig.name}: лично ${sg(d.figureRel)}`]);
    for (const [id, v] of Object.entries(d.factionRel ?? {})) lines.push([v > 0 ? G.grn : G.red, `Лагерь «${fac(id)}»: ${sg(v)}`]);
    if (d.othersRel) lines.push([G.red, `Те, кто вам верит: ${sg(d.othersRel)}`]);
  }
  if (!lines.length) return null;
  return (
    <div style={{ fontFamily:narrow, fontSize:15, marginTop:6, lineHeight:1.45 }}>
      {lines.map(([color, t], i) => <div key={i} style={{ color }}>{t}</div>)}
    </div>
  );
}

// Действующие союзы — бумажки на краю стола.
function PactSlips({ gs }) {
  if (!gs.pacts?.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
      {gs.pacts.map(p => {
        const f = gs.factions.find(x => x.id === p.faction);
        const left = p.until - gs.turn;
        return (
          <div key={p.faction} className="sv-paper" style={{ flex:"1 1 220px", padding:"9px 14px", borderRadius:0, borderLeft:"3px solid var(--blue)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"baseline" }}>
              <span style={{ fontFamily:serif, fontSize:15, fontWeight:700 }}>Договор с «{f?.name}»</span>
              <span style={{ fontFamily:mono, fontSize:12, color:G.tx3, whiteSpace:"nowrap" }}>ещё {plural(left, "ход", "хода", "ходов")}</span>
            </div>
            <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>
              нельзя: {p.ban.map(t => ACTIONS[t].label.toLowerCase()).join(", ")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Проверка документа: справка и доклад, строку можно отметить как ложную — красным кругом, как в Papers, Please.
function InspectDoc({ doc, marked, onMark }) {
  return (
    <div className="sv-inspect">
      <div className="sv-paper" style={{ padding:"14px 18px", borderLeft:"6px solid var(--blue)", marginBottom:12, transform:"rotate(-.4deg)" }}>
        <div style={{ fontFamily:pixel, fontSize:13, color:G.tx3, marginBottom:6 }}>СПРАВКА</div>
        {doc.facts.map((f, i) => <div key={i} style={{ fontFamily:mono, fontSize:14, lineHeight:1.55, color:G.txt, marginBottom:4 }}>{f}</div>)}
      </div>
      <Card style={{ padding:"16px 0 10px", marginBottom:14, transform:"rotate(.3deg)" }}>
        <div style={{ padding:"0 20px 6px", display:"flex", justifyContent:"space-between", gap:10, alignItems:"baseline", flexWrap:"wrap" }}>
          <span style={{ fontFamily:pixel, fontSize:13, color:G.tx3 }}>ДОКЛАД</span>
          <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>исп.: {doc.author}</span>
        </div>
        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, padding:"0 20px 8px" }}>{INSPECT_TEXT.hint}</div>
        {doc.lines.map((l, i) => {
          const on = marked === i;
          return (
            <button key={i} onClick={() => onMark(on ? null : i)} aria-pressed={on} className="sv-docline"
              style={{ display:"flex", gap:10, width:"100%", textAlign:"left", padding:on ? "9px 86px 9px 20px" : "9px 20px", background:on ? "rgba(160,47,36,.08)" : "transparent", border:"none", borderTop:`1px dashed ${G.bdr}`, color:G.txt, position:"relative" }}>
              <span style={{ fontFamily:mono, fontSize:13, color:G.tx3, minWidth:16, paddingTop:2 }}>{i + 1}</span>
              <span style={{ fontFamily:mono, fontSize:14, lineHeight:1.55, textDecoration:on ? "underline wavy var(--red)" : "none", textUnderlineOffset:4 }}>{l}</span>
              {on && <span className="sv-stamp is-red sv-in" style={{ position:"absolute", right:12, top:"50%", marginTop:-14, fontSize:12, animationDelay:"0s" }}>ложь?</span>}
            </button>
          );
        })}
      </Card>
    </div>
  );
}

// Предвыборный бюджет: раскладываешь миллиарды по статьям и сразу видишь, что получится.
function BudgetPanel({ gs, onFinish, onSkip, stamping }) {
  const [alloc, setAlloc] = useState(() => Object.fromEntries(BUDGET_ITEMS.map(i => [i.id, 2])));
  const [debt, setDebt] = useState(false);
  const limit = budgetLimit(debt);
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  const left = limit - used;
  const change = (id, d) => setAlloc(a => {
    const v = a[id] + d;
    if (v < 0 || v > BUDGET_MAX || (d > 0 && used >= limit)) return a;
    return { ...a, [id]: v };
  });
  const toggleDebt = () => {
    if (debt) {
      // без займа лишнее снимаем с самых дорогих статей
      let over = used - budgetLimit(false);
      const next = { ...alloc };
      while (over > 0) { const k = Object.keys(next).sort((a, b) => next[b] - next[a])[0]; next[k]--; over--; }
      setAlloc(next);
    }
    setDebt(!debt);
  };
  const plan = budgetChoice(gs, alloc, debt);
  const btn = { width:40, height:40, border:`2px solid ${G.txt}`, background:"transparent", color:G.txt, fontFamily:pixel, fontSize:18, flexShrink:0 };
  return (
    <Card style={{ padding:"18px 0 16px" }}>
      <div id="sv-resolution" style={{ padding:"0 20px", display:"flex", justifyContent:"space-between", gap:10, alignItems:"baseline" }}>
        <Label>Роспись бюджета</Label>
        <span style={{ fontFamily:pixel, fontSize:13, color:left === 0 ? G.grn : G.red }}>{left === 0 ? "РАСПРЕДЕЛЕНО" : `ОСТАЛОСЬ ${left} МЛРД`}</span>
      </div>
      {BUDGET_ITEMS.map(item => {
        const v = alloc[item.id];
        return (
          <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 20px", borderTop:`1px solid ${G.bdr}` }}>
            <ResIcon k={item.res} value={60} size={24} color={G.txt}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:narrow, fontWeight:700, fontSize:18, lineHeight:1.1 }}>{item.label}</div>
              <div style={{ fontFamily:narrow, fontSize:14, color:G.tx3 }}>{item.desc}</div>
              <div style={{ display:"flex", gap:3, marginTop:5 }} aria-hidden="true">
                {Array.from({ length: BUDGET_MAX }, (_, k) => <span key={k} style={{ width:14, height:8, background:k < v ? (v <= 1 ? G.red : G.txt) : G.bdr }}/>)}
              </div>
            </div>
            <button style={btn} onClick={() => change(item.id, -1)} disabled={v <= 0} aria-label={`Меньше: ${item.label}`}>−</button>
            <span style={{ fontFamily:pixel, fontSize:18, minWidth:22, textAlign:"center" }}>{v}</span>
            <button style={btn} onClick={() => change(item.id, 1)} disabled={v >= BUDGET_MAX || left <= 0} aria-label={`Больше: ${item.label}`}>+</button>
          </div>
        );
      })}
      <label style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"10px 20px", borderTop:`1px dashed ${G.bdr2}`, cursor:"pointer" }}>
        <input type="checkbox" checked={debt} onChange={toggleDebt} style={{ width:20, height:20, accentColor:"var(--red)", marginTop:2 }}/>
        <span style={{ fontFamily:narrow, fontSize:16, lineHeight:1.35 }}>
          <b>Занять ещё 3 млрд.</b> <span style={{ color:G.tx3 }}>Красиво перед выборами — но через три хода придут долги: экономика −6, репутация −2.</span>
        </span>
      </label>
      <div style={{ padding:"10px 20px 0", borderTop:`2px solid ${G.txt}` }}>
        <div style={{ fontFamily:pixel, fontSize:12, color:G.tx3, marginBottom:6 }}>ЧТО ИЗМЕНИТСЯ</div>
        <ResourceChips delta={plan.deal.res}/>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"0 12px", fontFamily:narrow, fontSize:15, lineHeight:1.5, marginTop:4 }}>
          {Object.entries(plan.deal.factionRel ?? {}).map(([fid, d]) => (
            <span key={fid} style={{ color:d > 0 ? G.grn : G.red, whiteSpace:"nowrap" }}>{gs.factions.find(f => f.id === fid)?.name} {signed(d)}</span>
          ))}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap", marginTop:12, position:"relative" }}>
          <button onClick={onSkip} style={{ background:"transparent", border:"none", padding:0, fontFamily:narrow, fontSize:15, color:G.tx3, textDecoration:"underline dotted" }}>Жить по прошлогоднему бюджету</button>
          <PrimaryBtn id="opt-1" onClick={() => onFinish(alloc, debt)} disabled={left !== 0}>УТВЕРДИТЬ БЮДЖЕТ</PrimaryBtn>
          {stamping === "p" && <span className="sv-stamp sv-stamp-hit">Утверждено</span>}
        </div>
      </div>
    </Card>
  );
}

// Звонок по защищённой линии: сначала подход, потом развязка. Как ответят — решает характер собеседника.
function CallPanel({ call, seed, onFinish, onHang, stamping }) {
  const [approach, setApproach] = useState(null);
  const [secs, setSecs] = useState(0);
  useEffect(() => { const t = setInterval(() => setSecs(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const ok = approach && approachWorks(call.trait, approach);
  const row = { display:"block", width:"100%", textAlign:"left", padding:"12px 22px 12px 48px", background:"transparent", border:"none", borderTop:`1px solid ${G.bdr}`, color:G.txt, position:"relative" };
  const num = i => <span style={{ position:"absolute", left:20, top:12, fontFamily:serif, fontWeight:700, fontSize:17, color:G.tx3 }}>{i}.</span>;
  return (
    <Card style={{ padding:"18px 0 14px" }}>
      <div id="sv-resolution" style={{ padding:"0 22px", display:"flex", justifyContent:"space-between", gap:10 }}>
        <Label><span style={{ color:G.red }}>●</span> Защищённая линия</Label>
        <span style={{ fontFamily:pixel, fontSize:13, color:G.tx3 }}>{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</span>
      </div>
      <div style={{ fontFamily:serif, fontSize:18, lineHeight:1.5, padding:"0 22px 12px" }}>{call.demand}</div>
      {!approach && <>
        <div style={{ padding:"0 22px 8px", fontFamily:narrow, fontSize:15, color:G.tx2 }}>Как говорить? Подсказка — в характере собеседника.</div>
        {APPROACHES.map((a, i) => (
          <button key={a.id} id={`opt-${i + 1}`} className="sv-opt" style={row} onClick={() => setApproach(a.id)}>
            {num(i + 1)}<span style={{ fontFamily:serif, fontSize:16, fontWeight:700 }}>{a.text}</span>
          </button>
        ))}
        <div style={{ padding:"10px 22px 0" }}>
          <button onClick={onHang} style={{ background:"transparent", border:"none", padding:0, fontFamily:narrow, fontSize:15, color:G.tx3, textDecoration:"underline dotted" }}>
            Не брать трубку
          </button>
        </div>
      </>}
      {approach && (
        <div className="sv-fade">
          <div style={{ padding:"8px 22px 12px", borderTop:`1px dashed ${G.bdr2}` }}>
            <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>Вы: {APPROACHES.find(a => a.id === approach).text.toLowerCase()}</div>
            <div style={{ fontFamily:serif, fontSize:17, lineHeight:1.5, fontStyle:"italic", color:ok ? G.grn : G.red, marginTop:4 }}>{callReply(seed, call, approach, ok)}.</div>
          </div>
          {CALL_ENDINGS.map((e, i) => (
            <button key={e.id} id={`opt-${i + 1}`} className="sv-opt" style={row} onClick={() => onFinish(approach, e.id)}>
              {num(i + 1)}<span style={{ fontFamily:serif, fontSize:16, fontWeight:700 }}>{e.text}</span>
            </button>
          ))}
          {stamping === "p" && <span className="sv-stamp sv-stamp-hit">Решено</span>}
        </div>
      )}
    </Card>
  );
}

// Пресс-конференция: три вопроса подряд, на каждый — 15 секунд. Не успели — пауза станет заголовком.
const TONE_LABEL = { honest:"честно", hard:"жёстко", evasive:"уклончиво" };
const PRESS_SECONDS = 15;
function PressPanel({ press, onFinish, onSkip, stamping }) {
  const [picks, setPicks] = useState([]);
  const [live, setLive] = useState(false); // время идёт только после выхода к журналистам
  const step = picks.length, q = press.questions[step];
  const done = step >= press.questions.length;
  const answer = i => setPicks(p => (p.length === step ? [...p, i] : p));
  return (
    <Card style={{ padding:"18px 0 14px" }}>
      <div id="sv-resolution" style={{ padding:"0 22px", display:"flex", justifyContent:"space-between", gap:10 }}>
        <Label>{done ? "Пресс-конференция окончена" : live ? `Вопрос ${step + 1} из ${press.questions.length}` : "Пресс-конференция"}</Label>
        {!done && <span style={{ fontFamily:pixel, fontSize:13, color:G.tx3 }}>{PRESS_SECONDS} СЕК НА ОТВЕТ</span>}
      </div>
      {!live && (
        <div style={{ padding:"0 22px" }}>
          <div style={{ fontFamily:narrow, fontSize:16, color:G.tx2, lineHeight:1.4, marginBottom:12 }}>
            Три вопроса подряд. На каждый — {PRESS_SECONDS} секунд: отвечайте честно, жёстко или уклончиво. Промолчите — пауза станет новостью.
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
            <button onClick={onSkip} style={{ background:"transparent", border:"none", padding:0, fontFamily:narrow, fontSize:15, color:G.tx3, textDecoration:"underline dotted" }}>
              Отменить — зал решит, что вы испугались
            </button>
            <PrimaryBtn id="opt-1" onClick={() => { setLive(true); requestAnimationFrame(() => document.getElementById("sv-resolution")?.scrollIntoView({ block:"start", behavior:"smooth" })); }}>ВЫЙТИ К ЖУРНАЛИСТАМ</PrimaryBtn>
          </div>
        </div>
      )}
      {live && !done && (
        <div key={step} className="sv-fade">
          <div style={{ height:6, margin:"0 22px 14px", background:G.bdr }}>
            <div className="sv-timer" style={{ height:"100%", background:G.red, animationDuration:`${PRESS_SECONDS}s` }} onAnimationEnd={() => answer(-1)}/>
          </div>
          <div style={{ display:"flex", gap:12, padding:"0 22px 12px" }}>
            <Portrait name={q.who} size={44}/>
            <div>
              <div style={{ fontFamily:narrow, fontWeight:700, fontSize:16, color:G.tx2 }}>{q.who}</div>
              <div style={{ fontFamily:serif, fontSize:18, lineHeight:1.45, color:G.txt }}>«{q.text}»</div>
            </div>
          </div>
          {q.answers.map((a, i) => (
            <button key={i} id={`opt-${i + 1}`} className="sv-opt" onClick={() => answer(i)}
              style={{ display:"block", width:"100%", textAlign:"left", padding:"12px 22px 12px 48px", background:"transparent", border:"none", borderTop:`1px solid ${G.bdr}`, color:G.txt, position:"relative" }}>
              <span style={{ position:"absolute", left:20, top:12, fontFamily:serif, fontWeight:700, fontSize:17, color:G.tx3 }}>{i + 1}.</span>
              <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.4, marginBottom:4 }}>{a.text}</div>
              <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontFamily:pixel, fontSize:12, color:G.tx3 }}>{TONE_LABEL[a.tone].toUpperCase()}</span>
                <ResourceChips delta={a.res} exact={false}/>
              </div>
            </button>
          ))}
        </div>
      )}
      {done && (
        <div className="sv-fade" style={{ padding:"0 22px", position:"relative" }}>
          {press.questions.map((qq, i) => (
            <div key={qq.id} style={{ fontFamily:narrow, fontSize:16, lineHeight:1.4, padding:"6px 0", borderTop:`1px dashed ${G.bdr2}` }}>
              <span style={{ color:G.tx3 }}>{qq.who}: </span>
              {picks[i] >= 0 ? <span>{qq.answers[picks[i]].text}</span> : <span style={{ color:G.red }}>молчание</span>}
            </div>
          ))}
          <div style={{ textAlign:"right", marginTop:12 }}>
            <PrimaryBtn id="opt-1" onClick={() => onFinish(picks)}>ЗАКОНЧИТЬ И ВЫЙТИ К МАШИНЕ</PrimaryBtn>
          </div>
          {stamping === "p" && <span className="sv-stamp sv-stamp-hit">Сказано</span>}
        </div>
      )}
    </Card>
  );
}

const quoteName = n => (String(n).includes("«") ? n : `«${n}»`);

// Ночь выборов: протоколы приходят один за другим. Первыми считают города — и они тянут цифры
// в сторону соперника; к концу ночи подтягиваются регионы, и проценты сходятся к итогу.
function ElectionNight({ e, party, onDone }) {
  const [p, setP] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let x = reduce ? 100 : 0, t2 = 0;
    const t = setInterval(() => {
      x = Math.min(100, x + 2 + Math.random() * 3);
      setP(x);
      if (x >= 100) { clearInterval(t); t2 = setTimeout(() => doneRef.current(), 1800); }
    }, 110);
    const onKey = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); doneRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(t); clearTimeout(t2); window.removeEventListener("keydown", onKey); };
  }, []);
  const k = p / 100, swing = (1 - k) * (1 - k) * 9; // ранние участки — в пользу соперника
  const me = Math.max(0, Math.round(e.leader - swing)), them = Math.round(e.top.share + swing * .8);
  const won = e.outcome === "won", over = p >= 100;
  const bar = (label, v, color, bold) => (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontFamily:narrow, fontSize:18, fontWeight:bold ? 700 : 400, marginBottom:4 }}>
        <span>{label}</span><span style={{ fontFamily:pixel, fontSize:20 }}>{v}%</span>
      </div>
      <div style={{ height:14, background:"rgba(0,0,0,.35)", border:"2px solid #000" }}>
        <div style={{ height:"100%", width:`${Math.min(100, v * 1.4)}%`, background:color, transition:"width .1s linear" }}/>
      </div>
    </div>
  );
  return (
    <div onClick={() => onDone()} style={{ background:"var(--bg-deep)", border:"2px solid #000", boxShadow:"var(--hard)", padding:"18px 20px 20px", marginBottom:12, cursor:"pointer", position:"relative" }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:14 }}>
        <span style={{ fontFamily:pixel, fontSize:13, color:G.red }}>● ПРЯМОЙ ЭФИР · ЦИК</span>
        <span style={{ fontFamily:pixel, fontSize:13, color:G.tx3 }}>ОБРАБОТАНО {Math.floor(p)}%</span>
      </div>
      <div style={{ fontFamily:narrow, fontWeight:700, fontSize:32, lineHeight:1.12, color:G.txt, marginBottom:16 }}>
        {e.kind === "president" ? "Президентские выборы" : "Парламентские выборы"}
      </div>
      {bar(quoteName(party), me, "var(--grn)", true)}
      {bar(quoteName(e.top.name), them, "var(--red)", false)}
      <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>
        {k < .35 ? "Первыми приходят протоколы крупных городов…" : k < .8 ? "Подтягиваются регионы. В штабе никто не садится." : over ? "Подсчёт окончен." : "Последние участки. Тишина в эфире."}
      </div>
      {over && (
        <span className={`sv-stamp sv-in ${won ? "is-green" : "is-red"}`} style={{ position:"absolute", right:20, bottom:16, fontSize:22, animationDelay:"0s", mixBlendMode:"normal" }}>
          {won ? "Победа" : e.outcome === "impeached" ? "Разгром" : "Поражение"}
        </span>
      )}
    </div>
  );
}

// Кто перед вами в особом деле: человек, его характер и расхождение с его лагерем.
function SpecialHeader({ gs, event }) {
  const sp = event.special;
  const fig = gs.keyFigures.find(f => f.id === sp.figure);
  const fac = gs.factions.find(f => f.id === sp.faction);
  if (!fig || !fac) return null;
  return (
    <div style={{ display:"flex", gap:12, alignItems:"center", margin:"0 0 14px" }}>
      <Portrait name={fig.name} size={44}/>
      <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, lineHeight:1.4 }}>
        <div style={{ fontFamily:serif, fontSize:15, fontWeight:700, color:G.txt }}>{fig.name}</div>
        <div>{fig.role} · {TRAITS[traitOf(gs.seed, fig, fac.bloc)].label} — {TRAIT_TIP[traitOf(gs.seed, fig, fac.bloc)]}</div>
        <div>к вам лично <b style={{ color:relColor(fig.relation) }}>{signed(fig.relation)}</b> · лагерь «{fac.name}» <b style={{ color:relColor(fac.relation) }}>{signed(fac.relation)}</b></div>
      </div>
    </div>
  );
}

// Без совета шанс назван словами: «надёжно», «как повезёт», — точный процент знает советник.
const chanceWord = pct => (pct >= 85 ? "исполнят надёжно" : pct >= 70 ? "скорее исполнят" : pct >= 55 ? "как повезёт" : "скорее сорвут");
function ChanceBadge({ p, exact = true }) {
  const pct = Math.round(p * 100);
  const c = pct >= 75 ? G.grn : pct >= 55 ? G.amb : G.red;
  return <span title="Насколько надёжно решение исполнят. Зависит от советника, отношения исполнителей и ресурсов." style={{ color:c, fontWeight:700 }}>{exact ? `исполнят с шансом ${pct}%` : chanceWord(pct)}</span>;
}

const stars = n => "★".repeat(n) + "☆".repeat(3 - n);

// Совет: ограниченное число раз за мандат советники предлагают свои решения.
function CouncilPanel({ gs, onConvened, optProps, stamping }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const proposals = gs.currentEvent?.council;
  const charges = gs.councilCharges ?? 0;
  const silent = proposals?.length ? (gs.advisors ?? []).filter(a => !proposals.some(p => p.advisor?.id === a.id)) : [];
  if (gs.currentEvent?.beat || gs.currentEvent?.special) {
    return (
      <div style={{ marginTop:6, paddingTop:14, borderTop:`1px solid ${G.bdr}`, fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx3 }}>
        {gs.currentEvent.beat ? "Дело засекречено: совет в него не посвящён. Решать вам одному." : gs.currentEvent.special?.kind === "inspect" ? "Проверку не перепоручишь: сверяйте сами." : "Дело личное: совет о нём не знает. Решать вам одному."}
      </div>
    );
  }

  const convene = async () => {
    if (busy || charges <= 0) return;
    setBusy(true); setErr(null);
    try { onConvened(await game.council(gs)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop:6, paddingTop:14, borderTop:`1px solid ${G.bdr}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:10 }}>
        <span style={{ fontFamily:narrow, fontWeight:700, fontSize:13, letterSpacing:".06em", textTransform:"uppercase", color:G.tx3 }}>Совет</span>
        <span style={{ fontFamily:narrow, fontSize:15, color:charges?G.gold:G.tx3 }}>{charges ? `можно собрать ещё ${plural(charges, "раз", "раза", "раз")}` : "больше не соберётся"}</span>
      </div>
      {Array.isArray(proposals) && !proposals.length && (
        <div style={{ fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx3, marginBottom:4 }}>
          Советники выслушали и развели руками: по этому делу им нечего добавить. Сбор не засчитан.
        </div>
      )}
      {silent.length > 0 && (
        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginBottom:8 }}>
          Без предложений по этому делу: {silent.map(a => a.name).join(", ")}
        </div>
      )}
      {proposals?.length ? proposals.map((c, i) => (
        <button key={c.id} {...optProps(c, i)}
          style={{ display:"block", width:"100%", textAlign:"left", padding:"14px 16px", marginBottom:6, borderRadius:0, background:"transparent", border:`1px dashed ${G.bdr2}`, color:G.txt, position:"relative" }}>
          <ChoicePreview gs={gs} c={c}/>
          {stamping === c.id && <span className="sv-stamp sv-stamp-hit">Исполнить</span>}
        </button>
      )) : (
        <>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"8px 18px", marginBottom:10 }}>
            {(gs.advisors ?? []).map(a => (
              <span key={a.id} title={`${a.role} · ${ADVISOR_SKILL[a.skill].label}`}
                style={{ display:"inline-flex", alignItems:"center", gap:8, fontFamily:narrow, fontSize:15, color:G.tx2 }}>
                <Portrait name={a.name} size={26}/>
                <span>{a.name} <span style={{ color:G.gold }}>{stars(a.skill)}</span></span>
              </span>
            ))}
          </div>
          <div style={{ fontFamily:serif, fontSize:14, color:G.tx3, fontStyle:"italic", marginBottom:10 }}>
            Каждый советник предложит своё решение из своей области. Сильный советник предлагает ходы дешевле и выгоднее.
          </div>
          <button onClick={convene} disabled={busy || charges <= 0 || Array.isArray(proposals)}
            style={{ background:"transparent", border:`1.5px solid ${charges?G.gold:G.bdr}`, color:charges?G.gold:G.tx3, padding:"8px 18px", borderRadius:0, fontSize:15, fontWeight:700, opacity:charges && !Array.isArray(proposals)?1:.5 }}>
            {busy ? "Советники собираются…" : charges ? "Собрать совет" : "Совет исчерпан"}
          </button>
          {err && <div style={{ fontFamily:narrow, fontSize:15, color:G.amb, marginTop:8 }}>✖ {err}</div>}
        </>
      )}
    </div>
  );
}

const DATELINE = /^[А-Я][а-я]+, \d\d:\d\d\. /;

// Текст главы: абзацы; первый абзац-шапка (день, время, место) — в стиле сводки.
function Prose({ text }) {
  const paras = String(text).split(/\n\n+/);
  return (
    <div>
      {paras.map((p, i) => DATELINE.test(p)
        ? <div key={i} style={{ fontFamily:mono, fontSize:12.5, color:G.tx2, lineHeight:1.65, marginBottom:14 }}>{p}</div>
        : <p key={i} style={{ fontFamily:serif, fontSize:17, lineHeight:1.7, color:i === 1 ? G.txt : G.tx2, marginBottom:12, maxWidth:"68ch" }}>{p}</p>)}
    </div>
  );
}

// Документ хода: вырезка из газет или перехват спецслужб.
function DocumentCard({ doc }) {
  const secret = doc.kind === "intercept";
  return (
    <div style={{ margin:"18px 0", padding:"16px 18px", background:G.bg3, border:`2px solid ${G.bdr2}`, boxShadow:"3px 3px 0 rgba(0,0,0,.18)", transform:`rotate(${secret ? -0.5 : 0.4}deg)` }}>
      <div style={{ marginBottom:10 }}>
        {secret
          ? <span className="sv-stamp is-red" style={{ fontSize:13, transform:"rotate(-3deg)" }}>{doc.title}</span>
          : <span style={{ fontFamily:narrow, fontWeight:700, fontSize:14, color:G.tx3 }}>{doc.title}</span>}
      </div>
      {doc.lines.map((l, i) => (
        <div key={i} style={{ fontFamily:secret ? mono : serif, fontSize:secret ? 13 : 17, fontWeight:secret ? 400 : 700, fontStyle:secret && i > 0 ? "italic" : "normal", color:secret && i > 0 ? G.tx3 : G.txt, lineHeight:1.5, padding:"5px 0", borderTop:!secret && i ? `1px solid ${G.bdr}` : "none" }}>{l}</div>
      ))}
    </div>
  );
}

// Итог хода печатается как телеграмма; клик, Enter или пробел — показать сразу.
function Typewriter({ text, onDone }) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setN(text.length);
    onDoneRef.current();
  }, [text]);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const t = setInterval(() => {
      setN(x => {
        const next = x + 6;
        if (next >= text.length) { clearInterval(t); setTimeout(finish, 0); }
        return next;
      });
    }, reduce ? 1 : 25);
    const onKey = e => {
      if (doneRef.current || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(t); window.removeEventListener("keydown", onKey); };
  }, [text, finish]);
  const typing = n < text.length;
  return (
    <div onClick={finish} title={typing ? "Показать сразу" : undefined}
      style={{ fontFamily:serif, fontSize:16, lineHeight:1.8, color:G.txt, marginBottom:14, cursor:typing ? "pointer" : "default" }}>
      {text.slice(0, n).split(/\n\n+/).map((p, i, arr) => (
        <p key={i} style={{ marginBottom:i < arr.length - 1 ? 12 : 0 }}>{p}{typing && i === arr.length - 1 && <span className="sv-caret">▍</span>}</p>
      ))}
    </div>
  );
}

// ── Окно на площадь ──────────────────────────────────────────────────────────
// Пиксельная сцена над столом: площадь перед резиденцией живёт состоянием страны.
// scale — сколько экранных пикселей в одном пикселе сцены; mono — газетное фото.
// Время суток за окном — по часам в шапке дела («Вторник, 04:50. …»).
const phaseMemo = { v: undefined };
function dayPhase(text) {
  const m = /^[^\n]*?(\d{1,2}):\d{2}/.exec(text ?? "");
  if (!m) return undefined;
  const h = Number(m[1]);
  return h >= 5 && h < 10 ? 0 : h >= 10 && h < 17 ? 1 : h >= 17 && h < 21 ? 2 : 3;
}
function squareState(gs) {
  const sec = gs.factions.filter(f => f.bloc === "security");
  return {
    country: gs.country, seed: gs.seed ?? 0, turn: gs.turn,
    legitimacy: gs.resources.internalLegitimacy, military: gs.resources.military,
    rating: computePolls(gs.country, gs.factions, gs.resources).leader,
    security: sec.length ? sec.reduce((a, f) => a + f.relation, 0) / sec.length : 0,
    crises: gs.activeCrises?.length ?? 0, election: !!ELECTIONS[gs.turn],
    phase: dayPhase(gs.currentEvent?.description),
  };
}
// Рубрика над заголовком газеты — по сути решения.
const RUBRICS = {
  repress:"Порядок", security:"Безопасность", reform:"Политика", pro_west:"Внешняя политика", pro_russia:"Внешняя политика",
  social:"Общество", austerity:"Экономика", investment:"Экономика", anticorruption:"Расследования", elite_deal:"Кулуары",
  dialogue:"Общество", patriotism:"Страна", propaganda:"Медиа", delay:"Политика",
};
function rubricOf(t) {
  if (t.election) return t.election.kind === "president" ? "Президентские выборы" : "Парламентские выборы";
  if (t.success === false) return "Провал";
  const tag = (t.tags || []).find(x => x !== "delay") || (t.tags || [])[0];
  return RUBRICS[tag] || "Политика";
}

function SquareView({ gs, scene, sceneKey, partner, height = 48, mono = false, still = false, style }) {
  const wrap = useRef(null), ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = w < 560 ? 2 : 3;
  const lw = Math.max(80, Math.round(w / scale));
  // После решения дела уже нет — время суток остаётся тем же, что было в его шапке.
  const st0 = scene ?? squareState(gs);
  const key = JSON.stringify({ ...st0, phase: st0.phase ?? phaseMemo.v, sceneKey, partner });
  useEffect(() => { if (st0.phase !== undefined) phaseMemo.v = st0.phase; }, [st0.phase]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const st = JSON.parse(key);
    const ctx = c.getContext("2d");
    let frame = 0;
    // Сцена события или сама площадь — один и тот же растр и палитра.
    const draw = () => st.sceneKey && st.sceneKey !== "square" ? drawScene(ctx, lw, height, st.sceneKey, st, frame++, st.partner) : drawSquare(ctx, lw, height, st, frame++);
    draw();
    const reduce = still || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    const t = setInterval(() => { if (!document.hidden) draw(); }, st.sceneKey && st.sceneKey !== "square" ? 260 : 420);
    return () => clearInterval(t);
  }, [key, lw, height, w, still]);
  return (
    <div ref={wrap} style={{ width:"100%", ...style }}>
      {w > 0 && <canvas ref={ref} width={lw} height={height} className="sv-px" aria-label="Площадь перед резиденцией"
        style={{ display:"block", width:"100%", height:height * (w / lw), filter: mono ? "grayscale(1) contrast(1.15) sepia(.25)" : "none" }}/>}
    </div>
  );
}

// Ведомость за ход: строка за строкой, с отточиями — как вечерний расчёт в Papers, Please.
function Ledger({ rows: all }) {
  const [full, setFull] = useState(false);
  if (!all.length) return null;
  // Ресурсы — всегда; группы — четыре самые заметные перемены, остальные по нажатию.
  const res = all.filter(r => !r.rel), rel = [...all.filter(r => r.rel)].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const rows = full ? [...res, ...rel] : [...res, ...rel.slice(0, 4)];
  const hidden = rel.length - 4;
  return (
    <div style={{ marginTop:16, paddingTop:10, borderTop:`2px solid ${G.txt}` }}>
      <div style={{ fontFamily:pixel, fontSize:13, color:G.tx3, marginBottom:6 }}>ВЕДОМОСТЬ ЗА ХОД</div>
      <div className="sv-ledger">
        {rows.map(r => (
          <div key={r.k} style={{ display:"flex", alignItems:"baseline", gap:6, fontFamily:narrow, fontSize:16, lineHeight:1.5 }}>
            <span style={{ color:r.rel ? G.tx2 : G.txt, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"60%" }}>{r.label}</span>
            <span style={{ flex:1, borderBottom:`2px dotted ${G.bdr2}`, transform:"translateY(-4px)" }}/>
            <span style={{ fontWeight:700, color:G.tx2 }}>{r.rel ? signed(r.value) : r.value}</span>
            <span style={{ fontWeight:700, minWidth:34, textAlign:"right", color:r.delta > 0 ? G.grn : G.red }}>{signed(r.delta)}</span>
          </div>
        ))}
      </div>
      {!full && hidden > 0 && (
        <button onClick={() => setFull(true)} style={{ marginTop:6, background:"transparent", border:"none", padding:0, fontFamily:narrow, fontSize:15, color:G.tx3, textDecoration:"underline dotted" }}>
          ещё {plural(hidden, "группа", "группы", "групп")}
        </button>
      )}
    </div>
  );
}

// Флажок страны — пиксельные полосы вместо эмодзи.
function Flag({ country, size = 18 }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; if (c) drawFlagAt(c.getContext("2d"), country, 9, 6); }, [country]);
  return <canvas ref={ref} width={9} height={6} className="sv-px" aria-hidden="true"
    style={{ width:size, height:Math.round(size * 2 / 3), border:"1px solid rgba(0,0,0,.6)", flexShrink:0, verticalAlign:"middle" }}/>;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
const SHORT = { politicalCapital:"Политкапитал", economy:"Экономика", military:"Силовики", externalReputation:"Репутация", internalLegitimacy:"Легитимность", personalResource:"Личный ресурс" };

// Что значит каждая опора — одной фразой, для подсказки по нажатию на значок.
const RES_ABOUT = {
  politicalCapital: "Влияние в парламенте и аппарате. На нём держатся сделки и реформы.",
  economy: "Бюджет, цены, зарплаты. Проседает от раздач, санкций и кризисов.",
  military: "Сила армии и спецслужб. Сильная армия при враждебных силовиках — риск переворота.",
  externalReputation: "Как к вам относятся за границей: кредиты, санкции, союзники.",
  internalLegitimacy: "Признают ли люди вашу власть. На нуле — революция.",
  personalResource: "Ваши силы, здоровье, деньги и личные связи.",
};

// Подсказка по значку опоры: смысл, пороги и всё, что на неё повлияет в ближайшие ходы.
function ResInfo({ gs, k, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = e => { if (!ref.current?.contains(e.target) && !e.target.closest?.("[data-res]")) onClose(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const cfg = RES_CONFIG.find(r => r.key === k);
  const v = gs.resources[k];
  const soon = [
    ...(gs.pending ?? []).filter(p => p.res[k]).map(p => [p.res[k], `через ${plural(p.due - gs.turn, "ход", "хода", "ходов")}: ${p.label.toLowerCase()}`]),
    ...(gs.activeCrises ?? []).filter(c => c.resourceDrain?.[k]).map(c => [c.resourceDrain[k], `каждый ход: кризис «${c.title}»`]),
    ...(gs.pacts ?? []).filter(p => PACT_INCOME[gs.factions.find(f => f.id === p.faction)?.bloc] === k)
      .map(p => [pactIncomeOf(p), `каждый ход: договор с «${gs.factions.find(f => f.id === p.faction)?.name}»`]),
  ];
  return (
    <div ref={ref} className="sv-paper sv-fade" role="dialog" aria-label={cfg.prompt}
      style={{ position:"absolute", left:0, right:0, marginLeft:"auto", marginRight:"auto", top:"100%", marginTop:6, width:"min(420px, calc(100vw - 24px))", padding:"12px 14px", zIndex:25 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
        <ResIcon k={k} value={v} size={26} color={barColor(v)} dim="var(--bdr)"/>
        <span style={{ fontFamily:narrow, fontWeight:700, fontSize:20, flex:1 }}>{cfg.prompt}</span>
        <span style={{ fontFamily:narrow, fontWeight:700, fontSize:22 }}>{v}<span style={{ fontSize:15, color:G.tx3 }}> / 100</span></span>
      </div>
      <div style={{ fontFamily:narrow, fontSize:16, color:G.txt, lineHeight:1.35 }}>{RES_ABOUT[k]}</div>
      <div style={{ fontFamily:narrow, fontSize:15, color:v < 20 ? G.red : G.tx3, marginTop:4 }}>
        {v <= LIMITS.endResource ? "Опора рухнула — власть падает." : v < 20 ? "Ниже 20: кризис. На 4 и ниже — падение власти." : "Ниже 20 — кризис, на 4 и ниже — падение власти."}
      </div>
      {soon.length > 0 && (
        <div style={{ marginTop:8, paddingTop:6, borderTop:`1px dashed ${G.bdr2}` }}>
          {soon.map(([d, t], i) => (
            <div key={i} style={{ fontFamily:narrow, fontSize:15, lineHeight:1.4 }}>
              <b style={{ color:d > 0 ? G.grn : G.red }}>{signed(d)}</b> <span style={{ color:G.tx2 }}>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Постоянная панель статуса. При наведении на вариант показывает итог хода, посчитанный движком.
function Hud({ gs, preview, onMenu, onHelp }) {
  const [info, setInfo] = useState(null);
  const ci = IDEOLOGIES.find(i => i.id === gs.ideo);
  let plan = null;
  if (preview && gs.currentEvent) { try { plan = planTurn(gs, preview.id, { assumeSuccess: true }); } catch { plan = null; } }
  const exact = !!preview?.advisor; // итог в цифрах — только для варианта от совета
  const rating = computePolls(gs.country, gs.factions, gs.resources).leader;
  const nextRating = plan ? computePolls(gs.country, plan.factions, plan.resources).leader : null;
  const next = nextElection(gs.turn);
  const arrow = (a, b) => b === null || b === a ? null : <span style={{ color:b > a ? G.grn : G.red }}>{exact ? ` → ${b}` : ` ${b > a ? "▲" : "▼"}`}</span>;
  const turnNow = Math.min(gs.turn + 1, MAX_TURNS);
  return (
    <header className="sv-hud">
      <div style={{ maxWidth:1080, margin:"0 auto", padding:"8px 14px 6px" }}>
        <div className="sv-hud-row" style={{ position:"relative" }}>
          {info && <ResInfo gs={gs} k={info} onClose={() => setInfo(null)}/>}
          <div className="sv-hud-who" style={{ minWidth:0 }}>
            <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, whiteSpace:"nowrap" }}>{gs.country} · {ci.label.toLowerCase()}<span className="sv-hud-turn"> · ход {turnNow}/{MAX_TURNS}</span></div>
            <div style={{ fontFamily:pixel, fontSize:15, color:G.gold, lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textTransform:"uppercase" }}>{gs.leader.name}</div>
          </div>
          <div className="sv-hud-res">
            {RES_CONFIG.map(r => {
              const v = gs.resources[r.key];
              const to = plan ? plan.resources[r.key] : null;
              const d = to === null ? 0 : to - v;
              const danger = (to ?? v) <= LIMITS.endResource;
              const dot = Math.abs(d) >= 6 ? 8 : 4;
              return (
                <button key={r.key} data-res={r.key} onClick={() => setInfo(x => x === r.key ? null : r.key)} aria-expanded={info === r.key}
                  aria-label={`${r.prompt}: ${v}${d ? (exact ? `, станет ${to}` : d > 0 ? ", вырастет" : ", упадёт") : ""}. Подробнее`}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, position:"relative", background:info === r.key ? G.bg3 : "transparent", border:"none", padding:"2px 0", color:"inherit" }}>
                  {d !== 0 && <span className="sv-fade" style={{ position:"absolute", top:-2, right:"calc(50% - 20px)", width:dot, height:dot, background:d > 0 ? G.grn : G.red }}/>}
                  <ResIcon k={r.key} value={v} size={28} color={danger && to !== null ? G.red : barColor(v)}/>
                  <div style={{ fontFamily:pixel, fontSize:14, lineHeight:1, color:G.tx2, whiteSpace:"nowrap" }}>
                    {v}{d !== 0 && exact && <span style={{ color:d > 0 ? G.grn : G.red }}>→{to}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="sv-hud-side" style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:narrow, fontSize:14, color:G.tx3, lineHeight:1.1, marginBottom:3 }}>рейтинг</div>
              <div style={{ fontFamily:narrow, fontWeight:700, fontSize:24, color:rating >= 35 ? G.grn : rating >= 20 ? G.amb : G.red, lineHeight:1 }}>
                {rating}%<span style={{ fontSize:16 }}>{arrow(rating, nextRating)}</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={onHelp} title="Как играть" aria-label="Как играть"
                style={{ background:"transparent", border:`2px solid ${G.bdr2}`, color:G.tx2, width:30, height:30, borderRadius:0, fontSize:16 }}>?</button>
              <button onClick={onMenu} title="В меню (партия сохранится)"
                style={{ background:"transparent", border:`2px solid ${G.bdr2}`, color:G.tx2, padding:"0 12px", height:30, borderRadius:0, fontSize:16 }}>Меню</button>
            </div>
          </div>
        </div>
        <div className="sv-hud-track" style={{ display:"flex", alignItems:"center", gap:12, marginTop:6 }}>
          <div style={{ display:"flex", gap:2, flex:"0 0 260px" }} aria-label={`Ход ${gs.turn} из ${MAX_TURNS}`}>
            {Array.from({ length: MAX_TURNS }, (_, i) => {
              const t = i + 1;
              const done = t <= gs.turn, now = t === gs.turn + 1, vote = !!ELECTIONS[t];
              return <div key={t} title={vote ? `${t} ход — ${ELECTION_LABEL[ELECTIONS[t]].toLowerCase()}` : `${t} ход`}
                style={{ flex:1, marginLeft:t > 1 && (t - 1) % 5 === 0 ? 5 : 0, height:vote ? 8 : 5, alignSelf:"flex-end", background: done ? G.gold : now ? G.gld2 : vote ? G.bdr2 : G.bdr, opacity: done ? .75 : 1, outline: now ? `1px solid ${G.gld2}` : "none" }}/>;
            })}
          </div>
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {monthYear(turnDate(gs.seed, COUNTRIES[gs.country].startYear, Math.min(gs.turn, MAX_TURNS - 1)))} · глава {ROMAN[chapterOf(turnNow)]} · ход {turnNow}/{MAX_TURNS}{next ? ` · ${next.label.toLowerCase()} ${inTurns(next.in)}` : ""}
          </div>
        </div>
      </div>
    </header>
  );
}

const LOADING_LINES = {
  event:   ["Разведка сводит донесения…", "Пресс-служба мониторит ленты…", "В приёмной ждут министры…", "Аналитики считают сценарии…", "Ситуационный центр на связи…"],
  choice:  ["Указ уходит на подпись…", "Министерства получают распоряжения…", "Корреспонденты уже звонят…", "Новость расходится по улицам…", "Оппоненты готовят ответ…"],
};

function Loading({ kind }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(x => x + 1), 2200);
    return () => clearInterval(t);
  }, []);
  const lines = LOADING_LINES[kind] ?? LOADING_LINES.event;
  return (
    <Card style={{ padding:"64px 24px", textAlign:"center" }}>
      <div className="sv-progress" style={{ maxWidth:260, margin:"0 auto 18px" }}/>
      <div key={i} className="sv-fade" style={{ fontFamily:serif, fontSize:17, fontStyle:"italic", color:G.tx2 }}>{lines[i % lines.length]}</div>
    </Card>
  );
}

const TUTORIAL_KEY = "sovereign.tutorial.seen";
const nowMs = () => Date.now();
// Вместо окна правил на старте — по одной подсказке на первых ходах, прямо над вариантами.
const TIP_TURNS = [
  "Под вариантами — куда решение потянет опоры власти: ▲ вырастет, ▼▼ сильно упадёт. Точную цену знает только совет.",
  "✔ под вариантом — шаг к вашему предвыборному обещанию, ✖ — его нарушение. Обещания и опоры — в досье.",
  "Опора ниже 20 — кризис, 4 и ниже — падение власти. Совет можно собрать несколько раз за правление: он назовёт точные цифры. Все правила — под «?» наверху.",
];
const tutorialSeen = () => { try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch { return true; } };

function SoundToggle() {
  const [on, setOn] = useState(soundOn);
  return (
    <button onClick={() => { setSound(!on); setOn(!on); }} aria-pressed={on}
      style={{ background:"transparent", border:`1px solid ${G.bdr2}`, color:G.tx2, padding:"8px 14px", borderRadius:0, fontSize:15 }}>
      Звук: {on ? "включён" : "выключен"}
    </button>
  );
}

// «Ранее в Суверене»: сводка для того, кто вернулся к партии через день.
// Последние заголовки, угрозы и обязательства — всё, что нужно, чтобы вспомнить, где вы остановились.
function Recap({ gs, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const arcDef = ARCS.find(a => a.id === gs.arc?.id);
  const next = nextElection(gs.turn);
  const lines = [
    ...(gs.activeCrises ?? []).map(c => [G.red, `Кризис «${c.title}» — идёт ${plural(c.turnsActive + 1, "ход", "хода", "ходов")}`]),
    ...(gs.pacts ?? []).map(p => [G.blue, `Договор с «${gs.factions.find(f => f.id === p.faction)?.name}» — ещё ${plural(p.until - gs.turn, "ход", "хода", "ходов")}; нельзя: ${p.ban.map(t => ACTIONS[t].label.toLowerCase()).join(", ")}`]),
    ...[...(gs.pending ?? [])].sort((a, b) => a.due - b.due).slice(0, 2).map(p => [G.tx2, `Через ${plural(p.due - gs.turn, "ход", "хода", "ходов")}: ${p.label.toLowerCase()}`]),
    ...(arcDef && !gs.arc.epilogue ? [[G.red, `Интрига «${arcDef.title}»: эпизод ${Math.min(gs.arc.done.length + 1, arcDef.beats.length)} из ${arcDef.beats.length} впереди`]] : []),
    ...(next ? [[G.tx2, `${next.label} ${inTurns(next.in)}`]] : []),
  ];
  return (
    <div className="sv-modal" role="dialog" aria-modal="true" aria-labelledby="recap-title" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="sv-fade sv-paper" style={{ maxWidth:520, width:"100%", maxHeight:"90vh", overflowY:"auto", padding:"22px 22px 18px" }}>
        <div style={{ fontFamily:pixel, fontSize:13, color:G.tx3 }}>РАНЕЕ В «СУВЕРЕНЕ»</div>
        <div id="recap-title" style={{ fontFamily:narrow, fontWeight:700, fontSize:30, lineHeight:1.15, margin:"6px 0 4px" }}>{gs.leader.name}</div>
        <div style={{ fontFamily:narrow, fontSize:16, color:G.tx2, marginBottom:14 }}>
          <Flag country={gs.country}/> {gs.country} · {gs.year} · позади {plural(gs.turn, "ход", "хода", "ходов")} из {MAX_TURNS}
        </div>
        <div style={{ borderTop:`2px solid ${G.txt}`, paddingTop:8, marginBottom:12 }}>
          {gs.history.slice(-3).map((h, i) => (
            <div key={i} style={{ display:"flex", gap:10, padding:"6px 0", borderBottom:`1px dashed ${G.bdr2}` }}>
              <span style={{ fontFamily:mono, fontSize:12, color:G.tx3, paddingTop:4 }}>{h.year}</span>
              <div>
                <div style={{ fontFamily:narrow, fontWeight:700, fontSize:19, lineHeight:1.15 }}>{h.headline}</div>
                <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>ваша резолюция: {h.choice}</div>
              </div>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontFamily:pixel, fontSize:13, color:G.tx3, marginBottom:6 }}>НА СТОЛЕ СЕЙЧАС</div>
            {lines.map(([c, t], i) => <div key={i} style={{ fontFamily:narrow, fontSize:16, color:c, lineHeight:1.45 }}>· {t}</div>)}
          </div>
        )}
        <div style={{ textAlign:"right" }}><PrimaryBtn onClick={onClose}>ПРОДОЛЖИТЬ</PrimaryBtn></div>
      </div>
    </div>
  );
}

function HowToPlay({ onClose }) {
  const close = () => { try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* недоступно */ } onClose(); };
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const desktop = typeof matchMedia === "function" && matchMedia("(pointer:fine)").matches;
  const items = [
    ["Каждый ход — одно решение", `Под каждым вариантом — куда он потянет опоры: ▲ вырастет, ▼▼ сильно упадёт, — и насколько надёжно его исполнят. ${desktop ? "Наведите на вариант — точки на панели сверху покажут, что изменится." : "Первое касание покажет на панели сверху, что изменится, второе — подпишет решение."}`],
    ["Точные цифры — у советников", "Сколько именно стоит решение, каков шанс и что аукнется позже, знают только советники. Совет можно собрать несколько раз за правление — берегите его для трудных дел."],
    ["Не дайте ресурсам рухнуть", "Ниже 20 — кризис, 4 и ниже — падение власти. Легитимность на нуле — революция, враждебные силовики — переворот."],
    ["Выборы решают всё", "Парламентские на 10-м ходу, президентские на 20-м. Рейтинг — это отношение групп общества к вам плюс легитимность и экономика."],
    ["Люди — не копии своих лагерей", "У каждого свой характер. Друг во враждебном лагере станет «своим человеком», недруг среди союзников — «червоточиной». Союз с группой даёт доход и голоса, но нарушенное слово запоминают все."],
    ["Не верьте бумагам на слово", "Трижды за правление вам принесут доклад на подпись. Сверьте его со справкой: нашли ложь — отметьте строку и уличите автора. Подписанная ложь всплывёт позже. Дважды за правление звонят по защищённой линии: подход подбирайте по характеру собеседника. Перед парламентскими выборами — бюджет: разложите 10 млрд по статьям, а можно и занять. Перед выборами — пресс-конференция: на каждый ответ 15 секунд. В критический момент на решение даётся 25 секунд — иначе решат за вас."],
    ["Законы остаются", "Время от времени парламент вносит законопроект. Принятый закон ложится в «Свод законов» (в досье) и действует каждый ход, пока его не отменят: двигает опоры власти и отношение групп, приносит новые дела. Проведёт ли его парламент, зависит от вашей поддержки."],
    ["Вы обещали", "Перед первым ходом вы выбираете три предвыборных обещания. Исполненное поднимает доверие и отношение тех, кому вы его дали; нарушенное бьёт сильнее. Под вариантами видно, что приближает обещание, а что его нарушит. Прогресс — в досье."],
    ["У вас есть тайна", "В каждой партии развивается главная интрига. Эпизоды помечены «Главная интрига» — ваши решения в них определят развязку."],
    ...(desktop ? [["Клавиши", "1–9 — выбрать, Enter — подтвердить или дочитать, Esc — закрыть окно."]] : []),
  ];
  return (
    <div className="sv-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="sv-fade sv-paper" style={{ maxWidth:560, width:"100%", maxHeight:"90vh", overflowY:"auto", borderRadius:0, padding:"24px 24px 20px" }}>
        <div id="howto-title" style={{ fontFamily:serif, fontSize:28, fontWeight:700, color:G.txt, marginBottom:16 }}>Как править</div>
        {items.map(([h, t]) => (
          <div key={h} style={{ marginBottom:14 }}>
            <div style={{ fontFamily:narrow, fontSize:15, fontWeight:700, letterSpacing:".05em", color:G.gld2, marginBottom:3 }}>{h.toUpperCase()}</div>
            <div style={{ fontFamily:serif, fontSize:15, color:G.txt, lineHeight:1.55 }}>{t}</div>
          </div>
        ))}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontFamily:narrow, fontSize:15, fontWeight:700, letterSpacing:".05em", color:G.gld2, marginBottom:6 }}>ШЕСТЬ ОПОР ВЛАСТИ</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:"6px 14px" }}>
            {RES_CONFIG.map(r => (
              <div key={r.key} style={{ display:"flex", alignItems:"center", gap:8, fontFamily:narrow, fontSize:15, color:G.txt }}>
                <ResIcon k={r.key} size={22} value={60} color={G.txt}/>{r.prompt}
              </div>
            ))}
          </div>
          <div style={{ fontFamily:serif, fontSize:14, color:G.tx2, marginTop:6, lineHeight:1.5 }}>Значок заполняется по уровню опоры. Точка над ним при выборе — опора изменится: крупная точка — сильно. Нажмите на значок — увидите, что повлияет на опору в ближайшие ходы.</div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginTop:8, flexWrap:"wrap" }}>
          <SoundToggle/>
          <PrimaryBtn onClick={close}>ПОНЯТНО</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

function DailyCard({ meta, disabled, onPlay }) {
  const d = useMemo(() => dailyCase(), []);
  const done = meta.runs.find(r => r.daily === d.date);
  const [, mm, dd] = d.date.split("-");
  const [place, setPlace] = useState(null);
  useEffect(() => {
    if (!done) return;
    let live = true;
    fetchBoard(d.date).then(b => { if (live && b?.me) setPlace(b); });
    return () => { live = false; };
  }, [done, d.date]);
  return (
    <Card accent={done ? undefined : G.gold} style={{ marginBottom:22, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
      <div>
        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, letterSpacing:".05em", marginBottom:4 }}>ДЕЛО ДНЯ · {dd}.{mm}</div>
        <div style={{ fontFamily:serif, fontSize:17, color:G.txt }}>
          <Flag country={d.country}/> {d.country} · {DIFFICULTIES[d.diff].label.toLowerCase()} · {IDEOLOGIES.find(i => i.id === d.ideo)?.label.toLowerCase()}
        </div>
        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, marginTop:3 }}>
          {done ? `ваш итог: «${done.title}» · ${END_TYPES[done.endType]}${place ? ` · ${place.me.rank}-е место из ${place.total}` : ""}` : "одна партия на всех — сравните итог с друзьями"}
        </div>
      </div>
      {done
        ? <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>новое дело завтра</span>
        : <PrimaryBtn onClick={() => onPlay(d)} disabled={disabled}>ВЗЯТЬСЯ</PrimaryBtn>}
    </Card>
  );
}

function Archive({ meta }) {
  const [openList, setOpenList] = useState(false);
  const endings = new Set(Object.values(meta.endings).flat()).size;
  return (
    <Card style={{ marginBottom:22 }}>
      <button onClick={() => setOpenList(v => !v)} aria-expanded={openList}
        style={{ width:"100%", display:"flex", flexWrap:"wrap", gap:"4px 12px", justifyContent:"space-between", alignItems:"center", background:"transparent", border:"none", color:G.txt, padding:0, textAlign:"left" }}>
        <span style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx2, whiteSpace:"nowrap" }}>АРХИВ ПРАВИТЕЛЕЙ</span>
        <span style={{ fontFamily:narrow, fontSize:15, color:G.gold }}>
          партий {meta.runs.length} · концовок {endings}/{ALL_ENDINGS.length} · достижений {meta.achievements.length}/{ACHIEVEMENTS.length} {openList ? "▴" : "▾"}
        </span>
      </button>
      {openList && (
        <div className="sv-fade" style={{ marginTop:14 }}>
          {ACHIEVEMENTS.map(a => {
            const got = meta.achievements.includes(a.id);
            return (
              <div key={a.id} style={{ display:"flex", gap:10, marginBottom:6, opacity:got ? 1 : .5 }}>
                <span style={{ fontFamily:narrow, fontSize:15, color:got ? G.gold : G.tx3, minWidth:14 }}>{got ? "●" : "○"}</span>
                <span style={{ fontFamily:narrow, fontSize:15, color:got ? G.gld2 : G.tx2 }}>{a.title}</span>
                <span style={{ fontFamily:serif, fontSize:13, color:G.tx2 }}>{a.desc}</span>
              </div>
            );
          })}
          <div style={{ borderTop:`1px solid ${G.bdr}`, marginTop:10, paddingTop:10 }}>
            {meta.runs.slice(0, 6).map((r, i) => (
              <div key={`${r.seed}-${i}`} style={{ display:"flex", justifyContent:"space-between", gap:8, fontFamily:narrow, fontSize:15, color:G.tx2, marginBottom:4 }}>
                <span>{r.leader} — «{r.title}»{r.daily && <span style={{ color:G.gold }}> · дело дня</span>}</span>
                <span style={{ color:G.tx3, whiteSpace:"nowrap" }}>{END_TYPES[r.endType]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
// Пять касаний по номеру версии помечают устройство как тестовое: его действия не попадают в статистику.
function VersionLabel() {
  const taps = useRef(0);
  const [tester, setTester] = useState(() => isTester());
  const [note, setNote] = useState("");
  const tap = () => {
    taps.current += 1;
    if (taps.current < 5) return;
    taps.current = 0;
    const on = toggleTester();
    setTester(on);
    setNote(on ? "Тестовое устройство: партии не попадают в статистику" : "Статистика снова считает это устройство");
  };
  return (
    <div onClick={tap} style={{ fontFamily:mono, fontSize:11, color:G.tx3, textAlign:"center", marginTop:18, userSelect:"none" }}>
      v{APP_VERSION}{tester ? " · тест" : ""}{note && <div style={{ marginTop:4 }}>{note}</div>}
    </div>
  );
}

function Setup({ onStart, saved, onResume }) {
  const [country, setCountry] = useState(null);
  const [diff, setDiff]       = useState(null);
  const [ideo, setIdeo]       = useState(null);
  const [bio, setBio]         = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const metaRaw = useSyncExternalStore(subscribeMeta, readMetaRaw, () => null);
  const meta = useMemo(() => parseMeta(metaRaw), [metaRaw]);
  const open = unlockedCountries(meta);
  const ready = country && diff && ideo;

  const go = async (c = country, d = diff, i = ideo, daily = null, b = bio, quick = false) => {
    if (!(c && d && i) || loading) return;
    setLoading(true); setErr(null);
    try {
      // Биография: выбранная в анкете, у дела дня — общая для всех, иначе случайная.
      const B = daily ? BIOGRAPHIES[daily.seed % BIOGRAPHIES.length] : BIOGRAPHIES.find(x => x.id === b) ?? BIOGRAPHIES[Math.floor(Math.random() * BIOGRAPHIES.length)];
      const raw = await game.setup(c, d, i, daily?.seed);
      const intro = { ...raw, leader: { ...raw.leader, bio: B.text } };
      const st = createInitialState(c, d, i, intro, daily ? seededRandom(daily.seed) : Math.random, "classic", B.id);
      onStart(daily ? { ...st, daily: daily.date } : st, quick || !!daily);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Ошибка API. Попробуйте снова.");
      setLoading(false);
    }
  };

  const quick = () => {
    const pickOne = list => list[Math.floor(Math.random() * list.length)];
    go(pickOne(open), "coalition", pickOne(IDEOLOGIES).id, null, null, true);
  };

  // Строка анкеты: клетка для отметки, как в казённом бланке.
  const row = (active, locked = false) => ({
    display:"flex", alignItems:"center", gap:10, width:"100%", textAlign:"left", padding:"9px 6px", borderRadius:0,
    background:active ? G.bg3 : "transparent", border:"none", borderTop:`1px dashed ${G.bdr2}`, color:G.txt, opacity:locked ? .45 : 1,
  });
  const box = active => (
    <span aria-hidden="true" style={{ width:16, height:16, border:`2px solid ${G.txt}`, flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center", fontFamily:pixel, fontSize:13, lineHeight:1, color:G.red }}>{active ? "X" : ""}</span>
  );
  const scene = useMemo(() => ({ country: dailyCase().country, seed: 7, turn: 2, legitimacy: 48, rating: 44, military: 55, security: -10, crises: 0, election: false }), []);
  const explain = text => <div style={{ fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx2, lineHeight:1.45, margin:"0 0 8px" }}>{text}</div>;
  // Графа анкеты: название, суть и мелким шрифтом — что именно это меняет в игре.
  const option = (label, desc, effects) => (
    <span style={{ display:"flex", flexDirection:"column", gap:3, minWidth:0, flex:1, textAlign:"left" }}>
      <span style={{ display:"flex", flexWrap:"wrap", columnGap:10, alignItems:"baseline" }}>
        <span style={{ fontFamily:narrow, fontSize:18, fontWeight:700, lineHeight:1.15 }}>{label}</span>
        <span style={{ fontFamily:narrow, fontSize:15, lineHeight:1.25, color:G.tx2 }}>{desc}</span>
      </span>
      <span style={{ fontFamily:mono, fontSize:12, lineHeight:1.45, color:G.tx3 }}>{effects}</span>
    </span>
  );
  const section = (n, title) => <div style={{ fontFamily:pixel, fontSize:13, color:G.tx3, margin:"18px 0 6px" }}>{n}. {title}</div>;

  return (
    <div style={{ minHeight:"100vh" }}>
      <div className="sv-window"><SquareView scene={scene} height={56}/></div>
      <div style={{ display:"flex", justifyContent:"center", padding:"26px 16px 40px" }}>
      <div style={{ maxWidth:580, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:26 }}>
          <h1 style={{ fontFamily:narrow, fontWeight:700, fontSize:"clamp(56px, 17vw, 88px)", lineHeight:1, letterSpacing:".1em", color:G.gold, textShadow:"4px 4px 0 rgba(0,0,0,.45)" }}>СУВЕРЕН</h1>
          <div style={{ fontFamily:narrow, fontSize:19, color:G.tx2, marginTop:12 }}>Двадцать решений. Одна страна. Ни одного права на ошибку.</div>
        </div>

        {saved && (
          <Card style={{ marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontFamily:pixel, fontSize:13, color:G.tx3, marginBottom:4 }}>СОХРАНЁННАЯ ПАРТИЯ</div>
              <div style={{ fontFamily:serif, fontSize:17, color:G.txt }}>
                <Flag country={saved.state.country}/> {saved.state.leader.name}
              </div>
              <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, marginTop:2 }}>
                {saved.state.ended ? "правление завершено" : `ход ${saved.state.turn}/${MAX_TURNS} · ${saved.state.year}`}
              </div>
            </div>
            <PrimaryBtn onClick={onResume}>ПРОДОЛЖИТЬ</PrimaryBtn>
          </Card>
        )}


        <div style={{ textAlign:"center", marginBottom:22 }}>
          <PrimaryBtn onClick={quick} disabled={loading}>БЫСТРАЯ ПАРТИЯ</PrimaryBtn>
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:8 }}>случайная страна и курс · сложность «Коалиция»</div>
        </div>

        <DailyCard meta={meta} disabled={loading} onPlay={d => go(d.country, d.diff, d.ideo, d)}/>

        {meta.runs.length > 0 && <Archive meta={meta}/>}

        <Card style={{ padding:"18px 20px 22px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
            <div>
              <div style={{ fontFamily:mono, fontSize:12, color:G.tx3 }}>Форма № 1-П · ЦИК</div>
              <div style={{ fontFamily:narrow, fontWeight:700, fontSize:26, lineHeight:1.1, marginTop:4 }}>Анкета кандидата</div>
            </div>
            <span className="sv-stamp" style={{ fontSize:12, transform:"rotate(4deg)" }}>своя партия</span>
          </div>

          {section(1, "СТРАНА")}
          {Object.keys(COUNTRIES).map(name => {
            const active = country === name;
            const locked = !open.includes(name);
            const endings = meta.endings[name]?.length ?? 0;
            return (
              <button key={name} onClick={() => !locked && setCountry(name)} disabled={locked} aria-pressed={active} style={row(active, locked)}
                title={locked ? "Откроется после первой завершённой партии" : `Открыто концовок: ${endings}/${ALL_ENDINGS.length}`}>
                {box(active)}
                <Flag country={name} size={21}/>
                <span style={{ fontFamily:narrow, fontSize:18, fontWeight:700, flex:1 }}>{name}</span>
                <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>
                  {locked ? "закрыто" : endings > 0 ? `концовок ${endings}/${ALL_ENDINGS.length}` : ""}
                </span>
              </button>
            );
          })}
          {country && <div className="sv-fade" style={{ fontFamily:mono, fontSize:13, color:G.tx2, lineHeight:1.6, padding:"10px 6px 2px", borderTop:`1px dashed ${G.bdr2}` }}>{COUNTRIES[country].context}</div>}

          {section(2, "СЛОЖНОСТЬ")}
          {explain("С чего вы начинаете: сколько ресурсов у государства, как к вам относятся группы и сколько страна теряет каждый ход без вашего участия.")}
          {Object.entries(DIFFICULTIES).map(([id, d]) => (
            <button key={id} onClick={() => setDiff(id)} aria-pressed={diff === id} style={row(diff === id)}>
              {box(diff === id)}
              {option(d.label, d.desc, difficultyEffects(id))}
            </button>
          ))}

          {section(3, "ПОЛИТИЧЕСКИЙ КУРС")}
          {explain("Кто поддерживает вас с первого дня и какие решения укрепляют вас лично. Решение в духе курса добавляет личный ресурс и легитимность, решение против курса их отнимает.")}
          {IDEOLOGIES.map(i => (
            <button key={i.id} onClick={() => setIdeo(i.id)} aria-pressed={ideo === i.id} style={row(ideo === i.id)}>
              {box(ideo === i.id)}
              {option(i.label, i.desc, ideologyEffects(i.id, country))}
            </button>
          ))}

          {section(4, "БИОГРАФИЯ — НЕОБЯЗАТЕЛЬНО")}
          {explain("Ваше прошлое ремесло: решения по нему исполняются надёжнее, а одна из опор крепче с самого начала. Не выберете — достанется случайная.")}
          {BIOGRAPHIES.map(b => (
            <button key={b.id} onClick={() => setBio(x => x === b.id ? null : b.id)} aria-pressed={bio === b.id} style={row(bio === b.id)}>
              {box(bio === b.id)}
              {option(b.label, b.text, b.note)}
            </button>
          ))}

          {err && <div style={{ fontFamily:mono, color:G.red, fontSize:12, margin:"12px 0 0" }}>{err}</div>}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginTop:18, paddingTop:14, borderTop:`2px solid ${G.txt}` }}>
            <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{saved ? "Новая партия заменит сохранённую" : ready ? "Документы в порядке" : "Отметьте по одной графе в каждом разделе"}</span>
            <PrimaryBtn onClick={() => go()} disabled={!ready || loading}>{loading ? "ОФОРМЛЯЕМ…" : "ПОДАТЬ ДОКУМЕНТЫ"}</PrimaryBtn>
          </div>
        </Card>
        <VersionLabel/>
      </div>
      </div>
    </div>
  );
}

// ── INTRO ─────────────────────────────────────────────────────────────────────
// Кому дано обещание: группы этого блока в стране.
const promisedTo = (gs, def) => gs.factions.filter(f => f.bloc === def.bloc).map(f => `«${f.name}»`).join(", ");

// Первый день в кабинете: кто вы и что обещали — вместо длинного досье перед игрой.
function BriefCard({ gs }) {
  const ci = IDEOLOGIES.find(i => i.id === gs.ideo);
  const titles = (gs.promises ?? []).map(p => promiseDef(p.id)?.title).filter(Boolean);
  return (
    <div className="sv-paper sv-fade" style={{ marginBottom:10, padding:"12px 16px", display:"flex", gap:12, alignItems:"center" }}>
      <Portrait name={gs.leader.name} size={44}/>
      <div style={{ minWidth:0 }}>
        <div style={{ fontFamily:pixel, fontSize:12, color:G.tx3, marginBottom:3 }}>ПЕРВЫЙ ДЕНЬ В КАБИНЕТЕ</div>
        <div style={{ fontFamily:serif, fontSize:15, color:G.txt, lineHeight:1.5 }}>
          Вы — <b>{gs.leader.name}</b>, президент. <Flag country={gs.country}/> {gs.country}, курс — {ci?.label.toLowerCase()}.
          {titles.length > 0 && <> Вы обещали избирателям: {titles.map(t => `«${t}»`).join(", ")}.</>}
        </div>
      </div>
    </div>
  );
}

// Предвыборная программа: из пяти обещаний лидер берёт три. Подсказанные — в духе курса.
function PromisePicker({ gs, offered, picked, setPicked }) {
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length < PROMISE_PICK ? [...p, id] : p);
  return (
    <Card style={{ marginBottom:22 }}>
      <Label>{"ПРЕДВЫБОРНАЯ ПРОГРАММА"}</Label>
      <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, lineHeight:1.6, marginBottom:8 }}>
        Отметьте {PROMISE_PICK} обещания, с которыми вы шли на выборы. Исполненное укрепит доверие и тех, кому вы его дали. Нарушенное обойдётся дороже, чем кажется.
      </div>
      {offered.map(id => {
        const def = promiseDef(id), on = picked.includes(id), full = !on && picked.length >= PROMISE_PICK;
        const to = promisedTo(gs, def);
        return (
          <button key={id} onClick={() => toggle(id)} aria-pressed={on} disabled={full}
            style={{ display:"flex", gap:12, alignItems:"flex-start", width:"100%", textAlign:"left", padding:"10px 4px", background:on ? G.bg3 : "transparent", border:"none", borderTop:`1px dashed ${G.bdr2}`, color:G.txt, opacity:full ? .5 : 1 }}>
            <span aria-hidden="true" style={{ width:16, height:16, marginTop:3, border:`2px solid ${G.txt}`, flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center", fontFamily:pixel, fontSize:13, lineHeight:1, color:G.red }}>{on ? "X" : ""}</span>
            <span style={{ minWidth:0 }}>
              <span style={{ display:"block", fontFamily:narrow, fontSize:17, fontWeight:700 }}>{def.title}</span>
              <span style={{ display:"block", fontFamily:serif, fontSize:15, fontStyle:"italic", color:G.tx2, lineHeight:1.45 }}>«{def.pitch}»</span>
              <span style={{ display:"block", fontFamily:mono, fontSize:12, color:G.tx3, lineHeight:1.5, marginTop:3 }}>условие: {promiseGoalText(def, def.goal.kind === "resource" ? Math.min(95, gs.resources[def.goal.key] + def.goal.rise) : undefined)}{to ? ` · обещано: ${to}` : ""}</span>
            </span>
          </button>
        );
      })}
    </Card>
  );
}

// Обещания в досье: что сделано и сколько осталось.
function PromisesCard({ gs, final = false, style }) {
  if (!gs.promises?.length) return null;
  return (
    <Card style={{ marginTop:10, ...style }}>
      <Label>{"ОБЕЩАНИЯ"}</Label>
      {gs.promises.map(p => {
        const def = promiseDef(p.id);
        if (!def) return null;
        const g = def.goal;
        const mark = p.status === "kept" ? ["✔", G.grn] : p.status === "broken" ? ["✖", G.red] : ["☐", G.tx2];
        const left = p.status === "open" ? final ? "не успели" : (g.kind === "tags" ? `${p.progress}/${g.count}` : g.kind === "never" ? "держитесь" : `${gs.resources[g.key]} из ${p.target}`) : p.status === "kept" ? "исполнено" : "нарушено";
        return (
          <div key={p.id} title={promiseGoalText(def, p.target)} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"5px 0", borderTop:`1px dashed ${G.bdr}`, fontFamily:narrow, fontSize:15 }}>
            <span style={{ color:mark[1], minWidth:0 }}>{mark[0]} {def.title}</span>
            <span style={{ color:G.tx3, whiteSpace:"nowrap" }}>{left}{p.status === "open" && def.due === 10 ? " · до 10 хода" : ""}</span>
          </div>
        );
      })}
    </Card>
  );
}

function Intro({ gs, onGo }) {
  const tg = useTelegramButtons();
  const { offered, suggested } = useMemo(() => offeredPromises(gs.seed, gs.ideo), [gs.seed, gs.ideo]);
  const [picked, setPicked] = useState(suggested);
  const ready = picked.length === PROMISE_PICK;
  const go = useCallback(() => { if (ready) onGo(picked); }, [ready, picked, onGo]);
  useEffect(() => {
    if (!tg) return;
    setMainButton({ text: ready ? "Приступить к управлению →" : `Отметьте ещё ${PROMISE_PICK - picked.length}`, onClick: go });
    return () => setMainButton(null);
  }, [tg, go, ready, picked.length]);
  const { country, ideo, leader, speech, situation, keyFigures } = gs;
  const ci = IDEOLOGIES.find(i => i.id === ideo);
  const relC = l => l === "союзник" ? G.grn : l === "враг" ? G.red : G.tx3;
  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"28px 16px" }}>
      <div style={{ maxWidth:660, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3, marginBottom:12 }}><Flag country={country}/> {country.toUpperCase()} · НОВОЕ РУКОВОДСТВО</div>
          <Divider/>
        </div>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:12, fontFamily:mono, fontSize:12, color:G.tx3, marginBottom:12, flexWrap:"wrap" }}>
            <span>Личное дело № {docNumber(gs)}</span><span>{COUNTRIES[country].startYear}</span>
          </div>
          <Portrait name={leader.name} size={100} style={{ float:"right", margin:"0 0 10px 16px", transform:"rotate(2deg)" }}/>
          <div style={{ fontFamily:narrow, fontSize:42, fontWeight:700, color:G.txt, lineHeight:1.12, marginBottom:6, textWrap:"balance" }}>{leader.name}</div>
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, marginBottom:10 }}>Президент · партия {leader.party} · {ci.label.toLowerCase()}</div>
          <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, fontStyle:"italic", lineHeight:1.7 }}>{leader.bio}</div>
          {BIOGRAPHIES.find(b => b.id === gs.bio) && (
            <div style={{ fontFamily:narrow, fontSize:15, color:G.grn, marginTop:4 }}>
              {BIOGRAPHIES.find(b => b.id === gs.bio).label}: {BIOGRAPHIES.find(b => b.id === gs.bio).note}
            </div>
          )}
          <div style={{ clear:"both" }}/>
        </Card>
        {speech && (
          <Card accent={G.blue} style={{ marginBottom:12 }}>
            <Label>{"ОБРАЩЕНИЕ К НАЦИИ"}</Label>
            <div style={{ fontFamily:serif, fontSize:16, fontStyle:"italic", lineHeight:1.8, color:G.txt }}>«{speech}»</div>
          </Card>
        )}
        {gs.arc && (
          <Card style={{ marginBottom:12, transform:"rotate(-0.4deg)" }}>
            <span className="sv-stamp is-red" style={{ fontSize:14, marginBottom:12 }}>Совершенно секретно</span>
            <div className="sv-hand" style={{ fontSize:24, lineHeight:1.35 }}>{ARCS.find(a => a.id === gs.arc.id)?.teaser}</div>
          </Card>
        )}
        {situation && (
          <Card accent={G.red} style={{ marginBottom:12 }}>
            <Label>{"ОПЕРАТИВНАЯ ОБСТАНОВКА"}</Label>
            <div style={{ fontFamily:serif, fontSize:15, lineHeight:1.75, color:G.txt }}>{situation}</div>
          </Card>
        )}
        {keyFigures?.length > 0 && (
          <Card style={{ marginBottom:22 }}>
            <Label>{"КЛЮЧЕВЫЕ ИГРОКИ"}</Label>
            {keyFigures.map((f, i) => (
              <div key={f.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<keyFigures.length-1?`1px solid ${G.bdr}`:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                  <Portrait name={f.name} size={38}/>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontFamily:serif, fontSize:16, fontWeight:700 }}>{f.name}</div>
                    <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{f.role}</div>
                  </div>
                </div>
                <span style={{ fontFamily:narrow, fontSize:15, color:relC(f.loyalty), letterSpacing:".05em" }}>{f.loyalty?.toUpperCase()}</span>
              </div>
            ))}
          </Card>
        )}
        {gs.advisors?.length > 0 && (
          <Card style={{ marginBottom:22 }}>
            <Label>{"ВАШ СОВЕТ"}</Label>
            {gs.advisors.map((a, i) => (
              <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<gs.advisors.length-1?`1px solid ${G.bdr}`:"none" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                  <Portrait name={a.name} size={38}/>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontFamily:serif, fontSize:16, fontWeight:700 }}>{a.name}</div>
                    <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{a.role}</div>
                  </div>
                </div>
                <span style={{ fontFamily:narrow, fontSize:15, color:G.gold }} title={ADVISOR_SKILL[a.skill].label}>{stars(a.skill)}</span>
              </div>
            ))}
            <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:10 }}>
              Совет можно собрать {plural(gs.councilCharges, "раз", "раза", "раз")} за мандат · победа на парламентских выборах даёт ещё один
            </div>
          </Card>
        )}
        <PromisePicker gs={gs} offered={offered} picked={picked} setPicked={setPicked}/>
        <div style={{ textAlign:"center" }}><PrimaryBtn onClick={go} disabled={!ready}>{ready ? "ПРИСТУПИТЬ К УПРАВЛЕНИЮ →" : `ОТМЕТЬТЕ ЕЩЁ ${PROMISE_PICK - picked.length}`}</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── GAME ──────────────────────────────────────────────────────────────────────
function Game({ gs, setGs, onEnd, onMenu, recap, onRecapDone }) {
  const needsEvent = !gs.ended && !gs.currentEvent && !gs.lastTurn;
  const [busy, setBusy]       = useState(needsEvent ? "event" : null); // "event" | "choice" | null
  const [error, setError]     = useState(null); // { message, choice? }
  const [sideTab, setSideTab] = useState("res");
  const [preview, setPreview] = useState(null); // вариант под курсором/фокусом
  const [armed, setArmed]     = useState(null); // тач: первое касание выбирает, второе — подписывает
  const [help, setHelp]       = useState(false);
  const [tips] = useState(() => !tutorialSeen()); // подсказки на первых ходах — пока правила не прочитаны
  const gsRef = useRef(gs);
  const startedAt = useRef(0); // когда открылся первый ход — для времени до первого решения
  useEffect(() => { if (gsRef.current?.turn === 0) startedAt.current = nowMs(); }, []);
  const inFlight = useRef(false);
  const [stamping, setStamping] = useState(null); // резолюция, на которую опускается печать
  const [dossier, setDossier] = useState(false);   // телефон: досье под игрой свёрнуто
  const [marked, setMarked] = useState(null);       // проверка документа: отмеченная строка
  const [resolutionInView, setResolutionInView] = useState(false);
  useEffect(() => { gsRef.current = gs; }, [gs]);

  const [attempt, setAttempt] = useState(0);
  const [typedTurn, setTypedTurn] = useState(null);
  const typed = typedTurn === gs.turn;
  const [countedTurn, setCountedTurn] = useState(null); // ночь выборов: подсчёт перед газетой
  const [urgentTurn, setUrgentTurn] = useState(null);   // срочное дело: отсчёт пошёл
  const [autoTurn, setAutoTurn] = useState(null);       // срочное дело: решили за вас
  const counted = !gs.lastTurn?.election || countedTurn === gs.turn;
  // Новое дело и газета открываются сверху: с окна на площадь, а не с середины листа.
  const sheet = gs.currentEvent ? `e${gs.turn}` : gs.lastTurn ? `r${gs.turn}` : "";
  useEffect(() => { if (sheet) window.scrollTo({ top: 0 }); }, [sheet]);
  const prefetch = useRef(null); // следующее событие грузится, пока игрок читает итог
  const commit = useCallback(next => { gsRef.current = next; setGs(next); }, [setGs]);

  // Новое событие запрашивается, когда его нет и отчёт о прошлом ходе уже закрыт.
  useEffect(() => {
    if (!needsEvent) return;
    let cancelled = false;
    const pf = prefetch.current;
    prefetch.current = null;
    const request = pf && pf.turn === gsRef.current.turn ? pf.promise : game.event(gsRef.current);
    request.then(
      event => {
        if (cancelled) return;
        commit(startEvent(gsRef.current, event));
        setError(null);
        setBusy(null);
      },
      e => {
        if (cancelled) return;
        console.error(e);
        setError({ message: e.message });
        setBusy(null);
      },
    );
    return () => { cancelled = true; };
  }, [needsEvent, attempt, commit]);

  const retryEvent = () => { setBusy("event"); setError(null); setAttempt(a => a + 1); };

  const choose = async (choice) => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setStamping(choice.id);
    stampFx();
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) await new Promise(r => setTimeout(r, 480));
    setStamping(null);
    setBusy("choice"); setError(null);
    try {
      const consequence = await game.consequence(gsRef.current, choice.id);
      const next = resolveTurn(gsRef.current, choice.id, consequence);
      commit(next);
      track("turn", { n: next.turn });
      if (next.turn === 1 && startedAt.current) {
        const sec = (nowMs() - startedAt.current) / 1000;
        track("first", { sec: sec < 30 ? "до 30 с" : sec < 60 ? "30-60 с" : sec < 120 ? "1-2 мин" : sec < 300 ? "2-5 мин" : "больше 5 мин" });
      }
      if (next.turn >= TIP_TURNS.length) { try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* недоступно */ } }
      if (next.lastTurn && next.lastTurn.chance < 1) outcomeFx(next.lastTurn.success !== false);
      if (!next.ended) {
        const promise = game.event(next);
        promise.catch(() => {}); // ошибку покажет обычная загрузка события
        prefetch.current = { turn: next.turn, promise };
      }
    } catch (e) {
      console.error(e);
      setError({ message: e.message, choice });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const nextTurn = () => {
    setBusy("event"); setError(null); setPreview(null); setArmed(null); setMarked(null);
    pageFx();
    commit({ ...gsRef.current, lastTurn: null });
  };

  // Клавиши: 1–9 — фокус на вариант (с предпросмотром), Enter — подтвердить / следующий ход.
  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.("input, textarea") || document.querySelector(".sv-modal")) return;
      if (/^[1-9]$/.test(e.key)) {
        const el = document.getElementById(`opt-${e.key}`);
        if (el) { el.focus(); e.preventDefault(); }
      } else if (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") {
        document.getElementById("next-turn")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Выбор резолюции: на касании первое нажатие выбирает (с предпросмотром), второе — подписывает.
  const pick = (c, preview = true) => {
    if (armed !== c.id && matchMedia("(pointer:coarse)").matches) { setArmed(c.id); setPreview(preview ? c : null); return; }
    setArmed(null); choose(c);
  };
  const optProps = (c, n) => ({
    id: `opt-${n}`,
    className: "sv-opt",
    "data-armed": armed === c.id || undefined,
    onClick: () => pick(c),
    // Наведение — только для мыши: на касании браузер шлёт «уход курсора» сразу после выбора.
    onPointerEnter: e => { if (e.pointerType === "mouse") setPreview(c); },
    onPointerLeave: e => { if (e.pointerType === "mouse") setPreview(null); },
    onFocus: () => setPreview(c), onBlur: () => { setPreview(null); setArmed(null); },
  });

  const { resources, prevResources, factions, prevFactions, keyFigures, prevFigures, turn, history, activeCrises, currentEvent: event, lastTurn } = gs;
  // Видна ли резолюция на экране — тогда нижней кнопке «К резолюции» показываться незачем.
  // Проверяем при прокрутке: резолюция уже на экране или проскроллена выше.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = document.getElementById("sv-resolution");
      setResolutionInView(!!el && el.getBoundingClientRect().top < window.innerHeight * 0.65);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [event, busy]);
  // Срочное дело: власть под угрозой — на резолюцию 25 секунд с момента, как варианты на экране.
  const urgent = !!event && event.isCritical && !event.beat && !event.special && !recap && !busy;
  if (urgent && resolutionInView && urgentTurn !== gs.turn) setUrgentTurn(gs.turn);
  const timeUp = () => {
    const ev = gsRef.current.currentEvent;
    if (!ev || inFlight.current) return;
    setAutoTurn(gsRef.current.turn + 1);
    choose(ev.choices.find(c => c.tags.includes("delay")) ?? ev.choices[ev.choices.length - 1]);
  };
  const armedChoice = armed && event ? [...event.choices, ...(event.council ?? [])].find(c => c.id === armed) : null;
  const warnLevel = warningLevel(gs);
  const turnDelta = lastTurn && prevResources
    ? Object.fromEntries(RES_CONFIG.map(r => [r.key, resources[r.key] - prevResources[r.key]]))
    : null;

  const tabs = [
    { id:"res", label:"Ресурсы", title:"Ресурсы государства" },
    { id:"fac", label:"Силы", title:"Фракции и группы общества" },
    { id:"fig", label:"Люди", title:"Ключевые игроки" },
    { id:"log", label:"Хроника", title:"Хроника правления" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:G.bg }}>
      <div className="sv-window"><SquareView gs={gs}/></div>
      <Hud gs={gs} preview={busy ? null : preview} onMenu={onMenu} onHelp={() => { setHelp(true); track("help"); }}/>
      {help && <HowToPlay onClose={() => setHelp(false)}/>}
      {recap && <Recap gs={gs} onClose={onRecapDone}/>}
      <div style={{ display:"flex", justifyContent:"center", padding:"14px" }}>
      <div className="sv-game-grid" style={{ maxWidth:1080, width:"100%", display:"grid", gridTemplateColumns:"260px minmax(0, 1fr)", gap:14 }}>

        <div className="sv-sidebar" data-open={dossier || undefined}>
          <button className="sv-dossier-toggle" onClick={() => setDossier(v => !v)} aria-expanded={dossier}>
            {dossier ? "Свернуть досье ▴" : "Досье ▾ опрос, ресурсы, люди, хроника"}
          </button>
          <div className="sv-side-body">
          <PollWidget gs={gs}/>
          <PromisesCard gs={gs}/>
          <LawsCard gs={gs}/>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:4, margin:"10px 0 6px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setSideTab(t.id)} title={t.title} aria-label={t.title}
                style={{ padding:"7px 0", borderRadius:0, border:`1px solid ${sideTab===t.id?G.gold:G.bdr}`, background:sideTab===t.id?G.bg3:G.bg2, color:sideTab===t.id?G.gold:G.tx3, fontSize:15 }}>
                {t.label}
              </button>
            ))}
          </div>

          <Card style={{ minHeight:200 }}>
            {sideTab === "res" && (
              <>
                <Label>{"РЕСУРСЫ"}</Label>
                {RES_CONFIG.map(r => <ResBar key={r.key} k={r.key} label={SHORT[r.key]} val={resources[r.key]} prev={prevResources?prevResources[r.key]:undefined}/>)}
                <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:10, lineHeight:1.6 }}>
                  ниже 20 — кризис · ≤ {LIMITS.endResource} — падение власти<br/>ниже 30 — понемногу восстанавливается
                </div>
                {gs.pending?.length > 0 && (
                  <div style={{ marginTop:14, paddingTop:10, borderTop:`1px solid ${G.bdr}` }}>
                    <Label>{"ОЖИДАЕТСЯ"}</Label>
                    {[...gs.pending].sort((a, b) => a.due - b.due).map(p => {
                      const good = Object.values(p.res).reduce((a, b) => a + (b ?? 0), 0) >= 0;
                      const fx = RES_CONFIG.filter(r => p.res[r.key]).map(r => `${SHORT[r.key].toLowerCase()} ${signed(p.res[r.key])}`).join(", ");
                      return (
                        <div key={p.id} style={{ fontFamily:narrow, fontSize:15, lineHeight:1.5, marginBottom:7, color:G.tx2 }}>
                          <span style={{ color:G.tx3 }}>через {p.due - turn} · </span>{p.label}
                          <div style={{ color:good ? G.grn : G.red }}>{fx}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {sideTab === "fac" && (
              <>
                <Label>{"ОТНОШЕНИЕ К ВАМ"}</Label>
                {(() => {
                  const voters = factions.filter(f => !NON_VOTING_BLOCS.includes(f.bloc));
                  const total = voters.reduce((s, f) => s + f.approval, 0) || 1;
                  return factions.map(f => {
                    const prev = prevFactions?.find(p => p.id === f.id);
                    const foreign = NON_VOTING_BLOCS.includes(f.bloc);
                    return (
                      <div key={f.id} style={{ marginBottom:10 }}>
                        <RelBar label={f.name} val={f.relation} prevVal={prev?.relation}/>
                        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:-4 }}>
                          {foreign ? "внешняя сила · не голосует" : `${Math.round(f.approval / total * 100)}% избирателей`}
                          {f.relation <= -60 && <span style={{ color:G.red }}> · враждебна, вредит</span>}
                        </div>
                      </div>
                    );
                  });
                })()}
                <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:6, lineHeight:1.6 }}>шкала −100…+100 · ≤ −60 — вредит каждый ход</div>
              </>
            )}
            {sideTab === "fig" && (
              <>
                <Label>{"КЛЮЧЕВЫЕ ИГРОКИ"}</Label>
                {keyFigures.map(f => {
                  const prev = prevFigures?.find(p => p.id === f.id && p.name === f.name);
                  const c = relColor(f.relation);
                  const delta = prev ? f.relation - prev.relation : 0;
                  const fac = factions.find(x => x.id === f.faction);
                  const bond = bondOf(f, fac);
                  return (
                    <div key={f.id} style={{ display:"flex", gap:10, marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${G.bdr}` }}>
                      <Portrait name={f.name} size={32}/>
                      <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontFamily:serif, fontSize:13, fontWeight:500 }}>{f.name}</span>
                        <span style={{ fontFamily:narrow, fontSize:15, color:c }}>
                          <span style={{ color:G.tx3 }}>лично </span>{signed(f.relation)}
                          {delta!==0&&<span style={{ marginLeft:3, color:delta>0?G.grn:G.red }}>{signed(delta)}</span>}
                        </span>
                      </div>
                      <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:2 }}>{f.role} · {TRAITS[traitOf(gs.seed, f, fac?.bloc)].label}</div>
                      <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>
                        лагерь «{fac?.name}» <span style={{ color:relColor(fac?.relation ?? 0) }}>{signed(fac?.relation ?? 0)}</span>
                        {(bond === "insider" || bond === "mole") && <b style={{ color: bond === "insider" ? G.grn : G.red }}> · {BOND_LABEL[bond]}</b>}
                      </div>
                      <div style={{ height:2, background:G.bdr, borderRadius:0, marginTop:4 }}>
                        <div style={{ height:"100%", width:`${((f.relation+100)/200)*100}%`, background:c, borderRadius:0, transition:"all .6s" }}/>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {sideTab === "log" && (
              <>
                <Label>{"ХРОНИКА"}</Label>
                {history.length === 0 && <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>История пуста</div>}
                {[...history].reverse().slice(0,6).map((h, i) => (
                  <div key={i} style={{ marginBottom:8, paddingBottom:8, borderBottom:i<5?`1px solid ${G.bdr}`:"none" }}>
                    <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{h.year}</div>
                    <div style={{ fontFamily:serif, fontSize:12, color:G.tx2, fontStyle:"italic", lineHeight:1.4 }}>«{h.headline}»</div>
                  </div>
                ))}
              </>
            )}
          </Card>
          </div>
        </div>

        <div className="sv-main">
          {gs.turn === 0 && !busy && <BriefCard gs={gs}/>}
          {warnLevel !== "none" && !busy && !gs.ended && (
            <div className="sv-paper sv-citation" style={{ marginBottom:10, padding:"9px 16px" }}>
              <span style={{ fontFamily:pixel, fontSize:13, color:"var(--red)", marginRight:8 }}>{warnLevel==="critical" ? "ПРЕДУПРЕЖДЕНИЕ" : "ЗАМЕЧАНИЕ"}</span>
              <span style={{ fontFamily:narrow, fontSize:15, color:G.txt }}>
                {warnLevel==="critical" ? "Власть под серьёзной угрозой. Следующее решение может стать последним." : "Положение ослаблено. Действуйте осторожно."}
              </span>
            </div>
          )}

          {error && !busy && (
            <ErrorBanner message={error.message} onRetry={error.choice ? () => choose(error.choice) : retryEvent}/>
          )}

          {activeCrises?.length > 0 && !busy && (
            <div style={{ marginBottom:10 }}>
              {activeCrises.map(c => (
                <div key={c.id} className="sv-paper sv-citation" style={{ marginBottom:6, padding:"10px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                    <span style={{ fontFamily:pixel, fontSize:13, color:G.red }}>КРИЗИС · {c.title.toUpperCase()}</span>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3, whiteSpace:"nowrap" }}>{c.severity} · {plural(c.turnsActive, "ход", "хода", "ходов")}</span>
                  </div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, marginTop:4, fontStyle:"italic" }}>{c.description}</div>
                  {Object.keys(c.resourceDrain||{}).length > 0 && <div style={{ marginTop:6 }}><ResourceChips delta={c.resourceDrain}/></div>}
                </div>
              ))}
            </div>
          )}

          {!busy && event && <PactSlips gs={gs}/>}

          {busy && <Loading kind={busy}/>}

          {!busy && event && (
            <div>
              {event.randomEvent && (
                <div style={{ marginBottom:10, padding:"10px 14px", borderRadius:0, background:"rgba(74,122,170,0.1)", border:`1px solid ${G.blue}` }}>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.bl2, letterSpacing:".05em", marginBottom:4 }}>ВНЕЗАПНО</div>
                  <div style={{ fontFamily:serif, fontSize:14, fontWeight:500, color:G.txt, marginBottom:3 }}>{event.randomEvent.title}</div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic", marginBottom:6 }}>{event.randomEvent.description}</div>
                  <ResourceChips delta={event.randomEvent.resourceEffect}/>
                </div>
              )}
              <Card style={{ marginBottom:14, padding:"20px 24px 22px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"8px 12px", marginBottom:14, flexWrap:"wrap" }}>
                  <div style={{ fontFamily:mono, fontSize:12, color:G.tx3, lineHeight:1.6, whiteSpace:"nowrap" }}>
                    <div>{event.source || "Служебная записка"}</div>
                    <div>Экз. № 1 · вх. № {docNumber(gs)}</div>
                  </div>
                  {(event.beat || event.isCritical) && <span className="sv-stamp is-red" style={{ fontSize:14, flexShrink:0 }}>{event.beat ? "Совершенно секретно" : "Срочно"}</span>}
                  {event.special && !event.beat && !event.isCritical && <span className="sv-stamp" style={{ fontSize:14, flexShrink:0 }}>{{ pact:"Проект договора", inspect:"На подпись", press:"Пресс-служба", call:"Без протокола", budget:"Финансы" }[event.special.kind] ?? "Лично в руки"}</span>}
                </div>
                {(turn + 1) % 5 === 1 && (
                  <div style={{ margin:"4px 0 18px", paddingBottom:14, borderBottom:`1px solid ${G.bdr}` }}>
                    <div style={{ fontFamily:narrow, fontSize:15, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:G.tx3 }}>Глава {ROMAN[chapterOf(turn + 1)]}</div>
                    <div style={{ fontFamily:serif, fontSize:22, fontStyle:"italic", color:G.tx2 }}>{CHAPTERS[chapterOf(turn + 1)]}</div>
                  </div>
                )}
                {event.beat && (
                  <div style={{ fontFamily:narrow, fontSize:15, fontWeight:700, color:G.red, marginBottom:4 }}>
                    Главная интрига «{event.beat.arcTitle}» · эпизод {event.beat.episode} из {event.beat.total}
                  </div>
                )}
                <h2 style={{ fontFamily:serif, fontSize:28, fontWeight:700, color:G.txt, lineHeight:1.2, marginBottom:12, textWrap:"balance" }}>{event.title}</h2>
                {sceneOf(event) !== "square" && (
                  <figure className="sv-scene" style={{ margin:"0 0 16px", border:`2px solid ${G.txt}`, boxShadow:"var(--hard)" }}>
                    <SquareView gs={gs} sceneKey={sceneOf(event)} partner={event.source === "Кремль" ? "ru" : "eu"} height={44}/>
                  </figure>
                )}
                {event.special && <SpecialHeader gs={gs} event={event}/>}
                <Prose text={event.description}/>
                {event.affectedFactions?.length > 0 && (
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:10 }}>
                    Касается: {event.affectedFactions.map(fid => factions.find(x => x.id === fid)?.name).filter(Boolean).join(", ")}
                  </div>
                )}
              </Card>
              {event.doc && <InspectDoc doc={event.doc} marked={marked} onMark={setMarked}/>}
              {event.budget ? (
                <BudgetPanel key={`budget${turn}`} gs={gs} stamping={stamping}
                  onSkip={() => choose(event.choices[1])}
                  onFinish={(alloc, debt) => {
                    const final = budgetChoice(gsRef.current, alloc, debt);
                    const cur = gsRef.current.currentEvent;
                    commit({ ...gsRef.current, currentEvent: { ...cur, choices: [final, cur.choices[1]] } });
                    choose(final);
                  }}/>
              ) : event.call ? (
                <CallPanel key={`call${turn}`} call={event.call} seed={gs.seed} stamping={stamping}
                  onHang={() => choose(event.choices[1])}
                  onFinish={(approach, ending) => {
                    const final = callChoice(gsRef.current, approach, ending);
                    const cur = gsRef.current.currentEvent;
                    commit({ ...gsRef.current, currentEvent: { ...cur, choices: [final, cur.choices[1]] } });
                    choose(final);
                  }}/>
              ) : event.press ? (
                <PressPanel key={`press${turn}`} press={event.press} stamping={stamping}
                  onSkip={() => choose(event.choices[1])}
                  onFinish={picks => {
                    const final = pressChoice(gsRef.current, picks);
                    const cur = gsRef.current.currentEvent;
                    commit({ ...gsRef.current, currentEvent: { ...cur, choices: [final, cur.choices[1]] } });
                    choose(final);
                  }}/>
              ) : (
              <Card style={{ padding:"18px 0 8px" }}>
                <div id="sv-resolution" style={{ padding:"0 24px" }}><Label>{"Резолюция"}</Label></div>
                {tips && TIP_TURNS[gs.turn] && (
                  <div className="sv-fade" style={{ margin:"-4px 24px 12px", padding:"8px 12px", borderLeft:`3px solid var(--blue)`, background:G.bg3, fontFamily:narrow, fontSize:15, color:G.tx2, lineHeight:1.45 }}>
                    {TIP_TURNS[gs.turn]}
                  </div>
                )}
                {urgent && (
                  <div style={{ padding:"0 24px 12px" }}>
                    <div style={{ fontFamily:pixel, fontSize:13, color:G.red, marginBottom:6 }}>СРОЧНО: 25 СЕКУНД — ИНАЧЕ РЕШАТ ЗА ВАС</div>
                    <div style={{ height:6, background:G.bdr }}>
                      {urgentTurn === turn && <div key={`u${turn}`} className="sv-timer" style={{ height:"100%", background:G.red, animationDuration:"25s" }} onAnimationEnd={timeUp}/>}
                    </div>
                  </div>
                )}
                {(event.doc ? event.choices.slice(0, 2) : event.choices).map((c, i) => (
                  <button key={c.id} {...optProps(c, i + 1)}
                    style={{ display:"block", width:"100%", textAlign:"left", padding:"14px 24px 14px 52px", background:"transparent", border:"none", borderTop:`1px solid ${G.bdr}`, color:G.txt, position:"relative" }}>
                    <span style={{ position:"absolute", left:22, top:13, fontFamily:serif, fontWeight:700, fontSize:18, color:G.tx3 }}>{i + 1}.</span>
                    <ChoicePreview gs={gs} c={c}/>
                    {stamping === c.id && <span className="sv-stamp sv-stamp-hit">Исполнить</span>}
                  </button>
                ))}
                {event.doc && (() => {
                  // Обвинение: какой исход — решает отмеченная строка; предпросмотр не подсказывает ответ.
                  const verdict = event.choices.find(c => c.id === (marked !== null && marked === event.doc.key ? "c" : "d"));
                  const on = armed === "c" || armed === "d";
                  return (
                    <button id="opt-3" className="sv-opt" data-armed={on || undefined} disabled={marked === null}
                      onClick={() => pick(verdict, false)} onBlur={() => setArmed(null)}
                      style={{ display:"block", width:"100%", textAlign:"left", padding:"14px 24px 14px 52px", background:"transparent", border:"none", borderTop:`1px solid ${G.bdr}`, color:G.txt, position:"relative", opacity:marked === null ? .55 : 1 }}>
                      <span style={{ position:"absolute", left:22, top:13, fontFamily:serif, fontWeight:700, fontSize:18, color:G.tx3 }}>3.</span>
                      <div style={{ fontFamily:serif, fontSize:17, fontWeight:700, lineHeight:1.35, marginBottom:3 }}>{INSPECT_TEXT.accuse.text}</div>
                      <div style={{ fontFamily:narrow, fontSize:15, color:marked === null ? G.tx3 : G.red }}>
                        {marked === null ? "Сначала отметьте в докладе строку, которая не сходится со справкой" : `Отмечена строка ${marked + 1}. ${INSPECT_TEXT.accuse.hint}`}
                      </div>
                      {(stamping === "c" || stamping === "d") && <span className="sv-stamp sv-stamp-hit">Исполнить</span>}
                    </button>
                  );
                })()}
                <div style={{ padding:"0 24px 12px" }}>
                <CouncilPanel gs={gs} stamping={stamping} onConvened={list => commit(conveneCouncil(gsRef.current, list))} optProps={(c, i) => optProps(c, event.choices.length + i + 1)}/>
                </div>
              </Card>
              )}
            </div>
          )}

          {!busy && !event && lastTurn && !counted && (
            <ElectionNight key={`el${turn}`} e={lastTurn.election} party={gs.leader.party} onDone={() => setCountedTurn(turn)}/>
          )}
          {!busy && !event && lastTurn && counted && (
            <div>
              <Card style={{ marginBottom:12, padding:"20px 24px 22px" }}>
                <div className="sv-reveal">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"10px 14px", marginBottom:18, flexWrap:"wrap" }}>
                  <div style={{ minWidth:0, flex:"1 1 240px" }}>
                    <div style={{ fontFamily:narrow, fontWeight:700, fontSize:13, letterSpacing:".06em", textTransform:"uppercase", color:autoTurn === turn ? G.red : G.tx3, marginBottom:2 }}>{autoTurn === turn ? "Пока вы медлили, аппарат решил за вас" : "Ваша резолюция"}</div>
                    <div className="sv-hand" style={{ fontSize:21, lineHeight:1.25 }}>{lastTurn.choiceText}. — {signature(gs.leader.name)}</div>
                  </div>
                  {lastTurn.chance < 1 && (
                    <span className={`sv-stamp sv-in${lastTurn.success === false ? " is-red" : " is-green"}`} style={{ fontSize:15, flexShrink:0 }}>
                      {lastTurn.success === false ? "Не исполнено" : "Исполнено"}
                      <span style={{ display:"block", fontSize:11, fontWeight:400, letterSpacing:0, textTransform:"none", lineHeight:1.3, marginTop:4 }}>шанс был {Math.round(lastTurn.chance * 100)}%</span>
                    </span>
                  )}
                </div>
                <div className="sv-paper-drop" style={{ borderTop:`4px solid ${G.txt}`, borderBottom:`2px solid ${G.txt}`, padding:"8px 0 6px", marginBottom:12, textAlign:"center" }}>
                  <div style={{ fontFamily:narrow, fontWeight:700, fontSize:"clamp(30px, 8vw, 46px)", lineHeight:1.02, textTransform:"uppercase", letterSpacing:".06em" }}>Вечерний {COUNTRIES[gs.country].capital}</div>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:5 }}>{gs.year} · выпуск № {turn} · цена 5 коп.</div>
                </div>
                <div style={{ fontFamily:narrow, fontWeight:700, fontSize:13, letterSpacing:".12em", textTransform:"uppercase", color:G.red, marginBottom:4 }}>{rubricOf(lastTurn)}</div>
                <h2 className="sv-paper-drop" style={{ fontFamily:narrow, fontWeight:700, fontSize:"clamp(28px, 6.4vw, 38px)", lineHeight:1.1, color:G.txt, marginBottom:12, textWrap:"balance", animationDelay:".15s" }}>{lastTurn.headline}</h2>
                <figure style={{ margin:"0 0 14px", border:`2px solid ${G.txt}` }}>
                  <SquareView gs={gs} sceneKey={lastTurn.scene} height={36} mono still/>
                  <figcaption style={{ fontFamily:narrow, fontSize:14, color:G.tx3, padding:"3px 8px", borderTop:`2px solid ${G.txt}` }}>{SCENE_CAPTION[lastTurn.scene] ?? SCENE_CAPTION.square}. Фото редакции</figcaption>
                </figure>
                <Typewriter key={`t${turn}`} text={lastTurn.narrative} onDone={() => setTypedTurn(turn)}/>
                <div className="sv-reveal" style={{ display: typed ? "block" : "none" }}>

                {lastTurn.document && <DocumentCard doc={lastTurn.document}/>}
                {(lastTurn.reactions||[]).slice(0, 2).map((r,i) => {
                  const who = speakerOf(gs, r);
                  return (
                    <div key={i} style={{ display:"flex", gap:12, alignItems:"center", padding:"9px 0", borderTop:`1px solid ${G.bdr}` }}>
                      {who && <Portrait name={who.name} size={36}/>}
                      <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, fontStyle:"italic" }}>{r}</div>
                    </div>
                  );
                })}
                {lastTurn.press?.length > 0 && (
                  <div style={{ margin:"10px 0 4px", padding:"10px 12px", border:`1px solid ${G.bdr2}`, background:G.bg2 }}>
                    <div style={{ fontFamily:narrow, fontWeight:700, fontSize:12, letterSpacing:".1em", textTransform:"uppercase", color:G.tx3, marginBottom:6 }}>Что пишут другие</div>
                    {lastTurn.press.map((p, i) => (
                      <div key={i} className="sv-fade" style={{ padding:"5px 0", borderTop: i ? `1px dashed ${G.bdr}` : "none", animationDelay:`${0.2 + i * 0.25}s` }}>
                        <div style={{ fontFamily:narrow, fontSize:13, color:G.tx3 }}>{p.outlet}</div>
                        <div style={{ fontFamily:serif, fontWeight:700, fontSize:16, lineHeight:1.25, color:G.txt }}>{p.headline}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Историк подводит черту только в конце главы — иначе его реплики приедаются */}
                {lastTurn.historianNote && (turn % 5 === 0 || gs.ended) && (
                  <div style={{ fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx3, margin:"10px 0 4px", textAlign:"right" }}>— {lastTurn.historianNote}</div>
                )}

                {(turnDelta || Object.keys(lastTurn.factionRelChanges||{}).length > 0) && (
                  <Ledger rows={[
                    ...(turnDelta ? RES_CONFIG.filter(r => turnDelta[r.key]).map(r => ({ k:r.key, label:SHORT[r.key], value:resources[r.key], delta:turnDelta[r.key] })) : []),
                    ...Object.entries(lastTurn.factionRelChanges||{}).flatMap(([fid, v]) => {
                      const f = factions.find(x => x.id === fid);
                      return f ? [{ k:fid, label:f.name, value:f.relation, delta:v, rel:true }] : [];
                    }),
                  ]}/>
                )}
                </div>
                </div>
              </Card>
              <div className="sv-reveal" style={{ display: typed ? "block" : "none" }}>

              {lastTurn.pacts && [["signed", "Договор подписан", "var(--blue)"], ["kept", "Договор исполнен", G.grn], ["broken", "Договор нарушен", G.red]].flatMap(([k, label, color]) =>
                lastTurn.pacts[k].map((name, i) => (
                  <div key={`${k}${name}${i}`} className="sv-paper" style={{ marginBottom:8, padding:"10px 16px", borderRadius:0, borderLeft:`3px solid ${color}` }}>
                    <span style={{ fontFamily:serif, fontSize:16, fontWeight:700 }}>{label}</span>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}> · «{name}»</span>
                  </div>
                )))}
              {lastTurn.law && (() => {
                const def = lawDef(lastTurn.law.id);
                const [label, color] = lastTurn.law.act === "enact"
                  ? lastTurn.law.passed ? ["Закон принят", G.grn] : ["Парламент провалил законопроект", G.red]
                  : lastTurn.law.passed ? ["Закон отменён", G.amb] : ["Отменить закон не удалось", G.red];
                return def && (
                  <div className="sv-paper" style={{ marginBottom:8, padding:"10px 16px", borderRadius:0, borderLeft:`3px solid ${color}` }}>
                    <span style={{ fontFamily:narrow, fontSize:15, fontWeight:700, color, letterSpacing:".04em" }}>⚖ {label.toUpperCase()}</span>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}> · «{def.title}»{lastTurn.law.act === "enact" && lastTurn.law.passed ? " — в своде законов, действует со следующего хода" : ""}</span>
                  </div>
                );
              })()}
              {lastTurn.promises && [["kept", "Обещание исполнено", G.grn], ["broken", "Обещание нарушено", G.red], ["advanced", "Шаг к обещанию", G.tx2]].flatMap(([k, label, color]) =>
                lastTurn.promises[k].map(title => (
                  <div key={k + title} className="sv-paper" style={{ marginBottom:8, padding:"10px 16px", borderRadius:0, borderLeft:`3px solid ${color}` }}>
                    <span style={{ fontFamily:narrow, fontSize:15, fontWeight:700, color, letterSpacing:".04em" }}>{label.toUpperCase()}</span>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}> · «{title}»</span>
                  </div>
                )))}
              {lastTurn.matured?.map(p => (
                <div key={p.id} className="sv-paper" style={{ marginBottom:8, padding:"12px 16px", borderRadius:0 }}>
                  <div style={{ fontFamily:serif, fontSize:16, fontWeight:700, marginBottom:2 }}>{p.label}</div>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginBottom:6 }}>эхо решения {p.event ? `по делу «${p.event}»` : `«${p.source}»`}{p.from !== undefined ? ` · ${monthYear(turnDate(gs.seed, COUNTRIES[gs.country].startYear, p.from))}` : ""}</div>
                  <ResourceChips delta={p.res}/>
                </div>
              ))}
              {lastTurn.election && (
                <div style={{ marginBottom:8, padding:"12px 14px", borderRadius:0, background:G.bg2, border:`1px solid ${lastTurn.election.outcome==="won"?G.grn:G.red}` }}>
                  <div style={{ fontFamily:narrow, fontSize:15, color:lastTurn.election.outcome==="won"?G.grn:G.red, letterSpacing:".05em", marginBottom:4 }}>
                    {ELECTION_LABEL[lastTurn.election.kind].toUpperCase()}: {lastTurn.election.outcome==="won" ? "ПОБЕДА" : lastTurn.election.outcome==="impeached" ? "РАЗГРОМ И ИМПИЧМЕНТ" : "ПОРАЖЕНИЕ"}
                  </div>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>
                    ваша партия {lastTurn.election.leader}% · {lastTurn.election.top.name} {lastTurn.election.top.share}%
                  </div>
                </div>
              )}
              {lastTurn.resolvedCrisis && (
                <div style={{ marginBottom:8, padding:"10px 14px", borderRadius:0, background:"rgba(92,184,122,0.08)", border:`1px solid ${G.grn}` }}>
                  <span style={{ fontFamily:narrow, fontSize:15, color:G.grn }}>КРИЗИС ПРЕОДОЛЁН · {lastTurn.resolvedCrisis.toUpperCase()}</span>
                </div>
              )}
              {lastTurn.expiredCrises?.map((t, i) => (
                <div key={`${t}${i}`} style={{ marginBottom:8, padding:"10px 14px", borderRadius:0, background:G.bg2, border:`1px solid ${G.bdr2}` }}>
                  <span style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>КРИЗИС ЗАТИХ · {t.toUpperCase()}</span>
                </div>
              ))}
              {lastTurn.newCrisis && (
                <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:0, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.red, marginBottom:4 }}>НОВЫЙ КРИЗИС · {lastTurn.newCrisis.title.toUpperCase()}</div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{lastTurn.newCrisis.description}</div>
                </div>
              )}

              </div>
              {typed && <div style={{ textAlign:"right" }}>
                {gs.ended
                  ? <PrimaryBtn id="next-turn" onClick={onEnd} danger>ПОДВЕСТИ ИТОГИ ⏎</PrimaryBtn>
                  : <PrimaryBtn id="next-turn" onClick={nextTurn}>СЛЕДУЮЩИЙ ХОД ⏎</PrimaryBtn>}
              </div>}
            </div>
          )}

          {!busy && !event && !lastTurn && gs.ended && (
            <div style={{ textAlign:"right" }}><PrimaryBtn onClick={onEnd} danger>ПОДВЕСТИ ИТОГИ →</PrimaryBtn></div>
          )}
        </div>
      </div>
      </div>
      <ActionBar
        mode={recap ? "recap" : busy ? null : event ? (armedChoice ? "sign" : resolutionInView ? null : "jump") : lastTurn ? (!counted ? "count" : typed ? (gs.ended ? "end" : "next") : "skip") : null}
        choice={armedChoice}
        onSign={() => { const c = armedChoice; setArmed(null); if (c) choose(c); }}
        onCancel={() => { setArmed(null); setPreview(null); }}
        onJump={() => document.getElementById("opt-1")?.scrollIntoView({ behavior:"smooth", block:"center" })}
        onSkip={() => window.dispatchEvent(new KeyboardEvent("keydown", { key:"Enter" }))}
        onCount={() => setCountedTurn(turn)}
        onNext={nextTurn} onEnd={onEnd} onRecap={onRecapDone}/>
    </div>
  );
}

// Готовы ли родные кнопки Telegram (SDK грузится асинхронно).
function useTelegramButtons() {
  const [tg, setTg] = useState(tgButtons);
  useEffect(() => onTelegramReady(() => setTg(tgButtons())), []);
  return tg;
}

// Нижняя панель на телефоне: главное действие хода всегда под большим пальцем.
// Кнопки не забирают фокус — иначе выбранная резолюция успела бы сброситься.
function ActionBar({ mode, choice, onSign, onCancel, onJump, onSkip, onNext, onEnd, onRecap, onCount }) {
  // В Telegram то же действие уходит на его родную кнопку внизу экрана, отмена — на «Назад».
  const tg = useTelegramButtons();
  useEffect(() => {
    if (!tg) return;
    const short = t => (t.length > 34 ? t.slice(0, 33).trimEnd() + "…" : t);
    const specs = {
      sign: { text: `Подписать: ${short(choice?.text ?? "")}`, onClick: onSign },
      jump: { text: "К резолюции ↓", onClick: onJump },
      skip: { text: "Показать текст сразу", onClick: onSkip },
      next: { text: "Следующий ход →", onClick: onNext },
      end:  { text: "Подвести итоги →", onClick: onEnd, color: "#a02f24", textColor: "#f1e9d2" },
      recap: { text: "Продолжить правление →", onClick: onRecap },
      count: { text: "Сразу к итогам", onClick: onCount },
    };
    setMainButton(specs[mode] ?? null);
    setBackButton(mode === "sign" ? onCancel : null);
  });
  useEffect(() => () => { setMainButton(null); setBackButton(null); }, [tg]);
  if (!mode || mode === "recap" || tg) return null; // у сводки своя кнопка
  const keep = { onPointerDown: e => e.preventDefault(), onMouseDown: e => e.preventDefault() };
  const main = { flex:1, minHeight:48, background:G.gold, color:"var(--on-gold)", border:"2px solid #000", fontFamily:pixel, fontSize:15, textTransform:"uppercase", padding:"0 14px", boxShadow:"var(--hard)" };
  return (
    <div className="sv-actionbar">
      {mode === "sign" && <>
        <button {...keep} onClick={onCancel} aria-label="Отменить выбор"
          style={{ width:48, minHeight:48, background:"transparent", border:`2px solid ${G.bdr2}`, color:G.tx2, fontSize:20 }}>×</button>
        <button {...keep} onClick={onSign} style={{ ...main, display:"flex", flexDirection:"column", alignItems:"flex-start", justifyContent:"center", textAlign:"left", gap:2, minWidth:0 }}>
          <span>Подписать</span>
          <span style={{ fontFamily:narrow, fontSize:14, textTransform:"none", opacity:.8, maxWidth:"100%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{choice?.text}</span>
        </button>
      </>}
      {mode === "jump" && <button {...keep} onClick={onJump} style={main}>К резолюции ↓</button>}
      {mode === "count" && <button {...keep} onClick={onCount} style={{ ...main, background:"transparent", color:G.txt, border:`2px solid ${G.bdr2}`, boxShadow:"none" }}>Сразу к итогам</button>}
      {mode === "skip" && <button {...keep} onClick={onSkip} style={{ ...main, background:"transparent", color:G.txt, border:`2px solid ${G.bdr2}`, boxShadow:"none" }}>Показать текст сразу</button>}
      {mode === "next" && <button {...keep} onClick={onNext} style={main}>Следующий ход →</button>}
      {mode === "end" && <button {...keep} onClick={onEnd} style={{ ...main, background:G.red }}>Подвести итоги →</button>}
    </div>
  );
}

// Прогресс коллекции — повод сыграть ещё.
function Collection() {
  const raw = useSyncExternalStore(subscribeMeta, readMetaRaw, () => null);
  const meta = useMemo(() => parseMeta(raw), [raw]);
  const endings = new Set(Object.values(meta.endings).flat()).size;
  const items = [
    ["ИНТРИГИ", `${meta.arcs?.length ?? 0}/${ARCS.length}`],
    ["КОНЦОВКИ", `${endings}/${ALL_ENDINGS.length}`],
    ["ДОСТИЖЕНИЯ", `${meta.achievements.length}/${ACHIEVEMENTS.length}`],
  ];
  return (
    <div style={{ display:"flex", justifyContent:"center", gap:24, flexWrap:"wrap", margin:"4px 0 18px", order:7 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ textAlign:"center" }}>
          <div style={{ fontFamily:serif, fontSize:24, fontWeight:600, color:G.gold, lineHeight:1 }}>{v}</div>
          <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3, marginTop:4 }}>{k}</div>
        </div>
      ))}
    </div>
  );
}

// Итог правления одним сообщением — чтобы поделиться в мессенджере.
function shareText(gs) {
  const v = gs.verdict;
  const c = COUNTRIES[gs.country];
  const rating = computePolls(gs.country, gs.factions, gs.resources).leader;
  return [
    `${c.flag} СУВЕРЕН · ${gs.daily ? `дело дня ${gs.daily.split("-").reverse().slice(0, 2).join(".")} · ` : ""}${gs.country}`,
    `${gs.leader.name} — «${v.title}»`,
    `${c.startYear}–${gs.year} · ${plural(gs.history.length, "решение", "решения", "решений")} · ${END_TYPES[gs.endType] ?? ""}`,
    `Оценка истории: ${v.rating} · рейтинг ${rating}%`,
    gs.arc ? `Интрига «${ARCS.find(a => a.id === gs.arc.id)?.title}»: ${gs.arc.epilogue ? "раскрыта" : "так и осталась тайной"}` : "",
    v.epitaph ? `«${v.epitaph}»` : "",
    "",
    isSurvival(gs.endType) ? "Сможешь лучше?" : `Мой президент продержался ${plural(gs.history.length, "ход", "хода", "ходов")}. А твой?`,
    shareUrl(),
  ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trim();
}

const shareUrl = () => process.env.NEXT_PUBLIC_SHARE_URL || (/^https?:/.test(location.href) ? location.href.split("#")[0] : "");

// Итог, которым хочется поделиться: превью карточки прямо на экране и кнопки под ним.
// С сервером — ссылка на страницу итога (в Telegram превращается в картинку) и история;
// в демо без сервера — картинка, нарисованная в браузере, и текст.
function ShareCard({ gs, style }) {
  const server = feedbackEnabled();
  const result = useMemo(() => shareResultOf(gs, computePolls(gs.country, gs.factions, gs.resources).leader, runScore(gs),
    gs.arc ? ARCS.find(a => a.id === gs.arc.id)?.title : undefined), [gs]);
  const query = shareQuery(result), cap = shareCaption(result);
  const origin = typeof location !== "undefined" && /^https?:/.test(location.origin) ? location.origin : "";
  const pageUrl = `${origin}/r?${query}`, cardUrl = `${origin}/api/card?${query}`;
  const [local, setLocal] = useState(null); // картинка из браузера — для демо и сохранения
  const [state, setState] = useState(null); // "copied" | "manual"
  useEffect(() => {
    if (server) return;
    let url = null, live = true;
    resultCard(gs).then(b => { if (b && live) { url = URL.createObjectURL(b); setLocal(url); } }).catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [gs, server]);
  const text = `${cap.title}. ${cap.challenge}`;
  const send = async () => {
    if (!server) {
      const full = shareText(gs);
      if (telegramShare(full.replace(shareUrl(), "").trim(), shareUrl())) { track("share", { via:"tg" }); return; }
      try { await navigator.clipboard.writeText(full); setState("copied"); track("share", { via:"copy" }); } catch { setState("manual"); }
      return;
    }
    if (telegramShare(text, pageUrl)) { track("share", { via:"tg" }); return; }
    if (navigator.share) {
      try { await navigator.share({ title: cap.title, text, url: pageUrl }); track("share", { via:"native" }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(`${text}\n${pageUrl}`); setState("copied"); track("share", { via:"copy" }); } catch { setState("manual"); }
  };
  const story = () => { if (telegramStory(`${cardUrl}&f=story`, `${text} Играть: ${botLink().replace("https://", "")}`)) track("share", { via:"story" }); };
  const save = async () => {
    const blob = await resultCard(gs).catch(() => null);
    if (!blob) return;
    track("share", { via:"save" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `suveren-${gs.leader.name.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const preview = server ? cardUrl : local;
  return (
    <Card style={{ marginBottom:12, ...style }}>
      <Label>{"ВАШ ИТОГ — ДЛЯ ДРУЗЕЙ"}</Label>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- карточку рисует сервер или canvas
        <img src={preview} alt={cap.title} onClick={send} style={{ display:"block", width:"100%", height:"auto", marginBottom:12, boxShadow:"4px 4px 0 #0006", cursor:"pointer" }}/>
      )}
      <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, lineHeight:1.55, marginBottom:12 }}>{cap.challenge} Друг увидит эту карточку и сможет сыграть в одно касание.</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
        <PrimaryBtn onClick={send}>{state === "copied" ? "✓ ССЫЛКА СКОПИРОВАНА" : "ОТПРАВИТЬ ДРУГУ"}</PrimaryBtn>
        {server && canTelegramStory() && <button onClick={story} style={{ background:"transparent", border:`2px solid ${G.bdr2}`, color:G.txt, padding:"10px 18px", borderRadius:0, fontFamily:pixel, fontSize:14 }}>В ИСТОРИЮ</button>}
        {!inTelegram() && window.self === window.top && <button onClick={save} style={{ background:"transparent", border:"none", color:G.tx2, fontSize:15, textDecoration:"underline", textUnderlineOffset:3 }}>Сохранить картинку</button>}
      </div>
      {state === "manual" && (
        <textarea readOnly value={server ? `${text}\n${pageUrl}` : shareText(gs)} rows={4} onFocus={e => e.target.select()} aria-label="Итог правления"
          style={{ width:"100%", boxSizing:"border-box", marginTop:10, background:G.bg, color:G.txt, border:`1px solid ${G.bdr2}`, borderRadius:0, padding:8, fontFamily:narrow, fontSize:15 }}/>
      )}
    </Card>
  );
}


// Таблица «Дела дня»: место среди всех и среди друзей, приглашение друга.
function DailyBoard({ gs }) {
  const [board, setBoard] = useState(null);
  const [tab, setTab] = useState("all");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    submitDaily(gs).then(b => { if (live) setBoard(b); });
    track("daily");
    return () => { live = false; };
  }, [gs]);
  if (!board) return null;
  const friends = board.friends.length > 1;
  const rows = tab === "friends" && friends ? board.friends : board.top;
  const invite = async () => {
    track("invite");
    const url = inviteUrl(board.uid, shareUrl());
    const msg = "Сыграй сегодняшнее дело в «Суверене» — посмотрим, кто продержится дольше.";
    if (telegramShare(msg, url)) return;
    if (navigator.share && matchMedia("(pointer:coarse)").matches) { try { await navigator.share({ text:msg, url }); return; } catch { /* отменено */ } }
    try { await navigator.clipboard.writeText(`${msg} ${url}`); setCopied(true); } catch { /* нет доступа */ }
  };
  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} aria-pressed={tab === id}
      style={{ background:"transparent", border:"none", borderBottom:`2px solid ${tab === id ? G.gold : "transparent"}`, color:tab === id ? G.txt : G.tx3, fontSize:15, padding:"2px 0" }}>{label}</button>
  );
  return (
    <Card style={{ marginBottom:12, order:6 }}>
      <Label>{"Дело дня · таблица"}</Label>
      {board.me && (
        <div style={{ fontFamily:serif, fontSize:20, marginBottom:12 }}>
          Вы <b>{board.me.rank}-й</b> из {board.total} · {plural(board.me.score, "очко", "очка", "очков")}
        </div>
      )}
      {friends && <div style={{ display:"flex", gap:16, marginBottom:8 }}>{tabBtn("all", "Все")}{tabBtn("friends", "Друзья")}</div>}
      {rows.map((row, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:10, padding:"6px 0", borderTop:`1px solid ${G.bdr}`, fontFamily:narrow, fontSize:16, color:row.me ? G.gold : G.txt, fontWeight:row.me ? 700 : 400 }}>
          <span style={{ minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{i + 1}. {row.name}{row.title && <span style={{ color:G.tx3, fontWeight:400 }}> · {row.title}</span>}</span>
          <span style={{ fontVariantNumeric:"tabular-nums" }}>{row.score}</span>
        </div>
      ))}
      <button onClick={invite} style={{ marginTop:12, background:"transparent", border:`1.5px solid ${G.gold}`, color:G.gold, padding:"8px 16px", borderRadius:0, fontSize:15, fontWeight:700 }}>
        {copied ? "Ссылка скопирована" : "Позвать друга в таблицу"}
      </button>
    </Card>
  );
}

// ── ENDING ────────────────────────────────────────────────────────────────────
// Утреннее «Дело дня»: в Telegram — подписка в одно касание (бот просит разрешения писать).
// Заодно сервер запоминает итог партии, чтобы наутро бот спросил, как она прошла.
function MorningCard({ gs, style }) {
  const [state, setState] = useState(() => tgInitData() ? "check" : "hidden"); // check · offer · busy · done · denied · hidden
  const run = useMemo(() => ({ финал: END_TYPES[gs.endType] ?? gs.endType ?? "", ход: gs.turn, страна: gs.country }), [gs.endType, gs.turn, gs.country]);
  useEffect(() => {
    const initData = tgInitData();
    if (!initData) return;
    let live = true;
    syncSubscription(initData, false, run).then(r => { if (live) setState(!r ? "hidden" : r.subscribed ? "hidden" : "offer"); });
    return () => { live = false; };
  }, [run]);
  const ask = async () => {
    setState("busy");
    const ok = await requestWriteAccess();
    if (!ok) { setState("denied"); return; }
    const r = await syncSubscription(tgInitData(), true, run);
    setState(r?.subscribed ? "done" : "denied");
    if (r?.subscribed) track("subscribe");
  };
  if (state === "check" || state === "hidden") return null;
  return (
    <Card style={{ marginBottom:12, ...style }}>
      <Label>{"ДЕЛО ДНЯ ПО УТРАМ"}</Label>
      {state === "done" ? (
        <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, lineHeight:1.6 }}>Готово. Завтра в 8:00 по Москве на столе будет новое дело — одно на всех, с таблицей друзей. Отписаться — /stop в чате с ботом.</div>
      ) : (
        <>
          <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, lineHeight:1.6, marginBottom:12 }}>
            Каждое утро — новое дело: одна страна и одни условия для всех. Сравните, кто продержится дольше.
          </div>
          <PrimaryBtn onClick={ask} disabled={state === "busy"}>{state === "busy" ? "ЖДУ ОТВЕТА…" : "ПРИСЫЛАТЬ ПО УТРАМ"}</PrimaryBtn>
          {state === "denied" && <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:8 }}>Без разрешения бот не сможет написать. Передумаете — нажмите «Старт» в чате с ботом.</div>}
        </>
      )}
    </Card>
  );
}

// Отзыв после партии: оценка и пара слов уходят автору игры. Одна партия — один отзыв.
const FEEDBACK_LABELS = ["", "скучно", "так себе", "неплохо", "интересно", "затянуло"];
function FeedbackBox({ gs, style }) {
  const key = `sv-fb-${gs.seed}`;
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [state, setState] = useState(() => { try { return localStorage.getItem(key) ? "sent" : "idle"; } catch { return "idle"; } });
  const submit = async () => {
    setState("busy");
    const kept = (gs.promises ?? []).filter(p => p.status === "kept").length;
    const ok = await sendFeedback(rating, text, { финал: END_TYPES[gs.endType] ?? gs.endType ?? "", ход: gs.turn, страна: gs.country, сложность: DIFFICULTIES[gs.diff]?.label ?? gs.diff, обещаний: kept });
    if (ok) { try { localStorage.setItem(key, "1"); } catch { /* недоступно */ } }
    setState(ok ? "sent" : "error");
  };
  return (
    <Card style={{ marginBottom:12, ...style }}>
      <Label>{"КАК ВАМ ПАРТИЯ?"}</Label>
      {state === "sent" ? (
        <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, lineHeight:1.6 }}>Спасибо. Отзыв ушёл автору игры — он читает каждый.</div>
      ) : (
        <>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)} aria-pressed={rating === n} aria-label={`${n} — ${FEEDBACK_LABELS[n]}`}
                style={{ width:44, height:40, borderRadius:0, border:`2px solid ${rating === n ? G.txt : G.bdr2}`, background:rating === n ? G.gold : "transparent", color:rating === n ? "var(--on-gold)" : G.txt, fontFamily:pixel, fontSize:16 }}>{n}</button>
            ))}
          </div>
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginBottom:10, minHeight:20 }}>{rating ? FEEDBACK_LABELS[rating] : "1 — скучно, 5 — затянуло"}</div>
          {rating > 0 && (
            <>
              <textarea value={text} onChange={e => setText(e.target.value.slice(0, 1000))} rows={3} placeholder="Что было скучно, непонятно или нечестно? Необязательно, но очень помогает."
                style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", borderRadius:0, border:`1px solid ${G.bdr2}`, background:G.bg3, color:G.txt, fontFamily:serif, fontSize:15, lineHeight:1.5, resize:"vertical", marginBottom:10 }}/>
              <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <PrimaryBtn onClick={submit} disabled={state === "busy"}>{state === "busy" ? "ОТПРАВЛЯЮ…" : "ОТПРАВИТЬ"}</PrimaryBtn>
                {state === "error" && <span style={{ fontFamily:narrow, fontSize:15, color:G.red }}>Не ушло — попробуйте ещё раз</span>}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}

function Ending({ gs, setGs, onRestart }) {
  const verdict = gs.verdict;
  const [newAch, setNewAch] = useState([]);
  const [loading, setLoading] = useState(!verdict);
  const [error, setError]     = useState(null);
  const gsRef = useRef(gs);
  useEffect(() => { gsRef.current = gs; }, [gs]);

  const [attempt, setAttempt] = useState(0);
  const needsVerdict = !verdict;
  useEffect(() => {
    if (!needsVerdict) return;
    let cancelled = false;
    game.ending(gsRef.current).then(
      v => {
        if (cancelled) return;
        const next = setVerdict(gsRef.current, v);
        gsRef.current = next;
        setGs(next);
        const run = recordRun(next);
        track("end", { type: next.endType ?? "", turns: next.turn, kept: (next.promises ?? []).filter(p => p.status === "kept").length });
        setNewAch(run.unlocked);
        cloudSet("meta", compactMeta(run.meta));
        setError(null);
        setLoading(false);
      },
      e => {
        if (cancelled) return;
        console.error(e);
        setError(e.message);
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
  }, [needsVerdict, attempt, setGs]);

  const retry = () => { setLoading(true); setError(null); setAttempt(a => a + 1); };

  const avgRes = Math.round(RES_CONFIG.reduce((s, r) => s + gs.resources[r.key], 0) / RES_CONFIG.length);
  const pa = computePolls(gs.country, gs.factions, gs.resources).leader;
  const isLoss = !isSurvival(gs.endType);
  const startYear = COUNTRIES[gs.country].startYear;

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"32px 16px" }}>
      <div style={{ maxWidth:660, width:"100%", display:"flex", flexDirection:"column" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3, marginBottom:12 }}><Flag country={gs.country}/> {gs.country.toUpperCase()} · {gs.endType ? END_TYPES[gs.endType].toUpperCase() : "КОНЕЦ ПРАВЛЕНИЯ"}</div>
          <Divider/>
        </div>

        <Card style={{ marginBottom:12, textAlign:"center" }}>
          <Portrait name={gs.leader.name} size={96} style={{ display:"block", margin:"0 auto 12px", transform:"rotate(-1.5deg)", filter:isLoss ? "grayscale(1) contrast(.9)" : "none" }}/>
          <div style={{ fontFamily:narrow, fontSize:42, fontWeight:700, color:G.txt, marginBottom:6 }}>{gs.leader.name}</div>
          {verdict?.title && <div style={{ margin:"10px 0 20px" }}><span className={`sv-stamp${isLoss ? " is-red" : ""}`} style={{ fontSize:17 }}>{verdict.title}</span></div>}
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{startYear}–{gs.year} · {plural(gs.history.length, "решение", "решения", "решений")} · ресурсы {avgRes}/100 · рейтинг {pa}%</div>
        </Card>

        {loading && <Card style={{ padding:"50px 20px", textAlign:"center" }}><div style={{ fontFamily:mono, fontSize:13, color:G.tx3, letterSpacing:".05em" }}>{"Историки пишут хронику…"}</div></Card>}
        {!loading && error && <ErrorBanner message={error} onRetry={retry}/>}

        {!loading && verdict && <ShareCard gs={gs} style={{ order:1 }}/>}
        {!loading && (
          <div style={{ display:"contents" }}>
            {isLoss && (verdict?.fallNarrative || gs.powerLoss) && (
              <Card accent={G.red} style={{ marginBottom:12, order:3 }}>
                <Label>{"КАК ЭТО ПРОИЗОШЛО"}</Label>
                <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.85, color:G.txt }}>{verdict?.fallNarrative || gs.powerLoss}</div>
                {endCause(gs) && <div style={{ fontFamily:narrow, fontSize:15, lineHeight:1.6, color:G.red, marginTop:10, paddingTop:10, borderTop:`1px solid ${G.bdr}` }}>{endCause(gs)}</div>}
              </Card>
            )}

            {verdict && (
              <Card accent={G.amb} style={{ marginBottom:12, order:5 }}>
                <Label>{"ВЕРДИКТ ИСТОРИИ"}</Label>
                <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.85, color:G.txt, marginBottom:14 }}>{verdict.verdict}</div>
                {verdict.epitaph && <div style={{ fontFamily:serif, fontSize:15, fontStyle:"italic", color:G.tx2, padding:"12px 0", borderTop:`1px solid ${G.bdr}`, borderBottom:`1px solid ${G.bdr}` }}>«{verdict.epitaph}»</div>}
                <div style={{ marginTop:12, fontFamily:narrow, fontSize:15, color:G.amb, letterSpacing:".05em" }}>ОЦЕНКА: {verdict.rating.toUpperCase()}</div>
              </Card>
            )}
            {verdict && <PromisesCard gs={gs} final style={{ marginTop:0, marginBottom:12, order:5 }}/>}
            {verdict && <LawsCard gs={gs} final style={{ marginTop:0, marginBottom:12, order:5 }}/>}
            {verdict && feedbackEnabled() && <MorningCard gs={gs} style={{ order:5 }}/>}
            {verdict && feedbackEnabled() && <FeedbackBox gs={gs} style={{ order:5 }}/>}

            <div className="sv-two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12, order:10 }}>
              <Card>
                <Label>{"РЕСУРСЫ"}</Label>
                {RES_CONFIG.map(r => {
                  const v=gs.resources[r.key]; const c=barColor(v);
                  return <div key={r.key} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                      <span style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>{r.label}</span>
                      <span style={{ fontFamily:narrow, fontSize:15, color:c }}>{v}</span>
                    </div>
                    <div style={{ height:2, background:G.bdr, borderRadius:0 }}><div style={{ height:"100%", width:`${v}%`, background:c, borderRadius:0 }}/></div>
                  </div>;
                })}
              </Card>
              <Card>
                <Label>{"ФРАКЦИИ (итог)"}</Label>
                {gs.factions.map(f => {
                  const c=relColor(f.relation);
                  return <div key={f.id} style={{ marginBottom:7 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                      <span style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>{f.name}</span>
                      <span style={{ fontFamily:narrow, fontSize:15, color:c }}>{signed(f.relation)}</span>
                    </div>
                    <div style={{ height:2, background:G.bdr, borderRadius:0 }}>
                      <div style={{ height:"100%", width:`${((f.relation+100)/200)*100}%`, background:c, borderRadius:0 }}/>
                    </div>
                  </div>;
                })}
              </Card>
            </div>

            {gs.history.length > 0 && (
              <Card style={{ marginBottom:24, order:11 }}>
                <Label>{"ХРОНИКА ПРАВЛЕНИЯ"}</Label>
                {gs.history.map((h,i)=>(
                  <div key={i} style={{ display:"flex", gap:12, padding:"7px 0", borderBottom:i<gs.history.length-1?`1px solid ${G.bdr}`:"none" }}>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3, minWidth:36 }}>{h.year}</span>
                    <span style={{ minWidth:0 }}>
                      <span style={{ fontFamily:serif, fontSize:14, color:G.txt }}>{h.title}</span>
                      <span style={{ display:"block", fontFamily:narrow, fontSize:15, color:h.success === false ? G.red : G.tx2, marginTop:2 }}>{h.success === false ? "✖ " : "→ "}{h.choice}</span>
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        {verdict && gs.arc && (() => {
          const def = ARCS.find(a => a.id === gs.arc.id);
          const solved = !!gs.arc.epilogue;
          return (
            <Card style={{ marginBottom:12, order:4 }}>
              <Label>{`ГЛАВНАЯ ИНТРИГА · «${def?.title.toUpperCase()}»`}</Label>
              <div style={{ fontFamily:serif, fontSize:17, lineHeight:1.6, color:G.txt, fontStyle:solved ? "normal" : "italic" }}>
                {solved ? gs.arc.epilogue : `Осталась нераскрытой. ${def?.teaser} Правда о человеке по имени ${gs.arc.target}${gs.arc.targetRole ? ` (${gs.arc.targetRole[0].toLowerCase() + gs.arc.targetRole.slice(1)})` : ""} так и не вышла наружу.`}
              </div>
            </Card>
          );
        })()}
        {verdict && <Collection/>}
        {verdict && gs.daily && <DailyBoard gs={gs}/>}
        {newAch.length > 0 && (
          <Card accent={G.gold} style={{ marginBottom:16, order:6 }}>
            <Label>{"НОВЫЕ ДОСТИЖЕНИЯ"}</Label>
            {newAch.map(a => (
              <div key={a.id} className="sv-fade" style={{ marginBottom:8 }}>
                <span style={{ fontFamily:narrow, fontSize:15, color:G.gld2 }}>{a.title.toUpperCase()}</span>
                <span style={{ fontFamily:serif, fontSize:14, color:G.tx2, marginLeft:10 }}>{a.desc}</span>
              </div>
            ))}
          </Card>
        )}
        <div style={{ display:"flex", justifyContent:"center", gap:10, flexWrap:"wrap", order:8, marginBottom:28 }}>
          <PrimaryBtn onClick={onRestart}>НОВАЯ ПАРТИЯ</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("setup");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [screen]);
  const [gs, setGs]         = useState(null);
  const savedRaw = useSyncExternalStore(subscribeSave, readSaveRaw, () => null);
  const saved = useMemo(() => parseSave(savedRaw), [savedRaw]);
  // Telegram понимает цвет шапки только в виде #rrggbb.
  useEffect(() => { rememberRef(); initTelegram("#2a2622", () => cloudGet("meta").then(importMeta)); track("open", { src: inTelegram() ? "tg" : "web" }); }, []);

  // Автосохранение: после каждого изменения партии, пока игрок не в меню.
  useEffect(() => {
    if (gs && screen !== "setup") writeSave({ version: SAVE_VERSION, screen, state: gs });
  }, [gs, screen]);

  const [recap, setRecap] = useState(false); // «Ранее в Суверене» — после возвращения к сохранённой партии
  const resume = () => { if (saved) { track("resume", { turn: saved.state.turn }); setGs(saved.state); setScreen(saved.screen); setRecap(saved.screen === "game" && saved.state.turn > 0); } };
  const restart = () => { clearSave(); setGs(null); setScreen("setup"); };

  return (
    <>
      {screen==="setup"  && <Setup  saved={saved} onResume={resume} onStart={(d, quick)=>{
        track("start", { country:d.country, diff:d.diff, ideo:d.ideo, bio:d.bio ?? "", daily:!!d.daily, quick:!!quick });
        // Быстрая партия и дело дня — сразу в кабинет: обещания берутся подсказанные, досье открывается в игре.
        if (quick) { setGs({ ...d, promises: initPromises(offeredPromises(d.seed, d.ideo).suggested, d.resources) }); setScreen("game"); }
        else { setGs(d); setScreen("intro"); track("intro"); }
      }}/>}
      {screen==="intro"  && <Intro  gs={gs} onGo={picks=>{ setGs(g => ({ ...g, promises: initPromises(picks, g.resources) })); setScreen("game"); }}/>}
      {screen==="game"   && <Game   gs={gs} setGs={setGs} onEnd={()=>setScreen("ending")} onMenu={()=>{ setRecap(false); setScreen("setup"); }} recap={recap} onRecapDone={()=>setRecap(false)}/>}
      {screen==="ending" && <Ending gs={gs} setGs={setGs} onRestart={restart}/>}
    </>
  );
}
