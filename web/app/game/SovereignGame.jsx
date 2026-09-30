"use client";
import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { ACTIONS, APP_VERSION, COUNTRIES, ADVISOR_SKILL, ELECTIONS, ELECTION_LABEL, END_TYPES, LIMITS, NON_VOTING_BLOCS, DIFFICULTIES, IDEOLOGIES, MAX_TURNS, RES_CONFIG, SAVE_VERSION } from "@/lib/game/data.ts";
import { choiceEffects, computePolls, delayedEffects, planTurn, successChance, createInitialState, isSurvival, endCause, plural, conveneCouncil, resolveTurn, seededRandom, setVerdict, startEvent, warningLevel } from "@/lib/game/engine.ts";
import { api as aiApi } from "@/lib/client/api.ts";
import { classicApi } from "@/lib/game/classic.ts";
import { ARCS } from "@/lib/content/arcs.ts";
import { ACHIEVEMENTS, ALL_ENDINGS, dailyCase, parseMeta, readMetaRaw, recordRun, subscribeMeta, unlockedCountries } from "@/lib/client/meta.ts";

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
import { clearSave, parseSave, readSaveRaw, subscribeSave, writeSave } from "@/lib/client/save.ts";

const barColor = v => v >= 60 ? "#5cb87a" : v >= 35 ? "#c9a04a" : "#b85252";
const relColor = v => v >= 30 ? "#5cb87a" : v > -30 ? "#c9a04a" : "#b85252";
const signed = v => v > 0 ? `+${v}` : `${v}`;

const G = {
  bg:"#07090e", bg2:"#0c1120", bg3:"#111b2e",
  bdr:"#1a2438", bdr2:"#243452",
  gold:"#c8a86c", gld2:"#e0c488",
  blue:"#4a7aaa", bl2:"#6a9aca",
  txt:"#d6d2c6", tx2:"#9d9a8c", tx3:"#77756c",
  grn:"#5cb87a", amb:"#c9a04a", red:"#b85252",
};
const mono  = "var(--font-tech), var(--font-ptmono), 'Courier New', monospace";
const serif = "var(--font-serif), 'Georgia', serif";
const hov = (active) => ({
  onMouseOver: e => { if (!active) { e.currentTarget.style.background = G.bg3; e.currentTarget.style.borderColor = G.gold; } },
  onMouseOut:  e => { if (!active) { e.currentTarget.style.background = G.bg2; e.currentTarget.style.borderColor = G.bdr; } }
});

