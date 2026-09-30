"use client";
import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, useId } from "react";
import { ACTIONS, APP_VERSION, COUNTRIES, ADVISOR_SKILL, ELECTIONS, ELECTION_LABEL, END_TYPES, LIMITS, NON_VOTING_BLOCS, DIFFICULTIES, IDEOLOGIES, MAX_TURNS, RES_CONFIG, SAVE_VERSION } from "@/lib/game/data.ts";
import { choiceEffects, computePolls, delayedEffects, planTurn, successChance, createInitialState, isSurvival, isFemaleName, endCause, plural, conveneCouncil, resolveTurn, seededRandom, setVerdict, startEvent, warningLevel } from "@/lib/game/engine.ts";
import { api as aiApi } from "@/lib/client/api.ts";
import { classicApi } from "@/lib/game/classic.ts";
import { ARCS } from "@/lib/content/arcs.ts";
import { ACHIEVEMENTS, ALL_ENDINGS, compactMeta, dailyCase, importMeta, parseMeta, readMetaRaw, recordRun, subscribeMeta, unlockedCountries } from "@/lib/client/meta.ts";

// Кто пишет текст: библиотека сценариев (мгновенно) или ИИ-рассказчик.
// В экспресс-режиме ответ готов мгновенно — даём сцене короткую театральную паузу.
const theatrical = (fn, ms) => async (...args) => (await Promise.all([fn(...args), new Promise(r => setTimeout(r, ms))]))[0];
const expressApi = {
  setup: theatrical(classicApi.setup, 600),
  event: theatrical(classicApi.event, 900),
  consequence: theatrical(classicApi.consequence, 1800),
  council: theatrical(classicApi.council, 1200),
  ending: theatrical(classicApi.ending, 1500),
};
const apiFor = mode => (mode === "classic" ? expressApi : aiApi);
import { cloudGet, cloudSet, initTelegram, telegramShare } from "@/lib/client/telegram.ts";
import { fetchBoard, inviteUrl, rememberRef, submitDaily } from "@/lib/client/daily.ts";
import { resultCard } from "@/lib/client/card.ts";
import { outcomeFx, pageFx, setSound, soundOn, stampFx } from "@/lib/client/fx.ts";
import { PORTRAIT_H, PORTRAIT_W, portraitCanvas } from "@/lib/client/portrait.ts";
import { clearSave, parseSave, readSaveRaw, subscribeSave, writeSave } from "@/lib/client/save.ts";

const barColor = v => v >= 60 ? "var(--grn)" : v >= 35 ? "var(--amb)" : "var(--red)";
const relColor = v => v >= 30 ? "var(--grn)" : v > -30 ? "var(--amb)" : "var(--red)";
const signed = v => v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0";

// Цвета — CSS-переменные: на столе и на листе бумаги (.sv-paper) они разные.
const G = Object.fromEntries(["bg","bg2","bg3","bdr","bdr2","gold","gld2","blue","bl2","txt","tx2","tx3","grn","amb","red"].map(k => [k, `var(--${k})`]));
const mono   = "var(--font-ptmono), 'PT Mono', 'Courier New', monospace";
const serif  = "var(--font-serif), 'PT Serif', Georgia, serif";
const narrow = "var(--font-narrow), 'PT Sans Narrow', 'Arial Narrow', sans-serif";
const hov = (active) => ({
  onMouseOver: e => { if (!active) { e.currentTarget.style.background = G.bg3; e.currentTarget.style.borderColor = G.gold; } },
  onMouseOut:  e => { if (!active) { e.currentTarget.style.background = G.bg2; e.currentTarget.style.borderColor = G.bdr; } }
});

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

// Карандашный портрет персонажа (рисуется один раз на имя и кэшируется).
function Portrait({ name, size = 44, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !name) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(portraitCanvas(name, isFemaleName(name)), 0, 0);
  }, [name]);
  return <canvas ref={ref} width={PORTRAIT_W} height={PORTRAIT_H} aria-hidden="true"
    style={{ width:size, height:Math.round(size * 1.25), background:"var(--paper-hi)", border:"1px solid rgba(0,0,0,.18)", boxShadow:"0 1px 3px rgba(0,0,0,.2)", flexShrink:0, ...style }}/>;
}
// Кто из известных людей произносит реплику: имя стоит в её начале.
const speakerOf = (gs, text) => [...(gs.keyFigures ?? []), ...(gs.advisors ?? [])].find(p => String(text).includes(p.name));