function Divider() { return <div style={{ height:1, background:`linear-gradient(to right,transparent,${G.bdr2},transparent)`, margin:"0 0 24px" }}/>; }
function Label({ children }) { return <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".18em", color:G.tx3, marginBottom:12 }}>{children}</div>; }
function Card({ children, style, accent }) {
  return <div style={{ background:G.bg2, border:`1px solid ${G.bdr}`, borderRadius:6, padding:"18px 20px", ...(accent?{borderLeft:`3px solid ${accent}`}:{}), ...style }}>{children}</div>;
}
function PrimaryBtn({ children, onClick, disabled, danger, id }) {
  return (
    <button id={id} onClick={onClick} disabled={disabled}
      onMouseOver={e=>{e.currentTarget.style.background=G.bg3;}} onMouseOut={e=>{e.currentTarget.style.background="transparent";}}
      style={{ background:"transparent", border:`1px solid ${danger?G.red:G.gold}`, color:disabled?G.tx3:danger?G.red:G.gold, padding:"12px 36px", borderRadius:4, fontSize:13, letterSpacing:".2em", opacity:disabled?.5:1 }}>
      {children}
    </button>
  );
}
function Chip({ value, children }) {
  const pos = value > 0;
  return (
    <span style={{ fontFamily:mono, fontSize:10, padding:"3px 8px", borderRadius:3, background:pos?"rgba(92,184,122,0.1)":"rgba(184,82,82,0.1)", color:pos?G.grn:G.red, border:`1px solid ${pos?"rgba(92,184,122,0.25)":"rgba(184,82,82,0.25)"}` }}>
      {children} {signed(value)}
    </span>
  );
}
function ResourceChips({ delta }) {
  const items = RES_CONFIG.filter(r => delta?.[r.key]);
  if (!items.length) return null;
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
      {items.map(r => <Chip key={r.key} value={delta[r.key]}>{r.label}</Chip>)}
    </div>
  );
}
function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ marginBottom:10, padding:"12px 16px", borderRadius:4, background:"rgba(184,82,82,0.12)", border:`1px solid ${G.red}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
      <span style={{ fontFamily:mono, fontSize:11, color:G.red, letterSpacing:".06em" }}>✖ {message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{ background:"transparent", border:`1px solid ${G.red}`, color:G.red, padding:"6px 16px", borderRadius:4, fontSize:11, letterSpacing:".15em" }}>
          ПОВТОРИТЬ
        </button>
      )}
    </div>
  );
}

function ResBar({ label, val, prev }) {
  const c = barColor(val);
  const delta = prev !== undefined ? val - prev : 0;
  return (
    <div style={{ marginBottom:9 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontFamily:mono, fontSize:11, color:G.tx2 }}>{label}</span>
        <span style={{ fontFamily:mono, fontSize:11, color:c, fontWeight:"bold" }}>
          {val}{delta!==0&&<span style={{ color:delta>0?G.grn:G.red, fontSize:10, marginLeft:2 }}>{signed(delta)}</span>}
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
        <span style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>{label}</span>
        <span style={{ fontFamily:mono, fontSize:10, color:c }}>
          {signed(val)}
          {delta !== 0 && <span style={{ color:delta>0?G.grn:G.red, fontSize:10, marginLeft:2 }}>{signed(delta)}</span>}
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
        <span style={{ fontFamily:mono, fontSize:10, letterSpacing:".15em", color:G.tx3 }}>ОПРОС</span>
        <button onClick={()=>setInfo(v=>!v)} aria-expanded={info} title="Как считается рейтинг"
          style={{ background:"transparent", border:`1px solid ${G.bdr}`, color:G.tx3, borderRadius:10, width:18, height:18, fontSize:10, lineHeight:"16px", padding:0 }}>?</button>
      </div>
      {info && (
        <div style={{ fontFamily:serif, fontSize:12, color:G.tx2, lineHeight:1.5, marginBottom:10, padding:"8px 10px", background:G.bg3, borderRadius:4 }}>
          Голосуют группы общества — по своему весу. Группа поддерживает вас тем сильнее, чем лучше её отношение к вам и чем выше легитимность и экономика. Недовольные уходят к партии-конкуренту своего лагеря. Запад и Кремль не голосуют. Рейтинг ≤ {LIMITS.endRating}% — революция.
        </div>
      )}
      {rows.map(r => {
        const d = r.prev !== undefined ? r.share - r.prev : 0;
        const c = r.me ? G.gold : r.muted ? G.tx3 : G.bl2;
        return (
          <div key={r.id} style={{ marginBottom:7 }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:6, marginBottom:2 }}>
              <span style={{ fontFamily:mono, fontSize:10, color:r.me?G.gld2:G.tx2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.me ? "★ " : ""}{r.name}</span>
              <span style={{ fontFamily:mono, fontSize:10, color:c, whiteSpace:"nowrap" }}>
                {r.share}%{d !== 0 && <span style={{ color:d>0?G.grn:G.red, marginLeft:3 }}>{signed(d)}</span>}
              </span>
            </div>
            <div style={{ height:r.me?4:2, background:G.bdr, borderRadius:2 }}>
              <div style={{ height:"100%", width:`${r.share}%`, background:c, borderRadius:2, transition:"all .7s ease" }}/>
            </div>
          </div>
        );
      })}
      <div style={{ fontFamily:mono, fontSize:10, color:leading?G.grn:G.amb, marginTop:8, letterSpacing:".06em" }}>
        {leading ? "▲ ВЫ ЛИДИРУЕТЕ" : "▼ КОНКУРЕНТ ВПЕРЕДИ"}{next ? ` · ${next.label.toLowerCase()} ${inTurns(next.in)}` : ""}
      </div>
    </Card>
  );
}

function ChoicePreview({ gs, c }) {
  const fx = choiceEffects(gs, c);
  const crisis = c.resolvesCrisis && gs.activeCrises.find(x => x.id === c.resolvesCrisis);
  return (
    <>
      {c.advisor && (
        <div style={{ fontFamily:mono, fontSize:10, color:G.gold, marginBottom:4 }}>
          {c.advisor.name} · {c.advisor.role.toLowerCase()} {stars(c.advisor.skill)}
        </div>
      )}
      <div style={{ fontFamily:mono, fontSize:10, color:G.bl2, letterSpacing:".12em", marginBottom:5, paddingRight:30 }}>
        {c.tags.map(t => ACTIONS[t].label.toUpperCase()).join(" · ")}
        <ChanceBadge p={successChance(gs, c)}/>
      </div>
      <div style={{ fontFamily:serif, fontSize:16, fontWeight:500, marginBottom:4 }}>{c.text}</div>
      <div style={{ fontFamily:mono, fontSize:11, color:G.tx3, marginBottom:8 }}>{c.hint}</div>
      <ResourceChips delta={fx.resources}/>
      {delayedEffects(c).length > 0 && (
        <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:7, lineHeight:1.6 }}>
          ПОЗЖЕ · {delayedEffects(c).map(d => {
            const fx = RES_CONFIG.filter(r => d.res[r.key]).map(r => `${SHORT[r.key].toLowerCase()} ${signed(d.res[r.key])}`).join(", ");
            const good = Object.values(d.res).reduce((a, b) => a + (b ?? 0), 0) >= 0;
            return <span key={d.label} style={{ color:good ? G.grn : G.red, marginRight:10 }}>{d.label} ({fx}) через {plural(d.turns, "ход", "хода", "ходов")}</span>;
          })}
        </div>
      )}
      {crisis && <div style={{ fontFamily:mono, fontSize:10, color:G.grn, marginTop:6 }}>✔ закроет кризис «{crisis.title}»</div>}
    </>
  );
}

function ChanceBadge({ p }) {
  const pct = Math.round(p * 100);
  const c = pct >= 75 ? G.grn : pct >= 55 ? G.amb : G.red;
  return <span title="Шанс, что решение исполнят как задумано. Зависит от советника, отношения исполнителей и ресурсов." style={{ marginLeft:10, color:c, letterSpacing:".04em" }}>◎ {pct}%</span>;
}

const stars = n => "★".repeat(n) + "☆".repeat(3 - n);

// Совет: ограниченное число раз за мандат советники предлагают свои решения.
function CouncilPanel({ gs, onConvened, optProps }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);
  const proposals = gs.currentEvent?.council;
  const charges = gs.councilCharges ?? 0;

  const convene = async () => {
    if (busy || charges <= 0) return;
    setBusy(true); setErr(null);
    try { onConvened(await apiFor(gs.mode).council(gs)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop:14, paddingTop:14, borderTop:`1px dashed ${G.bdr2}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:10 }}>
        <span style={{ fontFamily:mono, fontSize:11, letterSpacing:".18em", color:G.tx3 }}>{"СОВЕТ"}</span>
        <span style={{ fontFamily:mono, fontSize:10, color:charges?G.gold:G.tx3 }}>сборов осталось: {charges}</span>
      </div>
      {proposals?.length ? proposals.map((c, i) => (
        <button key={c.id} {...optProps(c, i)}
          style={{ display:"block", width:"100%", textAlign:"left", padding:"13px 16px", marginBottom:8, borderRadius:4, background:"rgba(200,168,108,0.04)", border:`1px solid ${G.bdr}`, color:G.txt }}>
          <span className="sv-key">{optProps(c, i).id.slice(4)}</span>
          <ChoicePreview gs={gs} c={c}/>
        </button>
      )) : (
        <>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
            {(gs.advisors ?? []).map(a => (
              <span key={a.id} title={`${a.role} · ${ADVISOR_SKILL[a.skill].label}`}
                style={{ fontFamily:mono, fontSize:10, padding:"4px 8px", borderRadius:3, border:`1px solid ${G.bdr}`, color:G.tx2 }}>
                {a.name} <span style={{ color:G.gold }}>{stars(a.skill)}</span>
              </span>
            ))}
          </div>
          <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic", marginBottom:10 }}>
            Каждый советник предложит своё решение из своей области. Сильный советник предлагает ходы дешевле и выгоднее.
          </div>
          <button onClick={convene} disabled={busy || charges <= 0}
            style={{ background:"transparent", border:`1px solid ${charges?G.gold:G.bdr}`, color:charges?G.gold:G.tx3, padding:"9px 20px", borderRadius:4, fontSize:11, letterSpacing:".15em", opacity:charges?1:.5 }}>
            {busy ? "СОВЕТНИКИ СОБИРАЮТСЯ..." : charges ? "СОБРАТЬ СОВЕТ" : "СОВЕТ ИСЧЕРПАН"}
          </button>
          {err && <div style={{ fontFamily:mono, fontSize:11, color:G.amb, marginTop:8 }}>✖ {err}</div>}
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
        ? <div key={i} style={{ fontFamily:mono, fontSize:11, color:G.gold, letterSpacing:".04em", lineHeight:1.7, marginBottom:14, paddingLeft:10, borderLeft:`2px solid ${G.bdr2}` }}>{p}</div>
        : <p key={i} style={{ fontFamily:serif, fontSize:16, lineHeight:1.8, color:i === 1 ? G.txt : G.tx2, marginBottom:12 }}>{p}</p>)}
    </div>
  );
}

// Документ хода: вырезка из газет или перехват спецслужб.
function DocumentCard({ doc }) {
  const secret = doc.kind === "intercept";
  return (
    <div style={{ margin:"14px 0", padding:"14px 16px", background:secret ? "rgba(184,82,82,0.06)" : "rgba(214,210,198,0.04)", border:`1px dashed ${secret ? G.red : G.bdr2}`, borderRadius:3 }}>
      <div style={{ fontFamily:mono, fontSize:10, letterSpacing:".2em", color:secret ? G.red : G.tx2, marginBottom:10 }}>{doc.title}</div>
      {doc.lines.map((l, i) => (
        <div key={i} style={{ fontFamily:secret ? mono : serif, fontSize:secret ? 12 : 16, fontWeight:secret ? 400 : 600, fontStyle:secret && i > 0 ? "italic" : "normal", color:secret && i > 0 ? G.tx3 : G.txt, lineHeight:1.5, padding:"4px 0", borderTop:!secret && i ? `1px solid ${G.bdr}` : "none" }}>{l}</div>
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
const SHORT = { politicalCapital:"ПОЛИТКАП.", economy:"ЭКОНОМИКА", military:"СИЛОВИКИ", externalReputation:"РЕПУТАЦИЯ", internalLegitimacy:"ЛЕГИТИМН.", personalResource:"ЛИЧН. РЕС." };

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
            <div style={{ fontFamily:mono, fontSize:10, letterSpacing:".14em", color:G.bl2 }}>{COUNTRIES[gs.country].flag} {gs.country.toUpperCase()} · {ci.emoji} {ci.label.toUpperCase()}</div>
            <div style={{ fontFamily:serif, fontSize:18, fontWeight:600, color:G.gold, lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{gs.leader.name}</div>
          </div>
          <div className="sv-hud-track" style={{ display:"flex", flexDirection:"column", gap:4, flex:"1 1 260px", maxWidth:360 }}>
            <div style={{ display:"flex", gap:2 }} aria-label={`Ход ${gs.turn} из ${MAX_TURNS}`}>
              {Array.from({ length: MAX_TURNS }, (_, i) => {
                const t = i + 1;
                const done = t <= gs.turn, now = t === gs.turn + 1, vote = !!ELECTIONS[t];
                return <div key={t} title={vote ? `${t} ход — ${ELECTION_LABEL[ELECTIONS[t]].toLowerCase()}` : `${t} ход`}
                  style={{ flex:1, height:vote ? 8 : 5, alignSelf:"flex-end", borderRadius:1, background: done ? G.gold : now ? G.gld2 : vote ? G.bdr2 : G.bdr, opacity: done ? .75 : 1, outline: now ? `1px solid ${G.gld2}` : "none" }}/>;
              })}
            </div>
            <div style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>
              {gs.year} · ход {Math.min(gs.turn + 1, MAX_TURNS)}/{MAX_TURNS}{next ? ` · ${next.label.toLowerCase()} ${inTurns(next.in)}` : ""}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, letterSpacing:".12em" }}>РЕЙТИНГ</div>
              <div style={{ fontFamily:serif, fontSize:22, fontWeight:600, color:rating >= 35 ? G.grn : rating >= 20 ? G.amb : G.red, lineHeight:1 }}>
                {rating}%<span style={{ fontSize:14 }}>{arrow(rating, nextRating)}</span>
              </div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={onHelp} title="Как играть" aria-label="Как играть"
                style={{ background:"transparent", border:`1px solid ${G.bdr2}`, color:G.tx2, width:28, height:28, borderRadius:4, fontSize:12 }}>?</button>
              <button onClick={onMenu} title="В меню (партия сохранится)"
                style={{ background:"transparent", border:`1px solid ${G.bdr2}`, color:G.tx2, padding:"0 10px", height:28, borderRadius:4, fontSize:10, letterSpacing:".12em" }}>МЕНЮ</button>
            </div>
          </div>
        </div>
        <div className="sv-hud-res">
          {RES_CONFIG.map(r => {
            const v = gs.resources[r.key];
            const to = plan ? plan.resources[r.key] : null;
            const lo = Math.min(v, to ?? v), hi = Math.max(v, to ?? v);
            const danger = (to ?? v) <= LIMITS.endResource;
            return (
              <div key={r.key} title={r.prompt}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:4, fontFamily:mono, fontSize:10 }}>
                  <span style={{ color:G.tx2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{SHORT[r.key]}</span>
                  <span style={{ color:barColor(v), whiteSpace:"nowrap" }}>{danger && to !== null ? "☠ " : ""}{v}{arrow(v, to)}</span>
                </div>
                <div style={{ position:"relative", height:4, background:G.bdr, borderRadius:2, marginTop:3, overflow:"hidden" }}>
                  <div style={{ position:"absolute", inset:0, width:`${lo}%`, background:barColor(v), transition:"width .5s" }}/>
                  {to !== null && hi > lo && <div style={{ position:"absolute", top:0, bottom:0, left:`${lo}%`, width:`${hi - lo}%`, background:to > v ? G.grn : G.red, opacity:.8 }}/>}
                  <div style={{ position:"absolute", top:0, bottom:0, left:"20%", width:1, background:G.bg }}/>
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

function HowToPlay({ onClose }) {
  const close = () => { try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* недоступно */ } onClose(); };
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const desktop = typeof matchMedia === "function" && matchMedia("(pointer:fine)").matches;
  const items = [
    ["Каждый ход — одно решение", "Под каждым вариантом — его цена и то, что аукнется позже. Выбранный вариант сразу показывает итог на панели сверху."],
    ["Не дайте ресурсам рухнуть", "Ниже 20 — кризис, 4 и ниже — падение власти. Легитимность на нуле — революция, враждебные силовики — переворот."],
    ["Выборы решают всё", "Парламентские на 10-м ходу, президентские на 20-м. Рейтинг — это отношение групп общества к вам плюс легитимность и экономика."],
    ["У вас есть тайна", "В каждой партии развивается главная интрига. Эпизоды помечены «Главная интрига» — ваши решения в них определят развязку."],
    ...(desktop ? [["Клавиши", "1–9 — выбрать, Enter — подтвердить или дочитать, Esc — закрыть окно."]] : []),
  ];
  return (
    <div className="sv-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="sv-fade" style={{ maxWidth:560, width:"100%", maxHeight:"90vh", overflowY:"auto", background:G.bg2, border:`1px solid ${G.bdr2}`, borderRadius:8, padding:"24px 24px 20px" }}>
        <div id="howto-title" style={{ fontFamily:serif, fontSize:28, fontWeight:600, color:G.gold, marginBottom:16 }}>Как править</div>
        {items.map(([h, t]) => (
          <div key={h} style={{ marginBottom:14 }}>
            <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".1em", color:G.gld2, marginBottom:3 }}>{h.toUpperCase()}</div>
            <div style={{ fontFamily:serif, fontSize:15, color:G.txt, lineHeight:1.55 }}>{t}</div>
          </div>
        ))}
        <div style={{ textAlign:"right", marginTop:8 }}><PrimaryBtn onClick={close}>ПОНЯТНО</PrimaryBtn></div>
      </div>
    </div>
  );
}

function DailyCard({ meta, disabled, onPlay }) {
  const d = useMemo(() => dailyCase(), []);
  const done = meta.runs.find(r => r.daily === d.date);
  const [, mm, dd] = d.date.split("-");
  return (
    <Card accent={done ? undefined : G.gold} style={{ marginBottom:22, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
      <div>
        <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, letterSpacing:".15em", marginBottom:4 }}>ДЕЛО ДНЯ · {dd}.{mm}</div>
        <div style={{ fontFamily:serif, fontSize:17, color:G.txt }}>
          {COUNTRIES[d.country].flag} {d.country} · {DIFFICULTIES[d.diff].label.toLowerCase()} · {IDEOLOGIES.find(i => i.id === d.ideo)?.label.toLowerCase()}
        </div>
        <div style={{ fontFamily:mono, fontSize:10, color:G.tx2, marginTop:3 }}>
          {done ? `ваш итог: «${done.title}» · ${END_TYPES[done.endType]}` : "одна партия на всех — сравните итог с друзьями"}
        </div>
      </div>
      {done
        ? <span style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>новое дело завтра</span>
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
        <span style={{ fontFamily:mono, fontSize:11, letterSpacing:".15em", color:G.tx2, whiteSpace:"nowrap" }}>АРХИВ ПРАВИТЕЛЕЙ</span>
        <span style={{ fontFamily:mono, fontSize:10, color:G.gold }}>
          партий {meta.runs.length} · концовок {endings}/{ALL_ENDINGS.length} · достижений {meta.achievements.length}/{ACHIEVEMENTS.length} {openList ? "▴" : "▾"}
        </span>
      </button>
      {openList && (
        <div className="sv-fade" style={{ marginTop:14 }}>
          {ACHIEVEMENTS.map(a => {
            const got = meta.achievements.includes(a.id);
            return (
              <div key={a.id} style={{ display:"flex", gap:10, marginBottom:6, opacity:got ? 1 : .5 }}>
                <span style={{ fontFamily:mono, fontSize:11, color:got ? G.gold : G.tx3, minWidth:14 }}>{got ? "●" : "○"}</span>
                <span style={{ fontFamily:mono, fontSize:11, color:got ? G.gld2 : G.tx2 }}>{a.title}</span>
                <span style={{ fontFamily:serif, fontSize:13, color:G.tx2 }}>{a.desc}</span>
              </div>
            );
          })}
          <div style={{ borderTop:`1px solid ${G.bdr}`, marginTop:10, paddingTop:10 }}>
            {meta.runs.slice(0, 6).map(r => (
              <div key={r.seed} style={{ display:"flex", justifyContent:"space-between", gap:8, fontFamily:mono, fontSize:10, color:G.tx2, marginBottom:4 }}>
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
    display:"block", width:"100%", textAlign:"left", padding:"11px 14px", marginBottom:7, borderRadius:4,
    background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt
  });

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"36px 16px" }}>
      <div style={{ maxWidth:580, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".26em", color:G.tx3, marginBottom:16 }}>
            {"ПОЛИТИЧЕСКИЙ ТРИЛЛЕР"}
            <span style={{ marginLeft:12, padding:"2px 8px", borderRadius:3, border:`1px solid ${G.bdr2}`, fontSize:10, color:G.bdr2 }}>v{APP_VERSION}</span>
          </div>
          <h1 style={{ fontFamily:serif, fontSize:42, fontWeight:600, color:G.gold }}>Суверен</h1>
          <div style={{ fontFamily:serif, fontSize:17, color:G.tx2, fontStyle:"italic", marginTop:10, marginBottom:20 }}>Двадцать решений. Одна страна. Ни одного права на ошибку.</div>
          <Divider/>
        </div>

        {saved && (
          <Card accent={G.gold} style={{ marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, letterSpacing:".15em", marginBottom:4 }}>СОХРАНЁННАЯ ПАРТИЯ</div>
              <div style={{ fontFamily:serif, fontSize:17, color:G.txt }}>
                {COUNTRIES[saved.state.country].flag} {saved.state.leader.name}
              </div>
              <div style={{ fontFamily:mono, fontSize:10, color:G.tx2, marginTop:2 }}>
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
              style={{ textAlign:"left", padding:"12px 14px", borderRadius:4, background:mode===m.id?G.bg3:G.bg2, border:`1px solid ${mode===m.id?G.gold:G.bdr}`, color:mode===m.id?G.gld2:G.txt }}>
              <div style={{ fontFamily:mono, fontSize:12, letterSpacing:".08em", marginBottom:4 }}>{m.title}</div>
              <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{m.desc}</div>
            </button>
          ))}
        </div>}

        <div style={{ textAlign:"center", marginBottom:26 }}>
          <PrimaryBtn onClick={quick} disabled={loading}>БЫСТРАЯ ПАРТИЯ</PrimaryBtn>
          <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:8 }}>случайная страна и идеология · сложность «Коалиция»</div>
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
                  style={{ padding:"14px 6px", borderRadius:4, textAlign:"center", background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt, opacity:locked ? .45 : 1 }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{locked ? "🔒" : c.flag}</div>
                  <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".1em" }}>{name.toUpperCase()}</div>
                  {!locked && endings > 0 && <div style={{ fontFamily:mono, fontSize:10, color:G.gold, marginTop:4 }}>{"◆".repeat(endings)}{"◇".repeat(ALL_ENDINGS.length - endings)}</div>}
                </button>
              );
            })}
          </div>
          {country && <div style={{ padding:"11px 14px", background:G.bg2, border:`1px solid ${G.bdr}`, borderRadius:4, fontSize:14, color:G.tx2, fontStyle:"italic", lineHeight:1.6, fontFamily:serif }}>{COUNTRIES[country].context}</div>}
        </div>

        <div style={{ marginBottom:22 }}>
          <Label>СЛОЖНОСТЬ</Label>
          {Object.entries(DIFFICULTIES).map(([id, d]) => {
            const active = diff === id;
            return (
              <button key={id} onClick={()=>setDiff(id)} {...hov(active)} style={btnS(active)}>
                <span style={{ fontFamily:mono, fontSize:12, letterSpacing:".08em" }}><span style={{ color:G.gold, letterSpacing:2, marginRight:8 }}>{"▮".repeat(Object.keys(DIFFICULTIES).indexOf(id) + 1)}<span style={{ color:G.bdr2 }}>{"▮".repeat(3 - Object.keys(DIFFICULTIES).indexOf(id))}</span></span>{d.label}</span>
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
                  style={{ textAlign:"left", padding:"12px 14px", borderRadius:4, background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt }}>
                  <div style={{ fontFamily:mono, fontSize:12, marginBottom:4 }}>{i.emoji} {i.label.toUpperCase()}</div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{i.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {err && <div style={{ fontFamily:mono, color:G.red, fontSize:12, textAlign:"center", marginBottom:12 }}>{err}</div>}
        <div style={{ textAlign:"center" }}>
          <PrimaryBtn onClick={() => go()} disabled={!ready||loading}>{loading?"СОЗДАНИЕ МИРА...":saved?"НОВАЯ ПАРТИЯ":"НАЧАТЬ"}</PrimaryBtn>
          {saved && <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:10 }}>Новая партия заменит сохранённую</div>}
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
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".22em", color:G.tx3, marginBottom:12 }}>{COUNTRIES[country].flag} {country.toUpperCase()} · НОВОЕ РУКОВОДСТВО</div>
          <Divider/>
        </div>
        <Card style={{ marginBottom:12, borderColor:G.bdr2 }}>
          <div style={{ fontFamily:serif, fontSize:32, fontWeight:600, color:G.gold, marginBottom:4 }}>{leader.name}</div>
          <div style={{ fontFamily:mono, fontSize:11, color:G.bl2, letterSpacing:".1em", marginBottom:10 }}>{leader.party} · {ci.emoji} {ci.label.toUpperCase()}</div>
          <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, fontStyle:"italic", lineHeight:1.7 }}>{leader.bio}</div>
        </Card>
        {speech && (
          <Card accent={G.blue} style={{ marginBottom:12 }}>
            <Label>{"ОБРАЩЕНИЕ К НАЦИИ"}</Label>
            <div style={{ fontFamily:serif, fontSize:16, fontStyle:"italic", lineHeight:1.8, color:G.txt }}>«{speech}»</div>
          </Card>
        )}
        {gs.arc && (
          <Card accent={G.red} style={{ marginBottom:12, background:"rgba(184,82,82,0.06)" }}>
            <Label>{"ДОСЬЕ · СЕКРЕТНО"}</Label>
            <div style={{ fontFamily:serif, fontSize:17, fontStyle:"italic", lineHeight:1.6, color:G.txt }}>{ARCS.find(a => a.id === gs.arc.id)?.teaser}</div>
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
                <div>
                  <span style={{ fontFamily:serif, fontSize:16, fontWeight:500 }}>{f.name}</span>
                  <span style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginLeft:10 }}>{f.role}</span>
                </div>
                <span style={{ fontFamily:mono, fontSize:10, color:relC(f.loyalty), letterSpacing:".1em" }}>{f.loyalty?.toUpperCase()}</span>
              </div>
            ))}
          </Card>
        )}
        {gs.advisors?.length > 0 && (
          <Card style={{ marginBottom:22 }}>
            <Label>{"ВАШ СОВЕТ"}</Label>
            {gs.advisors.map((a, i) => (
              <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<gs.advisors.length-1?`1px solid ${G.bdr}`:"none" }}>
                <div>
                  <span style={{ fontFamily:serif, fontSize:16, fontWeight:500 }}>{a.name}</span>
                  <span style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginLeft:10 }}>{a.role}</span>
                </div>
                <span style={{ fontFamily:mono, fontSize:11, color:G.gold }} title={ADVISOR_SKILL[a.skill].label}>{stars(a.skill)}</span>
              </div>
            ))}
            <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:10 }}>
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
  const [help, setHelp]       = useState(() => !tutorialSeen());
  const gsRef = useRef(gs);
  const inFlight = useRef(false);
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
    setBusy("choice"); setError(null);
    try {
      const consequence = await apiFor(gsRef.current.mode).consequence(gsRef.current, choice.id);
      const next = resolveTurn(gsRef.current, choice.id, consequence);
      commit(next);
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
    setBusy("event"); setError(null); setPreview(null);
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
    onClick: () => choose(c),
    onMouseEnter: () => setPreview(c), onMouseLeave: () => setPreview(null),
    onFocus: () => setPreview(c), onBlur: () => setPreview(null),
  });

  const { resources, prevResources, factions, prevFactions, keyFigures, prevFigures, turn, history, activeCrises, currentEvent: event, lastTurn } = gs;
  const warnLevel = warningLevel(gs);
  const turnDelta = lastTurn && prevResources
    ? Object.fromEntries(RES_CONFIG.map(r => [r.key, resources[r.key] - prevResources[r.key]]))
    : null;

  const tabs = [
    { id:"res", label:"РЕСУРСЫ", title:"Ресурсы государства" },
    { id:"fac", label:"СИЛЫ", title:"Фракции и группы общества" },
    { id:"fig", label:"ЛЮДИ", title:"Ключевые игроки" },
    { id:"log", label:"ХРОНИКА", title:"Хроника правления" },
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
                style={{ padding:"7px 0", borderRadius:4, border:`1px solid ${sideTab===t.id?G.gold:G.bdr}`, background:sideTab===t.id?G.bg3:G.bg2, color:sideTab===t.id?G.gold:G.tx3, fontSize:10, letterSpacing:".06em" }}>
                {t.label}
              </button>
            ))}
          </div>

          <Card style={{ minHeight:200 }}>
            {sideTab === "res" && (
              <>
                <Label>{"РЕСУРСЫ"}</Label>
                {RES_CONFIG.map(r => <ResBar key={r.key} label={r.label} val={resources[r.key]} prev={prevResources?prevResources[r.key]:undefined}/>)}
                <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:10, lineHeight:1.6 }}>
                  ниже 20 — кризис · ≤ {LIMITS.endResource} — падение власти<br/>ниже 30 — понемногу восстанавливается
                </div>
                {gs.pending?.length > 0 && (
                  <div style={{ marginTop:14, paddingTop:10, borderTop:`1px solid ${G.bdr}` }}>
                    <Label>{"ОЖИДАЕТСЯ"}</Label>
                    {[...gs.pending].sort((a, b) => a.due - b.due).map(p => {
                      const good = Object.values(p.res).reduce((a, b) => a + (b ?? 0), 0) >= 0;
                      const fx = RES_CONFIG.filter(r => p.res[r.key]).map(r => `${SHORT[r.key].toLowerCase()} ${signed(p.res[r.key])}`).join(", ");
                      return (
                        <div key={p.id} style={{ fontFamily:mono, fontSize:10, lineHeight:1.5, marginBottom:7, color:G.tx2 }}>
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
                        <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:-4 }}>
                          {foreign ? "внешняя сила · не голосует" : `${Math.round(f.approval / total * 100)}% избирателей`}
                          {f.relation <= -60 && <span style={{ color:G.red }}> · враждебна, вредит</span>}
                        </div>
                      </div>
                    );
                  });
                })()}
                <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:6, lineHeight:1.6 }}>шкала −100…+100 · ≤ −60 — вредит каждый ход</div>
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
                    <div key={f.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${G.bdr}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontFamily:serif, fontSize:13, fontWeight:500 }}>{f.name}</span>
                        <span style={{ fontFamily:mono, fontSize:10, color:c }}>
                          {signed(f.relation)}
                          {delta!==0&&<span style={{ fontSize:10, marginLeft:2, color:delta>0?G.grn:G.red }}>{signed(delta)}</span>}
                        </span>
                      </div>
                      <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginTop:2 }}>{f.role}</div>
                      <div style={{ height:2, background:G.bdr, borderRadius:2, marginTop:4 }}>
                        <div style={{ height:"100%", width:`${((f.relation+100)/200)*100}%`, background:c, borderRadius:2, transition:"all .6s" }}/>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {sideTab === "log" && (
              <>
                <Label>{"ХРОНИКА"}</Label>
                {history.length === 0 && <div style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>История пуста</div>}
                {[...history].reverse().slice(0,6).map((h, i) => (
                  <div key={i} style={{ marginBottom:8, paddingBottom:8, borderBottom:i<5?`1px solid ${G.bdr}`:"none" }}>
                    <div style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>{h.year}</div>
                    <div style={{ fontFamily:serif, fontSize:12, color:G.tx2, fontStyle:"italic", lineHeight:1.4 }}>«{h.headline}»</div>
                  </div>
                ))}
              </>
            )}
          </Card>
        </div>

        <div className="sv-main">
          {warnLevel !== "none" && !busy && !gs.ended && (
            <div style={{ marginBottom:10, padding:"10px 16px", borderRadius:4, background:warnLevel==="critical"?"rgba(184,82,82,0.15)":"rgba(201,160,74,0.12)", border:`1px solid ${warnLevel==="critical"?G.red:G.amb}` }}>
              <span style={{ fontFamily:mono, fontSize:11, color:warnLevel==="critical"?G.red:G.amb, letterSpacing:".1em" }}>
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
                <div key={c.id} style={{ marginBottom:6, padding:"10px 14px", borderRadius:4, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                    <span style={{ fontFamily:mono, fontSize:11, color:G.red, letterSpacing:".08em" }}>КРИЗИС · {c.title.toUpperCase()}</span>
                    <span style={{ fontFamily:mono, fontSize:10, color:G.tx3, whiteSpace:"nowrap" }}>{c.severity} · {plural(c.turnsActive, "ход", "хода", "ходов")}</span>
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
                <div style={{ marginBottom:10, padding:"10px 14px", borderRadius:4, background:"rgba(74,122,170,0.1)", border:`1px solid ${G.blue}` }}>
                  <div style={{ fontFamily:mono, fontSize:10, color:G.bl2, letterSpacing:".1em", marginBottom:4 }}>ВНЕЗАПНО</div>
                  <div style={{ fontFamily:serif, fontSize:14, fontWeight:500, color:G.txt, marginBottom:3 }}>{event.randomEvent.title}</div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic", marginBottom:6 }}>{event.randomEvent.description}</div>
                  <ResourceChips delta={event.randomEvent.resourceEffect}/>
                </div>
              )}
              <Card style={{ marginBottom:12, ...(event.beat ? { borderColor:G.red, background:"rgba(184,82,82,0.06)" } : {}) }}>
                {event.beat && (
                  <div style={{ fontFamily:mono, fontSize:11, color:G.red, letterSpacing:".14em", marginBottom:8 }}>
                    ГЛАВНАЯ ИНТРИГА · «{event.beat.arcTitle.toUpperCase()}» · ЭПИЗОД {event.beat.episode}/{event.beat.total}
                  </div>
                )}
                <div style={{ fontFamily:mono, fontSize:11, color:G.bl2, letterSpacing:".12em", marginBottom:12 }}>
                  {event.source?.toUpperCase()}
                  {event.isCritical && <span style={{ marginLeft:12, color:G.red }}>КРИТИЧЕСКОЕ</span>}
                </div>
                <div style={{ fontFamily:serif, fontSize:26, fontWeight:600, color:G.txt, lineHeight:1.25, marginBottom:14 }}>{event.title}</div>
                <Prose text={event.description}/>
                {event.affectedFactions?.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:12 }}>
                    <span style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>Затронуто:</span>
                    {event.affectedFactions.map(fid => {
                      const f = factions.find(x => x.id === fid);
                      return f ? <span key={fid} style={{ fontFamily:mono, fontSize:10, padding:"2px 7px", borderRadius:3, background:"rgba(74,122,170,0.15)", color:G.bl2, border:`1px solid rgba(74,122,170,0.3)` }}>{f.name}</span> : null;
                    })}
                  </div>
                )}
              </Card>
              <Card>
                <Label>{"ВАШЕ РЕШЕНИЕ"}</Label>
                {event.choices.map((c, i) => (
                  <button key={c.id} {...optProps(c, i + 1)}
                    style={{ display:"block", width:"100%", textAlign:"left", padding:"13px 16px", marginBottom:8, borderRadius:4, background:"rgba(255,255,255,0.02)", border:`1px solid ${G.bdr}`, color:G.txt }}>
                    <span className="sv-key">{i + 1}</span>
                    <ChoicePreview gs={gs} c={c}/>
                  </button>
                ))}
                <CouncilPanel gs={gs} onConvened={list => commit(conveneCouncil(gsRef.current, list))} optProps={(c, i) => optProps(c, event.choices.length + i + 1)}/>
              </Card>
            </div>
          )}

          {!busy && !event && lastTurn && (
            <div>
              <Card accent={G.amb} style={{ marginBottom:12 }}>
                <div className="sv-reveal">
                <Label>{"ПОСЛЕДСТВИЯ"}</Label>
                {lastTurn.success === false
                  ? <div style={{ fontFamily:mono, fontSize:11, color:G.red, letterSpacing:".08em", marginBottom:8 }}>✖ ПРОВАЛ ИСПОЛНЕНИЯ · шанс был {Math.round(lastTurn.chance * 100)}%</div>
                  : lastTurn.chance < 1 && <div style={{ fontFamily:mono, fontSize:11, color:G.grn, letterSpacing:".08em", marginBottom:8 }}>✔ ИСПОЛНЕНО · шанс был {Math.round(lastTurn.chance * 100)}%</div>}
                <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginBottom:8 }}>Решение: {lastTurn.choiceText}{lastTurn.tags?.length ? ` · ${lastTurn.tags.map(t => ACTIONS[t].label).join(", ")}` : ""}</div>
                <div style={{ fontFamily:serif, fontSize:24, fontWeight:600, color:G.gld2, marginBottom:14, lineHeight:1.25 }}>«{lastTurn.headline}»</div>
                <Typewriter key={`t${turn}`} text={lastTurn.narrative} onDone={() => setTypedTurn(turn)}/>
                <div className="sv-reveal" style={{ display: typed ? "block" : "none" }}>

                {lastTurn.document && <DocumentCard doc={lastTurn.document}/>}
                {(lastTurn.reactions||[]).slice(0, 2).map((r,i)=>(
                  <div key={i} style={{ fontFamily:serif, fontSize:15, color:G.tx2, fontStyle:"italic", padding:"7px 0", borderTop:`1px solid ${G.bdr}` }}>{r}</div>
                ))}
                {lastTurn.historianNote && (
                  <div style={{ fontFamily:serif, fontSize:14, fontStyle:"italic", color:G.tx3, margin:"10px 0 4px", textAlign:"right" }}>— {lastTurn.historianNote}</div>
                )}

                {(turnDelta || Object.keys(lastTurn.factionRelChanges||{}).length > 0) && (
                  <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${G.bdr2}`, display:"flex", flexWrap:"wrap", gap:5, alignItems:"center" }}>
                    <span style={{ fontFamily:mono, fontSize:10, color:G.tx3, letterSpacing:".14em", marginRight:4 }}>ИТОГ</span>
                    {turnDelta && RES_CONFIG.filter(r => turnDelta[r.key]).map(r => <Chip key={r.key} value={turnDelta[r.key]}>{r.label}</Chip>)}
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
                <div key={p.id} style={{ marginBottom:8, padding:"10px 14px", borderRadius:4, background:G.bg2, border:`1px solid ${G.bdr2}` }}>
                  <div style={{ fontFamily:mono, fontSize:11, color:G.tx2, marginBottom:6 }}>АУКНУЛОСЬ · {p.label.toUpperCase()} <span style={{ color:G.tx3 }}>· из-за «{p.source}»</span></div>
                  <ResourceChips delta={p.res}/>
                </div>
              ))}
              {lastTurn.election && (
                <div style={{ marginBottom:8, padding:"12px 14px", borderRadius:4, background:G.bg2, border:`1px solid ${lastTurn.election.outcome==="won"?G.grn:G.red}` }}>
                  <div style={{ fontFamily:mono, fontSize:11, color:lastTurn.election.outcome==="won"?G.grn:G.red, letterSpacing:".08em", marginBottom:4 }}>
                    {ELECTION_LABEL[lastTurn.election.kind].toUpperCase()}: {lastTurn.election.outcome==="won" ? "ПОБЕДА" : lastTurn.election.outcome==="impeached" ? "РАЗГРОМ И ИМПИЧМЕНТ" : "ПОРАЖЕНИЕ"}
                  </div>
                  <div style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>
                    ваша партия {lastTurn.election.leader}% · {lastTurn.election.top.name} {lastTurn.election.top.share}%
                  </div>
                </div>
              )}
              {lastTurn.resolvedCrisis && (
                <div style={{ marginBottom:8, padding:"10px 14px", borderRadius:4, background:"rgba(92,184,122,0.08)", border:`1px solid ${G.grn}` }}>
                  <span style={{ fontFamily:mono, fontSize:11, color:G.grn }}>КРИЗИС ПРЕОДОЛЁН · {lastTurn.resolvedCrisis.toUpperCase()}</span>
                </div>
              )}
              {lastTurn.expiredCrises?.map(t => (
                <div key={t} style={{ marginBottom:8, padding:"10px 14px", borderRadius:4, background:G.bg2, border:`1px solid ${G.bdr2}` }}>
                  <span style={{ fontFamily:mono, fontSize:11, color:G.tx2 }}>КРИЗИС ЗАТИХ · {t.toUpperCase()}</span>
                </div>
              ))}
              {lastTurn.newCrisis && (
                <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:4, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
                  <div style={{ fontFamily:mono, fontSize:11, color:G.red, marginBottom:4 }}>НОВЫЙ КРИЗИС · {lastTurn.newCrisis.title.toUpperCase()}</div>
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
          <div style={{ fontFamily:mono, fontSize:10, letterSpacing:".16em", color:G.tx3, marginTop:4 }}>{k}</div>
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
    /^https?:/.test(location.href) ? location.href.split("#")[0] : "",
  ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trim();
}

function ShareButton({ gs }) {
  const [state, setState] = useState(null); // "ok" | "manual"
  const text = shareText(gs);
  const copy = async () => {
    if (navigator.share && matchMedia("(pointer:coarse)").matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); setState("ok"); }
    catch { setState("manual"); }
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
      <PrimaryBtn onClick={copy}>{state === "ok" ? "✓ СКОПИРОВАНО" : "ПОДЕЛИТЬСЯ ИТОГОМ"}</PrimaryBtn>
      {state === "manual" && (
        <textarea readOnly value={text} rows={5} onFocus={e => e.target.select()} aria-label="Итог правления"
          style={{ width:280, background:G.bg, color:G.txt, border:`1px solid ${G.bdr2}`, borderRadius:4, padding:8, fontFamily:mono, fontSize:11 }}/>
      )}
    </div>
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
        setNewAch(recordRun(next).unlocked);
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
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".22em", color:G.tx3, marginBottom:12 }}>{COUNTRIES[gs.country].flag} {gs.country.toUpperCase()} · {gs.endType ? END_TYPES[gs.endType].toUpperCase() : "КОНЕЦ ПРАВЛЕНИЯ"}</div>
          <Divider/>
        </div>

        <Card style={{ marginBottom:12, borderColor:isLoss?G.red:G.bdr2, textAlign:"center", borderLeft:isLoss?`3px solid ${G.red}`:undefined }}>
          <div style={{ fontFamily:serif, fontSize:34, fontWeight:600, color:isLoss?G.red:G.gold, marginBottom:6 }}>{gs.leader.name}</div>
          {verdict?.title && <div style={{ fontFamily:mono, fontSize:12, color:G.amb, letterSpacing:".1em", marginBottom:6 }}>{verdict.title.toUpperCase()}</div>}
          <div style={{ fontFamily:mono, fontSize:11, color:G.tx3 }}>{startYear}–{gs.year} · {plural(gs.history.length, "решение", "решения", "решений")} · ресурсы {avgRes}/100 · рейтинг {pa}%</div>
        </Card>

        {loading && <Card style={{ padding:"50px 20px", textAlign:"center" }}><div style={{ fontFamily:mono, fontSize:13, color:G.tx3, letterSpacing:".1em" }}>{"ИСТОРИКИ ПИШУТ ХРОНИКИ..."}</div></Card>}
        {!loading && error && <ErrorBanner message={error} onRetry={retry}/>}

        {!loading && (
          <div style={{ display:"contents" }}>
            {isLoss && (verdict?.fallNarrative || gs.powerLoss) && (
              <Card accent={G.red} style={{ marginBottom:12, order:3 }}>
                <Label>{"КАК ЭТО ПРОИЗОШЛО"}</Label>
                <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.85, color:G.txt }}>{verdict?.fallNarrative || gs.powerLoss}</div>
                {endCause(gs) && <div style={{ fontFamily:mono, fontSize:11, lineHeight:1.6, color:G.red, marginTop:10, paddingTop:10, borderTop:`1px solid ${G.bdr}` }}>{endCause(gs)}</div>}
              </Card>
            )}

            {verdict && (
              <Card accent={G.amb} style={{ marginBottom:12, order:5 }}>
                <Label>{"ВЕРДИКТ ИСТОРИИ"}</Label>
                <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.85, color:G.txt, marginBottom:14 }}>{verdict.verdict}</div>
                {verdict.epitaph && <div style={{ fontFamily:serif, fontSize:15, fontStyle:"italic", color:G.tx2, padding:"12px 0", borderTop:`1px solid ${G.bdr}`, borderBottom:`1px solid ${G.bdr}` }}>«{verdict.epitaph}»</div>}
                <div style={{ marginTop:12, fontFamily:mono, fontSize:12, color:G.amb, letterSpacing:".1em" }}>ОЦЕНКА: {verdict.rating.toUpperCase()}</div>
              </Card>
            )}

            <div className="sv-two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12, order:10 }}>
              <Card>
                <Label>{"РЕСУРСЫ"}</Label>
                {RES_CONFIG.map(r => {
                  const v=gs.resources[r.key]; const c=barColor(v);
                  return <div key={r.key} style={{ marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                      <span style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>{r.label}</span>
                      <span style={{ fontFamily:mono, fontSize:10, color:c }}>{v}</span>
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
                      <span style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>{f.name}</span>
                      <span style={{ fontFamily:mono, fontSize:10, color:c }}>{signed(f.relation)}</span>
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
                    <span style={{ fontFamily:mono, fontSize:11, color:G.tx3, minWidth:36 }}>{h.year}</span>
                    <span style={{ minWidth:0 }}>
                      <span style={{ fontFamily:serif, fontSize:14, color:G.txt }}>{h.title}</span>
                      <span style={{ display:"block", fontFamily:mono, fontSize:10, color:h.success === false ? G.red : G.tx2, marginTop:2 }}>{h.success === false ? "✖ " : "→ "}{h.choice}</span>
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
            <Card accent={G.red} style={{ marginBottom:12, background:"rgba(184,82,82,0.05)", order:4 }}>
              <Label>{`ГЛАВНАЯ ИНТРИГА · «${def?.title.toUpperCase()}»`}</Label>
              <div style={{ fontFamily:serif, fontSize:17, lineHeight:1.6, color:G.txt, fontStyle:solved ? "normal" : "italic" }}>
                {solved ? gs.arc.epilogue : `Осталась нераскрытой. ${def?.teaser} Кем был ${gs.arc.targetRole ? gs.arc.targetRole.toLowerCase() : "тот человек"} ${gs.arc.target} на самом деле, история так и не узнала.`}
              </div>
            </Card>
          );
        })()}
        {verdict && <Collection/>}
        {newAch.length > 0 && (
          <Card accent={G.gold} style={{ marginBottom:16, order:6 }}>
            <Label>{"НОВЫЕ ДОСТИЖЕНИЯ"}</Label>
            {newAch.map(a => (
              <div key={a.id} className="sv-fade" style={{ marginBottom:8 }}>
                <span style={{ fontFamily:mono, fontSize:12, color:G.gld2 }}>{a.title.toUpperCase()}</span>
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