function Divider() { return <div style={{ height:1, background:G.bdr, margin:"0 0 24px" }}/>; }
function Label({ children }) { return <div style={{ fontFamily:narrow, fontWeight:700, fontSize:13, letterSpacing:".06em", textTransform:"uppercase", color:G.tx3, marginBottom:10 }}>{children}</div>; }
// Лист бумаги на столе. accent оставлен для совместимости вызовов и не рисуется.
function Card({ children, style, className = "" }) {
  return <div className={`sv-paper ${className}`} style={{ borderRadius:2, padding:"20px 22px", ...style }}>{children}</div>;
}
function PrimaryBtn({ children, onClick, disabled, danger, id }) {
  return (
    <button id={id} onClick={onClick} disabled={disabled}
      onMouseOver={e=>{ if (!disabled) e.currentTarget.style.filter="brightness(1.08)"; }} onMouseOut={e=>{e.currentTarget.style.filter="none";}}
      style={{ background:danger?G.red:G.gold, border:"none", color:"var(--on-gold)", padding:"12px 30px", borderRadius:2, fontSize:16, fontWeight:700, letterSpacing:".06em", opacity:disabled?.45:1, boxShadow:"0 2px 0 rgba(0,0,0,.35)" }}>
      {children}
    </button>
  );
}
function Chip({ value, children }) {
  const pos = value > 0;
  return (
    <span style={{ fontFamily:narrow, fontSize:15, color:pos?G.grn:G.red, whiteSpace:"nowrap" }}>
      {children} <b>{signed(value)}</b>
    </span>
  );
}
function IconDelta({ k, value }) {
  const pos = value > 0;
  return (
    <span title={`${RES_CONFIG.find(r => r.key === k)?.prompt}: ${signed(value)}`} style={{ display:"inline-flex", alignItems:"center", gap:4, fontFamily:narrow, fontSize:16, fontWeight:700, color:pos?G.grn:G.red, whiteSpace:"nowrap" }}>
      <ResIcon k={k} size={17} color={pos?G.grn:G.red}/>{signed(value)}
      <span style={{ position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0 0 0 0)" }}>{SHORT[k]}</span>
    </span>
  );
}
function ResourceChips({ delta }) {
  const items = RES_CONFIG.filter(r => delta?.[r.key]);
  if (!items.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px" }}>
      {items.map(r => <IconDelta key={r.key} k={r.key} value={delta[r.key]}/>)}
    </div>
  );
}
function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ marginBottom:10, padding:"12px 16px", borderRadius:2, background:"rgba(184,82,82,0.12)", border:`1px solid ${G.red}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
      <span style={{ fontFamily:narrow, fontSize:15, color:G.red, letterSpacing:".06em" }}>✖ {message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ background:"transparent", border:`1px solid ${G.red}`, color:G.red, padding:"6px 16px", borderRadius:2, fontSize:15, letterSpacing:".05em" }}>
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
      <div style={{ height:2, background:G.bdr, borderRadius:2 }}>
        <div style={{ height:"100%", width:`${val}%`, background:c, borderRadius:2, transition:"all .7s ease" }}/>
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
      <div style={{ height:2, background:G.bdr, borderRadius:2, position:"relative" }}>
        <div style={{ position:"absolute", left:"50%", top:-1, width:1, height:4, background:G.bdr2 }}/>
        <div style={{ height:"100%", width:`${pct}%`, background:c, borderRadius:2, transition:"all .6s ease" }}/>
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
          style={{ background:"transparent", border:`1px solid ${G.bdr}`, color:G.tx3, borderRadius:10, width:18, height:18, fontSize:10, lineHeight:"16px", padding:0 }}>?</button>
      </div>
      {info && (
        <div style={{ fontFamily:serif, fontSize:12, color:G.tx2, lineHeight:1.5, marginBottom:10, padding:"8px 10px", background:G.bg3, borderRadius:2 }}>
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
            <div style={{ height:r.me?4:2, background:G.bdr, borderRadius:2 }}>
              <div style={{ height:"100%", width:`${r.share}%`, background:c, borderRadius:2, transition:"all .7s ease" }}/>
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

function ChoicePreview({ gs, c }) {
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
        {c.tags.map(t => ACTIONS[t].label).join(" · ")} · <ChanceBadge p={successChance(gs, c)}/> · <i style={{ fontFamily:serif }}>{c.hint}</i>
      </div>
      <ResourceChips delta={fx.resources}/>
      {later.length > 0 && (
        <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:6, lineHeight:1.45 }}>
          Позже: {later.map((d, k) => {
            const fx = RES_CONFIG.filter(r => d.res[r.key]).map(r => `${SHORT[r.key].toLowerCase()} ${signed(d.res[r.key])}`).join(", ");
            const good = Object.values(d.res).reduce((a, b) => a + (b ?? 0), 0) >= 0;
            return <span key={d.label} style={{ color:good ? G.grn : G.red }}>{k ? "; " : ""}{d.label} ({fx}) через {plural(d.turns, "ход", "хода", "ходов")}</span>;
          })}
        </div>
      )}
      {crisis && <div style={{ fontFamily:narrow, fontSize:15, color:G.grn, marginTop:6 }}>Закроет кризис «{crisis.title}», если исполнят</div>}
    </>
  );
}

function ChanceBadge({ p }) {
  const pct = Math.round(p * 100);
  const c = pct >= 75 ? G.grn : pct >= 55 ? G.amb : G.red;
  return <span title="Шанс, что решение исполнят как задумано. Зависит от советника, отношения исполнителей и ресурсов." style={{ color:c, fontWeight:700 }}>исполнят с шансом {pct}%</span>;
}

const stars = n => "★".repeat(n) + "☆".repeat(3 - n);

// Совет: ограниченное число раз за мандат советники предлагают свои решения.
function CouncilPanel({ gs, onConvened, optProps, stamping }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const proposals = gs.currentEvent?.council;
  const charges = gs.councilCharges ?? 0;
  const silent = proposals?.length ? (gs.advisors ?? []).filter(a => !proposals.some(p => p.advisor?.id === a.id)) : [];
  if (gs.currentEvent?.beat) {
    return (
      <div style={{ marginTop:6, paddingTop:14, borderTop:`1px solid ${G.bdr}`, fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx3 }}>
        Дело засекречено: совет в него не посвящён. Решать вам одному.
      </div>
    );
  }

  const convene = async () => {
    if (busy || charges <= 0) return;
    setBusy(true); setErr(null);
    try { onConvened(await apiFor(gs.mode).council(gs)); }
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
          style={{ display:"block", width:"100%", textAlign:"left", padding:"14px 16px", marginBottom:6, borderRadius:2, background:"transparent", border:`1px dashed ${G.bdr2}`, color:G.txt, position:"relative" }}>
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
            style={{ background:"transparent", border:`1.5px solid ${charges?G.gold:G.bdr}`, color:charges?G.gold:G.tx3, padding:"8px 18px", borderRadius:2, fontSize:15, fontWeight:700, opacity:charges && !Array.isArray(proposals)?1:.5 }}>
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
    <div style={{ margin:"18px 0", padding:"16px 18px", background:G.bg3, border:`1px solid ${G.bdr}`, boxShadow:"0 3px 10px -4px rgba(0,0,0,.35)", transform:`rotate(${secret ? -0.5 : 0.4}deg)` }}>
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

// ── HUD ───────────────────────────────────────────────────────────────────────
const SHORT = { politicalCapital:"Политкапитал", economy:"Экономика", military:"Силовики", externalReputation:"Репутация", internalLegitimacy:"Легитимность", personalResource:"Личный ресурс" };

// Постоянная панель статуса. При наведении на вариант показывает итог хода, посчитанный движком.
function Hud({ gs, preview, onMenu, onHelp }) {
  const ci = IDEOLOGIES.find(i => i.id === gs.ideo);
  let plan = null;
  if (preview && gs.currentEvent) { try { plan = planTurn(gs, preview.id, { assumeSuccess: true }); } catch { plan = null; } }
  const rating = computePolls(gs.country, gs.factions, gs.resources).leader;
  const nextRating = plan ? computePolls(gs.country, plan.factions, plan.resources).leader : null;
  const next = nextElection(gs.turn);
  const arrow = (a, b) => b === null || b === a ? null : <span style={{ color:b > a ? G.grn : G.red }}> → {b}</span>;
  return (
    <header className="sv-hud">
      <div style={{ maxWidth:1080, margin:"0 auto", padding:"10px 14px" }}>
        <div className="sv-hud-top" style={{ marginBottom:10 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>{COUNTRIES[gs.country].flag} {gs.country} · {ci.label.toLowerCase()}</div>
            <div style={{ fontFamily:serif, fontSize:18, fontWeight:600, color:G.gold, lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{gs.leader.name}</div>
          </div>
          <div className="sv-hud-track" style={{ display:"flex", flexDirection:"column", gap:4, flex:"1 1 260px", maxWidth:360 }}>
            <div style={{ display:"flex", gap:2 }} aria-label={`Ход ${gs.turn} из ${MAX_TURNS}`}>
              {Array.from({ length: MAX_TURNS }, (_, i) => {
                const t = i + 1;
                const done = t <= gs.turn, now = t === gs.turn + 1, vote = !!ELECTIONS[t];
                return <div key={t} title={vote ? `${t} ход — ${ELECTION_LABEL[ELECTIONS[t]].toLowerCase()}` : `${t} ход`}
                  style={{ flex:1, marginLeft:t > 1 && (t - 1) % 5 === 0 ? 5 : 0, height:vote ? 8 : 5, alignSelf:"flex-end", borderRadius:1, background: done ? G.gold : now ? G.gld2 : vote ? G.bdr2 : G.bdr, opacity: done ? .75 : 1, outline: now ? `1px solid ${G.gld2}` : "none" }}/>;
              })}
            </div>
            <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>
              {gs.year} · глава {ROMAN[chapterOf(Math.min(gs.turn + 1, MAX_TURNS))]} · ход {Math.min(gs.turn + 1, MAX_TURNS)}/{MAX_TURNS}{next ? ` · ${next.label.toLowerCase()} ${inTurns(next.in)}` : ""}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:narrow, fontSize:13, color:G.tx3 }}>рейтинг</div>
              <div style={{ fontFamily:serif, fontSize:22, fontWeight:600, color:rating >= 35 ? G.grn : rating >= 20 ? G.amb : G.red, lineHeight:1 }}>
                {rating}%<span style={{ fontSize:14 }}>{arrow(rating, nextRating)}</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={onHelp} title="Как играть" aria-label="Как играть"
                style={{ background:"transparent", border:`1px solid ${G.bdr2}`, color:G.tx2, width:30, height:30, borderRadius:2, fontSize:15 }}>?</button>
              <button onClick={onMenu} title="В меню (партия сохранится)"
                style={{ background:"transparent", border:`1px solid ${G.bdr2}`, color:G.tx2, padding:"0 12px", height:30, borderRadius:2, fontSize:15 }}>Меню</button>
            </div>
          </div>
        </div>
        <div className="sv-hud-res">
          {RES_CONFIG.map(r => {
            const v = gs.resources[r.key];
            const to = plan ? plan.resources[r.key] : null;
            const d = to === null ? 0 : to - v;
            const danger = (to ?? v) <= LIMITS.endResource;
            const dot = Math.abs(d) >= 6 ? 11 : 6;
            return (
              <div key={r.key} title={`${r.prompt}: ${v}${d ? ` → ${to}` : ""}`} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <div style={{ height:11, display:"flex", alignItems:"center" }}>
                  {d !== 0 && <span className="sv-fade" style={{ width:dot, height:dot, borderRadius:"50%", background:d > 0 ? G.grn : G.red }}/>}
                </div>
                <ResIcon k={r.key} value={v} size={34} color={danger && to !== null ? G.red : barColor(v)}/>
                <div style={{ fontFamily:narrow, fontSize:14, lineHeight:1, color:G.tx2, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>
                  {v}{d !== 0 && <span style={{ color:d > 0 ? G.grn : G.red }}>→{to}</span>}
                </div>
              </div>
            );
          })}
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
const tutorialSeen = () => { try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch { return true; } };

function SoundToggle() {
  const [on, setOn] = useState(soundOn);
  return (
    <button onClick={() => { setSound(!on); setOn(!on); }} aria-pressed={on}
      style={{ background:"transparent", border:`1px solid ${G.bdr2}`, color:G.tx2, padding:"8px 14px", borderRadius:2, fontSize:15 }}>
      Звук: {on ? "включён" : "выключен"}
    </button>
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
    ["Каждый ход — одно решение", `Под каждым вариантом — его цена и то, что аукнется позже. ${desktop ? "Наведите на вариант — панель сверху покажет итог." : "Первое касание покажет итог на панели сверху, второе — подпишет решение."}`],
    ["Не дайте ресурсам рухнуть", "Ниже 20 — кризис, 4 и ниже — падение власти. Легитимность на нуле — революция, враждебные силовики — переворот."],
    ["Выборы решают всё", "Парламентские на 10-м ходу, президентские на 20-м. Рейтинг — это отношение групп общества к вам плюс легитимность и экономика."],
    ["У вас есть тайна", "В каждой партии развивается главная интрига. Эпизоды помечены «Главная интрига» — ваши решения в них определят развязку."],
    ...(desktop ? [["Клавиши", "1–9 — выбрать, Enter — подтвердить или дочитать, Esc — закрыть окно."]] : []),
  ];
  return (
    <div className="sv-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="sv-fade sv-paper" style={{ maxWidth:560, width:"100%", maxHeight:"90vh", overflowY:"auto", borderRadius:2, padding:"24px 24px 20px" }}>
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
          <div style={{ fontFamily:serif, fontSize:14, color:G.tx2, marginTop:6, lineHeight:1.5 }}>Значок заполняется по уровню опоры. Точка над ним при выборе — опора изменится: крупная точка — сильно.</div>
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
          {COUNTRIES[d.country].flag} {d.country} · {DIFFICULTIES[d.diff].label.toLowerCase()} · {IDEOLOGIES.find(i => i.id === d.ideo)?.label.toLowerCase()}
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
            {meta.runs.slice(0, 6).map(r => (
              <div key={r.seed} style={{ display:"flex", justifyContent:"space-between", gap:8, fontFamily:narrow, fontSize:15, color:G.tx2, marginBottom:4 }}>
                <span>{COUNTRIES[r.country]?.flag} {r.leader} — «{r.title}»{r.daily && <span style={{ color:G.gold }}> · дело дня</span>}</span>
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
function Setup({ onStart, saved, onResume }) {
  const [country, setCountry] = useState(null);
  const [diff, setDiff]       = useState(null);
  const [ideo, setIdeo]       = useState(null);
  const [mode, setMode]       = useState("classic");
  const [aiOk, setAiOk]       = useState(false); // переключатель режимов показываем, только если ИИ доступен
  useEffect(() => {
    let live = true;
    aiApi.available().then(ok => { if (!live) return; setAiOk(ok); if (!ok) setMode("classic"); });
    return () => { live = false; };
  }, []);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const metaRaw = useSyncExternalStore(subscribeMeta, readMetaRaw, () => null);
  const meta = useMemo(() => parseMeta(metaRaw), [metaRaw]);
  const open = unlockedCountries(meta);
  const ready = country && diff && ideo;

  const go = async (c = country, d = diff, i = ideo, daily = null) => {
    if (!(c && d && i) || loading) return;
    setLoading(true); setErr(null);
    try {
      const m = daily ? "classic" : mode; // дело дня — авторский сюжет, одинаковый у всех
      const intro = await apiFor(m).setup(c, d, i, daily?.seed);
      const st = createInitialState(c, d, i, intro, daily ? seededRandom(daily.seed) : Math.random, m);
      onStart(daily ? { ...st, daily: daily.date } : st);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Ошибка API. Попробуйте снова.");
      setLoading(false);
    }
  };

  const quick = () => {
    const pickOne = list => list[Math.floor(Math.random() * list.length)];
    go(pickOne(open), "coalition", pickOne(IDEOLOGIES).id);
  };

  const btnS = (active) => ({
    display:"block", width:"100%", textAlign:"left", padding:"11px 14px", marginBottom:7, borderRadius:2,
    background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt
  });

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"36px 16px" }}>
      <div style={{ maxWidth:580, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3, marginBottom:16 }}>
            {"ПОЛИТИЧЕСКИЙ ТРИЛЛЕР"}
            <span style={{ marginLeft:12, padding:"2px 8px", borderRadius:2, border:`1px solid ${G.bdr2}`, fontSize:10, color:G.bdr2 }}>v{APP_VERSION}</span>
          </div>
          <h1 style={{ fontFamily:serif, fontSize:42, fontWeight:600, color:G.gold }}>Суверен</h1>
          <div style={{ fontFamily:serif, fontSize:17, color:G.tx2, fontStyle:"italic", marginTop:10, marginBottom:20 }}>Двадцать решений. Одна страна. Ни одного права на ошибку.</div>
          <Divider/>
        </div>

        {saved && (
          <Card accent={G.gold} style={{ marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, letterSpacing:".05em", marginBottom:4 }}>СОХРАНЁННАЯ ПАРТИЯ</div>
              <div style={{ fontFamily:serif, fontSize:17, color:G.txt }}>
                {COUNTRIES[saved.state.country].flag} {saved.state.leader.name}
              </div>
              <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, marginTop:2 }}>
                {saved.state.ended ? "правление завершено" : `ход ${saved.state.turn}/${MAX_TURNS} · ${saved.state.year}`}
              </div>
            </div>
            <PrimaryBtn onClick={onResume}>ПРОДОЛЖИТЬ</PrimaryBtn>
          </Card>
        )}

        {aiOk && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:22 }} className="sv-two-col">
          {[
            { id:"classic", title:"ТРИЛЛЕР", desc:"Авторский сюжет · офлайн · бесплатно" },
            { id:"ai",      title:"ИИ-РЕЖИССЁР", desc:"Импровизирует сюжет · тратит лимит Claude" },
          ].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} {...hov(mode === m.id)} aria-pressed={mode === m.id}
              style={{ textAlign:"left", padding:"12px 14px", borderRadius:2, background:mode===m.id?G.bg3:G.bg2, border:`1px solid ${mode===m.id?G.gold:G.bdr}`, color:mode===m.id?G.gld2:G.txt }}>
              <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", marginBottom:4 }}>{m.title}</div>
              <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{m.desc}</div>
            </button>
          ))}
        </div>}

        <div style={{ textAlign:"center", marginBottom:26 }}>
          <PrimaryBtn onClick={quick} disabled={loading}>БЫСТРАЯ ПАРТИЯ</PrimaryBtn>
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:8 }}>случайная страна и идеология · сложность «Коалиция»</div>
        </div>

        <DailyCard meta={meta} disabled={loading} onPlay={d => go(d.country, d.diff, d.ideo, d)}/>

        {meta.runs.length > 0 && <Archive meta={meta}/>}

        <div style={{ marginBottom:22 }}>
          <Label>СТРАНА</Label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:country?10:0 }}>
            {Object.entries(COUNTRIES).map(([name, c]) => {
              const active = country === name;
              const locked = !open.includes(name);
              const endings = meta.endings[name]?.length ?? 0;
              return (
                <button key={name} onClick={()=>!locked && setCountry(name)} disabled={locked} {...hov(active)}
                  title={locked ? "Откроется после первой завершённой партии" : `Открыто концовок: ${endings}/${ALL_ENDINGS.length}`}
                  style={{ padding:"14px 6px", borderRadius:2, textAlign:"center", background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt, opacity:locked ? .45 : 1 }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{locked ? "🔒" : c.flag}</div>
                  <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em" }}>{name.toUpperCase()}</div>
                  {!locked && endings > 0 && <div style={{ fontFamily:narrow, fontSize:15, color:G.gold, marginTop:4 }}>{"◆".repeat(endings)}{"◇".repeat(ALL_ENDINGS.length - endings)}</div>}
                </button>
              );
            })}
          </div>
          {country && <div style={{ padding:"11px 14px", background:G.bg2, border:`1px solid ${G.bdr}`, borderRadius:2, fontSize:14, color:G.tx2, fontStyle:"italic", lineHeight:1.6, fontFamily:serif }}>{COUNTRIES[country].context}</div>}
        </div>

        <div style={{ marginBottom:22 }}>
          <Label>СЛОЖНОСТЬ</Label>
          {Object.entries(DIFFICULTIES).map(([id, d]) => {
            const active = diff === id;
            return (
              <button key={id} onClick={()=>setDiff(id)} {...hov(active)} style={btnS(active)}>
                <span style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em" }}><span style={{ color:G.gold, letterSpacing:2, marginRight:8 }}>{"▮".repeat(Object.keys(DIFFICULTIES).indexOf(id) + 1)}<span style={{ color:G.bdr2 }}>{"▮".repeat(3 - Object.keys(DIFFICULTIES).indexOf(id))}</span></span>{d.label}</span>
                <span style={{ fontFamily:serif, fontSize:14, color:active?G.gld2:G.tx2, marginLeft:10, fontStyle:"italic" }}>{d.desc}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom:28 }}>
          <Label>ИДЕОЛОГИЯ</Label>
          <div className="sv-two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {IDEOLOGIES.map(i => {
              const active = ideo === i.id;
              return (
                <button key={i.id} onClick={()=>setIdeo(i.id)} {...hov(active)}
                  style={{ textAlign:"left", padding:"12px 14px", borderRadius:2, background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt }}>
                  <div style={{ fontFamily:narrow, fontSize:15, marginBottom:4 }}>{i.emoji} {i.label.toUpperCase()}</div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{i.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {err && <div style={{ fontFamily:mono, color:G.red, fontSize:12, textAlign:"center", marginBottom:12 }}>{err}</div>}
        <div style={{ textAlign:"center" }}>
          <PrimaryBtn onClick={() => go()} disabled={!ready||loading}>{loading?"СОЗДАНИЕ МИРА...":saved?"НОВАЯ ПАРТИЯ":"НАЧАТЬ"}</PrimaryBtn>
          {saved && <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:10 }}>Новая партия заменит сохранённую</div>}
        </div>
      </div>
    </div>
  );
}

// ── INTRO ─────────────────────────────────────────────────────────────────────
function Intro({ gs, onGo }) {
  const { country, ideo, leader, speech, situation, keyFigures } = gs;
  const ci = IDEOLOGIES.find(i => i.id === ideo);
  const relC = l => l === "союзник" ? G.grn : l === "враг" ? G.red : G.tx3;
  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"28px 16px" }}>
      <div style={{ maxWidth:660, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3, marginBottom:12 }}>{COUNTRIES[country].flag} {country.toUpperCase()} · НОВОЕ РУКОВОДСТВО</div>
          <Divider/>
        </div>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:12, fontFamily:mono, fontSize:12, color:G.tx3, marginBottom:12, flexWrap:"wrap" }}>
            <span>Личное дело № {docNumber(gs)}</span><span>{COUNTRIES[country].startYear}</span>
          </div>
          <Portrait name={leader.name} size={100} style={{ float:"right", margin:"0 0 10px 16px", transform:"rotate(2deg)" }}/>
          <div style={{ fontFamily:serif, fontSize:34, fontWeight:700, color:G.txt, lineHeight:1.15, marginBottom:4 }}>{leader.name}</div>
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2, marginBottom:10 }}>Президент · партия {leader.party} · {ci.label.toLowerCase()}</div>
          <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, fontStyle:"italic", lineHeight:1.7 }}>{leader.bio}</div>
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
        <div style={{ textAlign:"center" }}><PrimaryBtn onClick={onGo}>ПРИСТУПИТЬ К УПРАВЛЕНИЮ →</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── GAME ──────────────────────────────────────────────────────────────────────
function Game({ gs, setGs, onEnd, onMenu }) {
  const needsEvent = !gs.ended && !gs.currentEvent && !gs.lastTurn;
  const [busy, setBusy]       = useState(needsEvent ? "event" : null); // "event" | "choice" | null
  const [error, setError]     = useState(null); // { message, choice? }
  const [sideTab, setSideTab] = useState("res");
  const [preview, setPreview] = useState(null); // вариант под курсором/фокусом
  const [armed, setArmed]     = useState(null); // тач: первое касание выбирает, второе — подписывает
  const [help, setHelp]       = useState(() => !tutorialSeen());
  const gsRef = useRef(gs);
  const inFlight = useRef(false);
  const [stamping, setStamping] = useState(null); // резолюция, на которую опускается печать
  useEffect(() => { gsRef.current = gs; }, [gs]);

  const [attempt, setAttempt] = useState(0);
  const [typedTurn, setTypedTurn] = useState(null);
  const typed = typedTurn === gs.turn;
  const prefetch = useRef(null); // следующее событие грузится, пока игрок читает итог
  const commit = useCallback(next => { gsRef.current = next; setGs(next); }, [setGs]);

  // Новое событие запрашивается, когда его нет и отчёт о прошлом ходе уже закрыт.
  useEffect(() => {
    if (!needsEvent) return;
    let cancelled = false;
    const pf = prefetch.current;
    prefetch.current = null;
    const request = pf && pf.turn === gsRef.current.turn ? pf.promise : apiFor(gsRef.current.mode).event(gsRef.current);
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
      const consequence = await apiFor(gsRef.current.mode).consequence(gsRef.current, choice.id);
      const next = resolveTurn(gsRef.current, choice.id, consequence);
      commit(next);
      if (next.lastTurn && next.lastTurn.chance < 1) outcomeFx(next.lastTurn.success !== false);
      if (!next.ended) {
        const promise = apiFor(next.mode).event(next);
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
    setBusy("event"); setError(null); setPreview(null); setArmed(null);
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

  const optProps = (c, n) => ({
    id: `opt-${n}`,
    className: "sv-opt",
    "data-armed": armed === c.id || undefined,
    onClick: () => {
      if (armed !== c.id && matchMedia("(pointer:coarse)").matches) { setArmed(c.id); setPreview(c); return; }
      setArmed(null); choose(c);
    },
    onMouseEnter: () => setPreview(c), onMouseLeave: () => setPreview(null),
    onFocus: () => setPreview(c), onBlur: () => { setPreview(null); setArmed(null); },
  });

  const { resources, prevResources, factions, prevFactions, keyFigures, prevFigures, turn, history, activeCrises, currentEvent: event, lastTurn } = gs;
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
      <Hud gs={gs} preview={busy ? null : preview} onMenu={onMenu} onHelp={() => setHelp(true)}/>
      {help && <HowToPlay onClose={() => setHelp(false)}/>}
      <div style={{ display:"flex", justifyContent:"center", padding:"14px" }}>
      <div className="sv-game-grid" style={{ maxWidth:1080, width:"100%", display:"grid", gridTemplateColumns:"260px 1fr", gap:14 }}>

        <div className="sv-sidebar">
          <PollWidget gs={gs}/>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:4, margin:"10px 0 6px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setSideTab(t.id)} title={t.title} aria-label={t.title}
                style={{ padding:"7px 0", borderRadius:2, border:`1px solid ${sideTab===t.id?G.gold:G.bdr}`, background:sideTab===t.id?G.bg3:G.bg2, color:sideTab===t.id?G.gold:G.tx3, fontSize:15 }}>
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
                  const prev = prevFigures?.find(p => p.id === f.id);
                  const c = relColor(f.relation);
                  const delta = prev ? f.relation - prev.relation : 0;
                  return (
                    <div key={f.id} style={{ display:"flex", gap:10, marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${G.bdr}` }}>
                      <Portrait name={f.name} size={32}/>
                      <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontFamily:serif, fontSize:13, fontWeight:500 }}>{f.name}</span>
                        <span style={{ fontFamily:narrow, fontSize:15, color:c }}>
                          {signed(f.relation)}
                          {delta!==0&&<span style={{ marginLeft:3, color:delta>0?G.grn:G.red }}>{signed(delta)}</span>}
                        </span>
                      </div>
                      <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:2 }}>{f.role}</div>
                      <div style={{ height:2, background:G.bdr, borderRadius:2, marginTop:4 }}>
                        <div style={{ height:"100%", width:`${((f.relation+100)/200)*100}%`, background:c, borderRadius:2, transition:"all .6s" }}/>
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

        <div className="sv-main">
          {warnLevel !== "none" && !busy && !gs.ended && (
            <div style={{ marginBottom:10, padding:"10px 16px", borderRadius:2, background:warnLevel==="critical"?"rgba(184,82,82,0.15)":"rgba(201,160,74,0.12)", border:`1px solid ${warnLevel==="critical"?G.red:G.amb}` }}>
              <span style={{ fontFamily:narrow, fontSize:15, color:warnLevel==="critical"?G.red:G.amb, letterSpacing:".05em" }}>
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
                <div key={c.id} style={{ marginBottom:6, padding:"10px 14px", borderRadius:2, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.red, letterSpacing:".05em" }}>КРИЗИС · {c.title.toUpperCase()}</span>
                    <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3, whiteSpace:"nowrap" }}>{c.severity} · {plural(c.turnsActive, "ход", "хода", "ходов")}</span>
                  </div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, marginTop:4, fontStyle:"italic" }}>{c.description}</div>
                  {Object.keys(c.resourceDrain||{}).length > 0 && <div style={{ marginTop:6 }}><ResourceChips delta={c.resourceDrain}/></div>}
                </div>
              ))}
            </div>
          )}

          {busy && <Loading kind={busy}/>}

          {!busy && event && (
            <div>
              {event.randomEvent && (
                <div style={{ marginBottom:10, padding:"10px 14px", borderRadius:2, background:"rgba(74,122,170,0.1)", border:`1px solid ${G.blue}` }}>
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
                <h2 style={{ fontFamily:serif, fontSize:28, fontWeight:700, color:G.txt, lineHeight:1.2, marginBottom:16, textWrap:"balance" }}>{event.title}</h2>
                <Prose text={event.description}/>
                {event.affectedFactions?.length > 0 && (
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginTop:10 }}>
                    Касается: {event.affectedFactions.map(fid => factions.find(x => x.id === fid)?.name).filter(Boolean).join(", ")}
                  </div>
                )}
              </Card>
              <Card style={{ padding:"18px 0 8px" }}>
                <div style={{ padding:"0 24px" }}><Label>{"Резолюция"}</Label></div>
                {event.choices.map((c, i) => (
                  <button key={c.id} {...optProps(c, i + 1)}
                    style={{ display:"block", width:"100%", textAlign:"left", padding:"14px 24px 14px 52px", background:"transparent", border:"none", borderTop:`1px solid ${G.bdr}`, color:G.txt, position:"relative" }}>
                    <span style={{ position:"absolute", left:22, top:13, fontFamily:serif, fontWeight:700, fontSize:18, color:G.tx3 }}>{i + 1}.</span>
                    <ChoicePreview gs={gs} c={c}/>
                    {stamping === c.id && <span className="sv-stamp sv-stamp-hit">Исполнить</span>}
                  </button>
                ))}
                <div style={{ padding:"0 24px 12px" }}>
                <CouncilPanel gs={gs} stamping={stamping} onConvened={list => commit(conveneCouncil(gsRef.current, list))} optProps={(c, i) => optProps(c, event.choices.length + i + 1)}/>
                </div>
              </Card>
            </div>
          )}

          {!busy && !event && lastTurn && (
            <div>
              <Card style={{ marginBottom:12, padding:"20px 24px 22px" }}>
                <div className="sv-reveal">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"10px 14px", marginBottom:18, flexWrap:"wrap" }}>
                  <div style={{ minWidth:0, flex:"1 1 240px" }}>
                    <div style={{ fontFamily:narrow, fontWeight:700, fontSize:13, letterSpacing:".06em", textTransform:"uppercase", color:G.tx3, marginBottom:2 }}>Ваша резолюция</div>
                    <div className="sv-hand" style={{ fontSize:21, lineHeight:1.25 }}>{lastTurn.choiceText}. — {signature(gs.leader.name)}</div>
                  </div>
                  {lastTurn.chance < 1 && (
                    <span className={`sv-stamp sv-in${lastTurn.success === false ? " is-red" : ""}`} style={{ fontSize:15, flexShrink:0 }}>
                      {lastTurn.success === false ? "Не исполнено" : "Исполнено"}
                      <span style={{ display:"block", fontSize:11, fontWeight:400, letterSpacing:0, textTransform:"none" }}>шанс был {Math.round(lastTurn.chance * 100)}%</span>
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10, flexWrap:"wrap", borderTop:`2px solid ${G.txt}`, borderBottom:`1px solid ${G.txt}`, padding:"5px 0 4px", marginBottom:12 }}>
                  <span style={{ fontFamily:serif, fontWeight:700, fontSize:19 }}>Вечерний {COUNTRIES[gs.country].capital}</span>
                  <span style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{gs.year} · № {turn}</span>
                </div>
                <h2 style={{ fontFamily:narrow, fontWeight:700, fontSize:32, lineHeight:1.08, color:G.txt, marginBottom:14, textWrap:"balance" }}>{lastTurn.headline}</h2>
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
                {lastTurn.historianNote && (
                  <div style={{ fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx3, margin:"10px 0 4px", textAlign:"right" }}>— {lastTurn.historianNote}</div>
                )}

                {(turnDelta || Object.keys(lastTurn.factionRelChanges||{}).length > 0) && (
                  <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${G.bdr2}`, display:"flex", flexWrap:"wrap", gap:"2px 14px", alignItems:"baseline" }}>
                    <span style={{ fontFamily:narrow, fontWeight:700, fontSize:13, letterSpacing:".06em", textTransform:"uppercase", color:G.tx3, marginRight:4 }}>Итог</span>
                    {turnDelta && RES_CONFIG.filter(r => turnDelta[r.key]).map(r => <IconDelta key={r.key} k={r.key} value={turnDelta[r.key]}/>)}
                    {Object.entries(lastTurn.factionRelChanges||{}).map(([fid,v]) => {
                      const f = factions.find(x => x.id === fid);
                      return f ? <Chip key={fid} value={v}>{f.name}</Chip> : null;
                    })}
                  </div>
                )}
                </div>
                </div>
              </Card>
              <div className="sv-reveal" style={{ display: typed ? "block" : "none" }}>

              {lastTurn.matured?.map(p => (
                <div key={p.id} className="sv-paper" style={{ marginBottom:8, padding:"12px 16px", borderRadius:2 }}>
                  <div style={{ fontFamily:serif, fontSize:16, fontWeight:700, marginBottom:2 }}>{p.label}</div>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3, marginBottom:6 }}>эхо решения {p.event ? `по делу «${p.event}»` : `«${p.source}»`}</div>
                  <ResourceChips delta={p.res}/>
                </div>
              ))}
              {lastTurn.election && (
                <div style={{ marginBottom:8, padding:"12px 14px", borderRadius:2, background:G.bg2, border:`1px solid ${lastTurn.election.outcome==="won"?G.grn:G.red}` }}>
                  <div style={{ fontFamily:narrow, fontSize:15, color:lastTurn.election.outcome==="won"?G.grn:G.red, letterSpacing:".05em", marginBottom:4 }}>
                    {ELECTION_LABEL[lastTurn.election.kind].toUpperCase()}: {lastTurn.election.outcome==="won" ? "ПОБЕДА" : lastTurn.election.outcome==="impeached" ? "РАЗГРОМ И ИМПИЧМЕНТ" : "ПОРАЖЕНИЕ"}
                  </div>
                  <div style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>
                    ваша партия {lastTurn.election.leader}% · {lastTurn.election.top.name} {lastTurn.election.top.share}%
                  </div>
                </div>
              )}
              {lastTurn.resolvedCrisis && (
                <div style={{ marginBottom:8, padding:"10px 14px", borderRadius:2, background:"rgba(92,184,122,0.08)", border:`1px solid ${G.grn}` }}>
                  <span style={{ fontFamily:narrow, fontSize:15, color:G.grn }}>КРИЗИС ПРЕОДОЛЁН · {lastTurn.resolvedCrisis.toUpperCase()}</span>
                </div>
              )}
              {lastTurn.expiredCrises?.map(t => (
                <div key={t} style={{ marginBottom:8, padding:"10px 14px", borderRadius:2, background:G.bg2, border:`1px solid ${G.bdr2}` }}>
                  <span style={{ fontFamily:narrow, fontSize:15, color:G.tx2 }}>КРИЗИС ЗАТИХ · {t.toUpperCase()}</span>
                </div>
              ))}
              {lastTurn.newCrisis && (
                <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:2, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
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

function ShareButton({ gs }) {
  const [state, setState] = useState(null); // "ok" | "manual"
  const text = shareText(gs);
  const saveCard = async () => {
    const blob = await resultCard(gs).catch(() => null);
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `suveren-${gs.leader.name.replace(/\s+/g, "-")}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const copy = async () => {
    const blob = matchMedia("(pointer:coarse)").matches ? await resultCard(gs).catch(() => null) : null;
    const file = blob && new File([blob], "suveren.png", { type:"image/png" });
    if (file && navigator.canShare?.({ files:[file] })) {
      try { await navigator.share({ files:[file], text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    if (telegramShare(text.replace(shareUrl(), "").trim(), shareUrl())) return;
    if (navigator.share && matchMedia("(pointer:coarse)").matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); setState("ok"); }
    catch { setState("manual"); }
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
      <PrimaryBtn onClick={copy}>{state === "ok" ? "✓ СКОПИРОВАНО" : "ПОДЕЛИТЬСЯ ИТОГОМ"}</PrimaryBtn>
      {window.self === window.top && <button onClick={saveCard} style={{ background:"transparent", border:"none", color:G.tx2, fontSize:15, textDecoration:"underline", textUnderlineOffset:3 }}>Сохранить карточку итога</button>}
      {state === "manual" && (
        <textarea readOnly value={text} rows={5} onFocus={e => e.target.select()} aria-label="Итог правления"
          style={{ width:280, background:G.bg, color:G.txt, border:`1px solid ${G.bdr2}`, borderRadius:2, padding:8, fontFamily:narrow, fontSize:15 }}/>
      )}
    </div>
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
    return () => { live = false; };
  }, [gs]);
  if (!board) return null;
  const friends = board.friends.length > 1;
  const rows = tab === "friends" && friends ? board.friends : board.top;
  const invite = async () => {
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
      <button onClick={invite} style={{ marginTop:12, background:"transparent", border:`1.5px solid ${G.gold}`, color:G.gold, padding:"8px 16px", borderRadius:2, fontSize:15, fontWeight:700 }}>
        {copied ? "Ссылка скопирована" : "Позвать друга в таблицу"}
      </button>
    </Card>
  );
}

// ── ENDING ────────────────────────────────────────────────────────────────────
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
    apiFor(gsRef.current.mode).ending(gsRef.current).then(
      v => {
        if (cancelled) return;
        const next = setVerdict(gsRef.current, v);
        gsRef.current = next;
        setGs(next);
        const run = recordRun(next);
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
          <div style={{ fontFamily:narrow, fontSize:15, letterSpacing:".05em", color:G.tx3, marginBottom:12 }}>{COUNTRIES[gs.country].flag} {gs.country.toUpperCase()} · {gs.endType ? END_TYPES[gs.endType].toUpperCase() : "КОНЕЦ ПРАВЛЕНИЯ"}</div>
          <Divider/>
        </div>

        <Card style={{ marginBottom:12, textAlign:"center" }}>
          <Portrait name={gs.leader.name} size={96} style={{ display:"block", margin:"0 auto 12px", transform:"rotate(-1.5deg)", filter:isLoss ? "grayscale(1) contrast(.9)" : "none" }}/>
          <div style={{ fontFamily:serif, fontSize:34, fontWeight:700, color:G.txt, marginBottom:6 }}>{gs.leader.name}</div>
          {verdict?.title && <div style={{ margin:"10px 0 20px" }}><span className={`sv-stamp${isLoss ? " is-red" : ""}`} style={{ fontSize:17 }}>{verdict.title}</span></div>}
          <div style={{ fontFamily:narrow, fontSize:15, color:G.tx3 }}>{startYear}–{gs.year} · {plural(gs.history.length, "решение", "решения", "решений")} · ресурсы {avgRes}/100 · рейтинг {pa}%</div>
        </Card>

        {loading && <Card style={{ padding:"50px 20px", textAlign:"center" }}><div style={{ fontFamily:mono, fontSize:13, color:G.tx3, letterSpacing:".05em" }}>{"Историки пишут хронику…"}</div></Card>}
        {!loading && error && <ErrorBanner message={error} onRetry={retry}/>}

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
                    <div style={{ height:2, background:G.bdr, borderRadius:2 }}><div style={{ height:"100%", width:`${v}%`, background:c, borderRadius:2 }}/></div>
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
                    <div style={{ height:2, background:G.bdr, borderRadius:2 }}>
                      <div style={{ height:"100%", width:`${((f.relation+100)/200)*100}%`, background:c, borderRadius:2 }}/>
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
          {verdict && <ShareButton gs={gs}/>}
          <PrimaryBtn onClick={onRestart}>НОВАЯ ПАРТИЯ</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("setup");
  const [gs, setGs]         = useState(null);
  const savedRaw = useSyncExternalStore(subscribeSave, readSaveRaw, () => null);
  const saved = useMemo(() => parseSave(savedRaw), [savedRaw]);
  useEffect(() => { rememberRef(); initTelegram(G.bg, () => cloudGet("meta").then(importMeta)); }, []);

  // Автосохранение: после каждого изменения партии, пока игрок не в меню.
  useEffect(() => {
    if (gs && screen !== "setup") writeSave({ version: SAVE_VERSION, screen, state: gs });
  }, [gs, screen]);

  const resume = () => { if (saved) { setGs(saved.state); setScreen(saved.screen); } };
  const restart = () => { clearSave(); setGs(null); setScreen("setup"); };

  return (
    <>
      {screen==="setup"  && <Setup  saved={saved} onResume={resume} onStart={d=>{setGs(d);setScreen("intro");}}/>}
      {screen==="intro"  && <Intro  gs={gs} onGo={()=>setScreen("game")}/>}
      {screen==="game"   && <Game   gs={gs} setGs={setGs} onEnd={()=>setScreen("ending")} onMenu={()=>setScreen("setup")}/>}
      {screen==="ending" && <Ending gs={gs} setGs={setGs} onRestart={restart}/>}
    </>
  );
}
