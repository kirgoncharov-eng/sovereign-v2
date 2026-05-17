"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ── СТРАНЫ ────────────────────────────────────────────────────────────────────
const COUNTRIES = {
  "Беларусь": { flag:"🇧🇾", context:"Постлукашенковская Беларусь. Санкции Запада, жёсткая зависимость от России, силовики привыкли к авторитаризму, оппозиция в эмиграции и подполье, общество разорвано.", startYear:2025 },
  "Украина":  { flag:"🇺🇦", context:"Украина в послевоенной реконструкции. Кандидат ЕС. Западные союзники устают, олигархи ослаблены, общество истощено и требует победы.", startYear:2025 },
  "Грузия":   { flag:"🇬🇪", context:"Малое государство. Абхазия и Ю.Осетия оккупированы Россией. Один олигарх контролирует правящую партию. Заявка на ЕС под угрозой. Улица против власти.", startYear:2025 }
};

const DIFFICULTIES = {
  debut:     { label:"ДЕБЮТ",    emoji:"🟢", desc:"Убедительная победа. Мандат есть." },
  coalition: { label:"КОАЛИЦИЯ", emoji:"🟡", desc:"Хрупкое правительство, экономический спад." },
  crisis:    { label:"КРИЗИС",   emoji:"🔴", desc:"Протесты в столице. Рейтинг рушится." },
  ruins:     { label:"ОБЛОМКИ",  emoji:"⬛", desc:"Война / коллапс. Выживание — уже победа." }
};

const IDEOLOGIES = [
  { id:"liberal",     emoji:"◈", label:"Либерал",     desc:"Реформы · ЕС · Права человека" },
  { id:"nationalist", emoji:"◆", label:"Националист", desc:"Суверенитет · Традиции · Государство" },
  { id:"pragmatist",  emoji:"◇", label:"Прагматик",   desc:"Результат и баланс — главное" },
  { id:"leftist",     emoji:"●", label:"Левый",        desc:"Справедливость · Антиолигархия" }
];

const RES_CONFIG = [
  { key:"politicalCapital",   label:"ПОЛИТКАПИТАЛ" },
  { key:"economy",            label:"ЭКОНОМИКА"    },
  { key:"military",           label:"СИЛОВИКИ"     },
  { key:"externalReputation", label:"РЕПУТАЦИЯ"    },
  { key:"internalLegitimacy", label:"ЛЕГИТИМНОСТЬ" },
  { key:"personalResource",   label:"ЛИЧНЫЙ РЕС."  }
];

const START_RES = {
  debut:     { politicalCapital:72, economy:65, military:62, externalReputation:58, internalLegitimacy:70, personalResource:82 },
  coalition: { politicalCapital:50, economy:44, military:56, externalReputation:50, internalLegitimacy:46, personalResource:65 },
  crisis:    { politicalCapital:33, economy:36, military:50, externalReputation:38, internalLegitimacy:28, personalResource:55 },
  ruins:     { politicalCapital:18, economy:20, military:32, externalReputation:22, internalLegitimacy:15, personalResource:40 }
};

// ── ФРАКЦИИ (фиксированные, реалистичные) ─────────────────────────────────────
const FACTIONS_DATA = {
  "Беларусь": [
    { id:"siloviki",   name:"Силовые структуры", desc:"КГБ, МВД, ОМОН",             emoji:"🛡️", baseApproval:32 },
    { id:"gossektor",  name:"Гос. предприятия",  desc:"Директорат заводов",          emoji:"🏭", baseApproval:38 },
    { id:"church",     name:"Православная церковь",desc:"Патриархат и приходы",      emoji:"⛪", baseApproval:52 },
    { id:"opposition", name:"Демоппозиция",       desc:"Подполье и эмиграция",       emoji:"✊", baseApproval:58 },
    { id:"youth",      name:"Молодёжь",           desc:"Активисты и студенты",       emoji:"🔥", baseApproval:65 },
    { id:"west",       name:"Запад",               desc:"ЕС, США, НАТО",             emoji:"🌍", baseApproval:50 },
    { id:"russia",     name:"Кремль",              desc:"Москва и пророссийские",     emoji:"🦅", baseApproval:22 },
    { id:"media",      name:"Независимые СМИ",    desc:"Журналисты и блогеры",       emoji:"📰", baseApproval:60 },
  ],
  "Украина": [
    { id:"military",     name:"ЗСУ",               desc:"Вооружённые силы",           emoji:"⚔️", baseApproval:75 },
    { id:"oligarchs",    name:"Олигархат",          desc:"Крупный капитал",            emoji:"💼", baseApproval:18 },
    { id:"nationalists", name:"Националисты",      desc:"Радикальные движения",       emoji:"🔱", baseApproval:55 },
    { id:"west",         name:"Западные союзники", desc:"США, ЕС, НАТО",              emoji:"🌍", baseApproval:68 },
    { id:"civil",        name:"Гражданское общество",desc:"Волонтёры и НКО",         emoji:"🤝", baseApproval:70 },
    { id:"regions",      name:"Местные элиты",     desc:"Мэры и губернаторы",         emoji:"🏛️", baseApproval:40 },
    { id:"church",       name:"Церковь (ПЦУ)",     desc:"Православная церковь Украины",emoji:"⛪", baseApproval:60 },
    { id:"media",        name:"Медиа",             desc:"Телеканалы и пресса",         emoji:"📰", baseApproval:55 },
  ],
  "Грузия": [
    { id:"gdream",     name:"Грузинская мечта",    desc:"Партия Иванишвили",          emoji:"👑", baseApproval:35 },
    { id:"opposition", name:"Проевропейская оппозиция",desc:"Нацдвижение и др.",     emoji:"🌍", baseApproval:48 },
    { id:"church",     name:"Православная церковь",desc:"Патриарх и духовенство",    emoji:"⛪", baseApproval:72 },
    { id:"business",   name:"Бизнес-элиты",       desc:"Предприниматели и банки",    emoji:"💼", baseApproval:44 },
    { id:"civil",      name:"Гражданское общество",desc:"НКО и активисты",           emoji:"✊", baseApproval:62 },
    { id:"russia",     name:"Кремль",              desc:"Москва и пророссийские",     emoji:"🦅", baseApproval:20 },
    { id:"west",       name:"Западные партнёры",  desc:"ЕС, США, НАТО",              emoji:"🌍", baseApproval:58 },
    { id:"diaspora",   name:"Диаспора",            desc:"Эмигранты и зарубежная Грузия",emoji:"✈️", baseApproval:55 },
  ],
};

// Стартовые отношения фракций к игроку по идеологии
const IDEOLOGY_REL = {
  liberal:     { siloviki:-45,gossektor:-25,church:-15,opposition:+55,youth:+45,west:+65,russia:-70,media:+40, military:+10,oligarchs:-15,nationalists:-35,civil:+55,regions:+10, gdream:-55,business:+20,diaspora:+60 },
  nationalist: { siloviki:+20,gossektor:-5, church:+50,opposition:-40,youth:+15,west:-50,russia:-20,media:+10, military:+60,oligarchs:-25,nationalists:+65,civil:-20,regions:+20, gdream:-20,business:-10,diaspora:+30 },
  pragmatist:  { siloviki:+5, gossektor:+10,church:+10,opposition:-20,youth:+5, west:+15,russia:-15,media:+0,  military:+20,oligarchs:+30,nationalists:-15,civil:+10,regions:+20, gdream:+5, business:+30,diaspora:+10 },
  leftist:     { siloviki:-30,gossektor:+50,church:-35,opposition:+20,youth:+35,west:+10,russia:-20,media:+30, military:-10,oligarchs:-60,nationalists:-30,civil:+65,regions:+15, gdream:-45,business:-45,diaspora:+20 },
};
const DIFF_REL_MOD = { debut:+15, coalition:0, crisis:-20, ruins:-35 };

// Роли ключевых игроков (фиксированы, имена генерит AI)
const FIGURE_ROLES = {
  "Беларусь": [
    { id:"interior",   role:"Министр внутренних дел", faction:"siloviki",   baseMood:"враг"    },
    { id:"kgb",        role:"Директор КГБ",            faction:"siloviki",   baseMood:"враг"    },
    { id:"amb_russia", role:"Посол России",            faction:"russia",     baseMood:"нейтрал" },
    { id:"amb_eu",     role:"Посол ЕС",                faction:"west",       baseMood:"союзник" },
    { id:"opp_leader", role:"Лидер оппозиции",         faction:"opposition", baseMood:"союзник" },
    { id:"oligarch",   role:"Главный директор заводов",faction:"gossektor",  baseMood:"нейтрал" },
    { id:"patriarch",  role:"Митрополит",              faction:"church",     baseMood:"нейтрал" },
    { id:"journalist", role:"Главный редактор",        faction:"media",      baseMood:"союзник" },
  ],
  "Украина": [
    { id:"general",    role:"Командующий ЗСУ",         faction:"military",     baseMood:"нейтрал" },
    { id:"oligarch",   role:"Главный олигарх",          faction:"oligarchs",    baseMood:"нейтрал" },
    { id:"nat_leader", role:"Лидер националистов",     faction:"nationalists", baseMood:"нейтрал" },
    { id:"amb_usa",    role:"Посол США",                faction:"west",         baseMood:"союзник" },
    { id:"amb_eu",     role:"Посол ЕС",                 faction:"west",         baseMood:"союзник" },
    { id:"speaker",    role:"Спикер парламента",        faction:"regions",      baseMood:"нейтрал" },
    { id:"sbu",        role:"Глава СБУ",               faction:"military",     baseMood:"нейтрал" },
    { id:"mayor",      role:"Мэр Киева",                faction:"civil",        baseMood:"союзник" },
  ],
  "Грузия": [
    { id:"shadow",     role:"Иванишвили (тень власти)", faction:"gdream",     baseMood:"враг"    },
    { id:"opp_leader", role:"Лидер оппозиции",          faction:"opposition", baseMood:"нейтрал" },
    { id:"patriarch",  role:"Католикос-Патриарх",       faction:"church",     baseMood:"нейтрал" },
    { id:"amb_usa",    role:"Посол США",                 faction:"west",       baseMood:"союзник" },
    { id:"amb_russia", role:"Посол России",              faction:"russia",     baseMood:"нейтрал" },
    { id:"oligarch",   role:"Главный бизнесмен",        faction:"business",   baseMood:"нейтрал" },
    { id:"parliament", role:"Председатель парламента",  faction:"gdream",     baseMood:"враг"    },
    { id:"security",   role:"Глава спецслужб",          faction:"gdream",     baseMood:"враг"    },
  ],
};

// ── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────────────────────────────
function initFactions(country, ideo, diff) {
  const base = FACTIONS_DATA[country] || [];
  const ideoRel = IDEOLOGY_REL[ideo] || {};
  const mod = DIFF_REL_MOD[diff] || 0;
  return base.map(f => ({
    ...f,
    approval: f.baseApproval,
    relation: Math.max(-100, Math.min(100, (ideoRel[f.id] || 0) + mod)),
  }));
}

function initFigures(country, ideo, diff, aiPlayers) {
  const roles = FIGURE_ROLES[country] || [];
  const ideoRel = IDEOLOGY_REL[ideo] || {};
  const mod = DIFF_REL_MOD[diff] || 0;
  return roles.map((r, i) => {
    const aiPlayer = aiPlayers?.[i];
    const baseRel = (ideoRel[r.faction] || 0) + mod + (Math.random() * 20 - 10);
    return {
      id: r.id,
      role: r.role,
      faction: r.faction,
      name: aiPlayer?.name || r.role,
      loyalty: r.baseMood,
      relation: Math.max(-100, Math.min(100, Math.round(baseRel))),
    };
  });
}

function computePublicApproval(factions) {
  if (!factions?.length) return 50;
  return Math.round(factions.reduce((s, f) => s + f.approval, 0) / factions.length);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function ai(prompt, task = "event") {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, task })
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  const { text } = await r.json();
  try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()); }
  catch { return {}; }
}

// ── УТИЛИТЫ ───────────────────────────────────────────────────────────────────
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const clampRel = v => Math.max(-100, Math.min(100, Math.round(v)));
const barColor = v => v >= 60 ? "#5cb87a" : v >= 35 ? "#c9a04a" : "#b85252";
const relColor = v => v >= 20 ? "#5cb87a" : v >= -20 ? "#c9a04a" : "#b85252";
const loyaltyLabel = r => r >= 30 ? "союзник" : r <= -30 ? "враг" : "нейтрал";

function applyDeltas(res, d) {
  const n = { ...res };
  Object.entries(d || {}).forEach(([k, v]) => { if (n[k] !== undefined) n[k] = clamp(n[k] + (v || 0)); });
  return n;
}
function applyFactionChanges(factions, changes) {
  return factions.map(f => ({
    ...f,
    approval: clamp(f.approval + (changes?.approval?.[f.id] || 0)),
    relation: clampRel(f.relation + (changes?.relation?.[f.id] || 0)),
  }));
}
function applyFigureChanges(figures, changes) {
  return figures.map(fig => {
    const delta = (changes || []).find(c => c.id === fig.id);
    const newRel = clampRel(fig.relation + (delta?.delta || 0));
    return { ...fig, relation: newRel, loyalty: loyaltyLabel(newRel) };
  });
}

function formatFactions(factions) {
  return factions.map(f => `${f.emoji}${f.name}: нар.${f.approval}%|к_вам${f.relation > 0 ? '+' : ''}${f.relation}`).join("  ");
}
function formatFigures(figures) {
  return figures.map(f => `${f.name}(${f.role}):${f.relation > 0 ? '+' : ''}${f.relation}`).join("  ");
}
function formatCrises(crises) {
  if (!crises?.length) return "нет";
  return crises.map(c => `⚠️${c.title}[${c.severity},${c.turnsActive}хода]`).join(" | ");
}

function warningLevel(gs) {
  const minRes = Math.min(...Object.values(gs.resources || {}));
  const pa = computePublicApproval(gs.factions || []);
  const minFacRel = Math.min(...(gs.factions || []).map(f => f.relation));
  if (minRes <= 10 || pa <= 15 || minFacRel <= -80) return "critical";
  if (minRes <= 22 || pa <= 25 || minFacRel <= -65) return "warning";
  return "none";
}

// ── СТИЛИ ────────────────────────────────────────────────────────────────────
const G = {
  bg:"#07090e", bg2:"#0c1120", bg3:"#111b2e",
  bdr:"#1a2438", bdr2:"#243452",
  gold:"#c8a86c", gld2:"#e0c488",
  blue:"#4a7aaa", bl2:"#6a9aca",
  txt:"#ccc8be", tx2:"#8a8778", tx3:"#50504e",
  grn:"#5cb87a", amb:"#c9a04a", red:"#b85252",
};
const mono  = "'Share Tech Mono','Courier New',monospace";
const serif = "'Cormorant Garamond','Georgia',serif";
const hov = (active) => ({
  onMouseOver: e => { if (!active) { e.currentTarget.style.background = G.bg3; e.currentTarget.style.borderColor = G.gold; } },
  onMouseOut:  e => { if (!active) { e.currentTarget.style.background = G.bg2; e.currentTarget.style.borderColor = G.bdr; } }
});
const hovChoice = () => ({
  onMouseOver: e => { e.currentTarget.style.background=G.bg3;e.currentTarget.style.borderColor=G.gold;e.currentTarget.style.color=G.gld2; },
  onMouseOut:  e => { e.currentTarget.style.background="rgba(255,255,255,0.02)";e.currentTarget.style.borderColor=G.bdr;e.currentTarget.style.color=G.txt; }
});

// ── UI КОМПОНЕНТЫ ─────────────────────────────────────────────────────────────
function Fonts() {
  return <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Share+Tech+Mono&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:${G.bg};font-family:${serif};color:${G.txt}}button{cursor:pointer;transition:all .15s;font-family:${mono}}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${G.bdr2}}`}</style>;
}
function Divider() { return <div style={{ height:1, background:`linear-gradient(to right,transparent,${G.bdr2},transparent)`, margin:"0 0 24px" }}/>; }
function Label({ children }) { return <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".18em", color:G.tx3, marginBottom:12 }}>{children}</div>; }
function Card({ children, style, accent }) {
  return <div style={{ background:G.bg2, border:`1px solid ${G.bdr}`, borderRadius:6, padding:"18px 20px", ...(accent?{borderLeft:`3px solid ${accent}`}:{}), ...style }}>{children}</div>;
}
function PrimaryBtn({ children, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseOver={e=>{e.currentTarget.style.background=G.bg3;}} onMouseOut={e=>{e.currentTarget.style.background="transparent";}}
      style={{ background:"transparent", border:`1px solid ${danger?G.red:G.gold}`, color:disabled?G.tx3:danger?G.red:G.gold, padding:"12px 36px", borderRadius:4, fontSize:13, letterSpacing:".2em", opacity:disabled?.5:1 }}>
      {children}
    </button>
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
          {val}{delta!==0&&<span style={{ color:delta>0?G.grn:G.red, fontSize:10, marginLeft:2 }}>{delta>0?`+${delta}`:delta}</span>}
        </span>
      </div>
      <div style={{ height:2, background:G.bdr, borderRadius:2 }}>
        <div style={{ height:"100%", width:`${val}%`, background:c, borderRadius:2, transition:"all .7s ease" }}/>
      </div>
    </div>
  );
}

function RelBar({ label, val, prevVal, showApproval, approval }) {
  const c = relColor(val);
  const delta = prevVal !== undefined ? val - prevVal : 0;
  const pct = ((val + 100) / 200) * 100;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>{label}</span>
        <span style={{ fontFamily:mono, fontSize:10, color:c }}>
          {val > 0 ? `+${val}` : val}
          {delta !== 0 && <span style={{ color:delta>0?G.grn:G.red, fontSize:9, marginLeft:2 }}>{delta>0?`+${delta}`:delta}</span>}
          {showApproval && <span style={{ color:G.tx3, marginLeft:4 }}>{approval}%</span>}
        </span>
      </div>
      <div style={{ height:2, background:G.bdr, borderRadius:2, position:"relative" }}>
        <div style={{ position:"absolute", left:"50%", top:-1, width:1, height:4, background:G.bdr2 }}/>
        <div style={{ height:"100%", width:`${pct}%`, background:c, borderRadius:2, transition:"all .6s ease" }}/>
      </div>
    </div>
  );
}

function PublicApprovalWidget({ value }) {
  const c = value >= 50 ? G.grn : value >= 30 ? G.amb : G.red;
  const label = value >= 60 ? "ВЫСОКИЙ" : value >= 40 ? "СРЕДНИЙ" : value >= 25 ? "НИЗКИЙ" : "КРИТИЧЕСКИЙ";
  return (
    <div style={{ textAlign:"center", padding:"12px 0" }}>
      <div style={{ fontFamily:mono, fontSize:9, color:G.tx3, letterSpacing:".15em", marginBottom:6 }}>РЕЙТИНГ НАРОДА</div>
      <div style={{ fontFamily:serif, fontSize:32, fontWeight:600, color:c, lineHeight:1 }}>{value}%</div>
      <div style={{ fontFamily:mono, fontSize:9, color:c, letterSpacing:".15em", marginTop:4 }}>{label}</div>
      <div style={{ height:3, background:G.bdr, borderRadius:2, marginTop:8 }}>
        <div style={{ height:"100%", width:`${value}%`, background:c, borderRadius:2, transition:"all .7s ease" }}/>
      </div>
    </div>
  );
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
function Setup({ onStart }) {
  const [country, setCountry] = useState(null);
  const [diff, setDiff]       = useState(null);
  const [ideo, setIdeo]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const ready = country && diff && ideo;

  const go = async () => {
    if (!ready || loading) return;
    setLoading(true); setErr(null);
    try {
      const ci = IDEOLOGIES.find(i => i.id === ideo);
      const roles = FIGURE_ROLES[country] || [];
      const rolesList = roles.map(r => `${r.role}(${r.faction})`).join(", ");
      const data = await ai(
        `Страна: ${country}\nКонтекст: ${COUNTRIES[country].context}\nСложность: ${DIFFICULTIES[diff].label} — ${DIFFICULTIES[diff].desc}\nИдеология: ${ci.label}\n\nСгенерируй стартовые данные лидера и имена ключевых игроков. Все имена культурно соответствуют стране. Лидер — мужчина.\n\nКлючевые игроки которым нужны имена (в таком же порядке): ${rolesList}\n\nJSON:\n{"leader":{"name":"...","party":"...","bio":"2 предложения"},"speech":"4-5 предложений вступительной речи","situation":"4 напряжённых предложения о ситуации в стране","players":[{"name":"...","role":"...","mood":"союзник|нейтрал|враг"}]}`,
        "event"
      );
      const factions = initFactions(country, ideo, diff);
      const figures  = initFigures(country, ideo, diff, data.players);
      onStart({
        country, diff, ideo,
        leader: data,
        resources: { ...START_RES[diff] },
        prevResources: null,
        factions,
        prevFactions: null,
        keyFigures: figures,
        prevFigures: null,
        activeCrises: [],
        year: COUNTRIES[country].startYear,
        turn: 0, history: [], ended: false, endType: null,
      });
    } catch (e) { setErr("Ошибка API. Проверьте ключи и попробуйте снова."); console.error(e); }
    setLoading(false);
  };

  const btnS = (active) => ({
    display:"block", width:"100%", textAlign:"left", padding:"11px 14px", marginBottom:7, borderRadius:4,
    background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt
  });

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"36px 16px" }}>
      <div style={{ maxWidth:580, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".26em", color:G.tx3, marginBottom:16 }}>// СУВЕРЕН · ПОЛИТИЧЕСКАЯ СИМУЛЯЦИЯ //</div>
          <h1 style={{ fontFamily:serif, fontSize:42, fontWeight:600, color:G.gold }}>Конфигурация</h1>
          <div style={{ fontFamily:serif, fontSize:17, color:G.tx2, fontStyle:"italic", marginTop:10, marginBottom:20 }}>Ваши решения определят судьбу страны</div>
          <Divider/>
        </div>

        <div style={{ marginBottom:22 }}>
          <Label>СТРАНА</Label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:country?10:0 }}>
            {Object.entries(COUNTRIES).map(([name]) => {
              const active = country === name;
              return (
                <button key={name} onClick={()=>setCountry(name)} {...hov(active)}
                  style={{ padding:"14px 6px", borderRadius:4, textAlign:"center", background:active?G.bg3:G.bg2, border:`1px solid ${active?G.gold:G.bdr}`, color:active?G.gld2:G.txt }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{COUNTRIES[name].flag}</div>
                  <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".1em" }}>{name.toUpperCase()}</div>
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
                <span style={{ fontFamily:mono, fontSize:12, letterSpacing:".08em" }}>{d.emoji} {d.label}</span>
                <span style={{ fontFamily:serif, fontSize:14, color:active?G.gld2:G.tx2, marginLeft:10, fontStyle:"italic" }}>{d.desc}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom:28 }}>
          <Label>ИДЕОЛОГИЯ</Label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
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
          <PrimaryBtn onClick={go} disabled={!ready||loading}>{loading?"СОЗДАНИЕ МИРА...":"▶  НАЧАТЬ"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ── INTRO ─────────────────────────────────────────────────────────────────────
function Intro({ gs, onGo }) {
  const { country, ideo, leader, keyFigures } = gs;
  const ci = IDEOLOGIES.find(i => i.id === ideo);
  const relC = r => r >= 20 ? G.grn : r <= -20 ? G.red : G.tx3;
  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"28px 16px" }}>
      <div style={{ maxWidth:660, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".22em", color:G.tx3, marginBottom:12 }}>{COUNTRIES[country].flag} {country.toUpperCase()} · НОВОЕ РУКОВОДСТВО</div>
          <Divider/>
        </div>
        <Card style={{ marginBottom:12, borderColor:G.bdr2 }}>
          <div style={{ fontFamily:serif, fontSize:32, fontWeight:600, color:G.gold, marginBottom:4 }}>{leader.leader?.name}</div>
          <div style={{ fontFamily:mono, fontSize:11, color:G.bl2, letterSpacing:".1em", marginBottom:10 }}>{leader.leader?.party} · {ci.emoji} {ci.label.toUpperCase()}</div>
          <div style={{ fontFamily:serif, fontSize:15, color:G.tx2, fontStyle:"italic", lineHeight:1.7 }}>{leader.leader?.bio}</div>
        </Card>
        <Card accent={G.blue} style={{ marginBottom:12 }}>
          <Label>// ОБРАЩЕНИЕ К НАЦИИ</Label>
          <div style={{ fontFamily:serif, fontSize:16, fontStyle:"italic", lineHeight:1.8, color:G.txt }}>«{leader.speech}»</div>
        </Card>
        <Card accent={G.red} style={{ marginBottom:12 }}>
          <Label>// ОПЕРАТИВНАЯ ОБСТАНОВКА</Label>
          <div style={{ fontFamily:serif, fontSize:15, lineHeight:1.75, color:G.txt }}>{leader.situation}</div>
        </Card>
        {keyFigures?.length > 0 && (
          <Card style={{ marginBottom:22 }}>
            <Label>// КЛЮЧЕВЫЕ ИГРОКИ</Label>
            {keyFigures.map((f, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:i<keyFigures.length-1?`1px solid ${G.bdr}`:"none" }}>
                <div>
                  <span style={{ fontFamily:serif, fontSize:16, fontWeight:500 }}>{f.name}</span>
                  <span style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginLeft:10 }}>{f.role}</span>
                </div>
                <span style={{ fontFamily:mono, fontSize:10, color:relC(f.relation), letterSpacing:".1em" }}>{f.loyalty?.toUpperCase()}</span>
              </div>
            ))}
          </Card>
        )}
        <div style={{ textAlign:"center" }}><PrimaryBtn onClick={onGo}>ПРИСТУПИТЬ К УПРАВЛЕНИЮ →</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── GAME ──────────────────────────────────────────────────────────────────────
function Game({ gs, setGs, onEnd }) {
  const [event, setEvent]               = useState(null);
  const [consequence, setConsequence]   = useState(null);
  const [randomEvent, setRandomEvent]   = useState(null);
  const [phase, setPhase]               = useState("loading");
  const [loading, setLoading]           = useState(false);
  const [sideTab, setSideTab]           = useState("res");
  const gsRef = useRef(gs);
  useEffect(() => { gsRef.current = gs; }, [gs]);

  const buildContext = (state) => {
    const ci = IDEOLOGIES.find(i => i.id === state.ideo);
    const last = state.history.slice(-3).map(h=>`[${h.year}]${h.title}→«${h.choice}»→«${h.headline}»`).join(" | ");
    return `Страна:${state.country} | Год ${state.year} | Ход ${state.turn+1}/20 | Лидер:${state.leader.leader.name}(${ci.label})
Ресурсы: ПолитКап:${state.resources.politicalCapital} Эконом:${state.resources.economy} Сил:${state.resources.military} Реп:${state.resources.externalReputation} Лег:${state.resources.internalLegitimacy} Личн:${state.resources.personalResource}
Рейтинг народа: ${computePublicApproval(state.factions)}%
ФРАКЦИИ: ${formatFactions(state.factions)}
ИГРОКИ: ${formatFigures(state.keyFigures)}
КРИЗИСЫ: ${formatCrises(state.activeCrises)}
${last ? `ИСТОРИЯ: ${last}` : `СТАРТ: ${state.leader.situation}`}`;
  };

  const fetchEvent = useCallback(async () => {
    const state = gsRef.current;
    setLoading(true); setPhase("loading"); setConsequence(null); setRandomEvent(null);

    // Применяем drain от активных кризисов
    if (state.activeCrises?.length > 0) {
      const drainRes = { ...state.resources };
      state.activeCrises.forEach(c => {
        Object.entries(c.resourceDrain || {}).forEach(([k, v]) => {
          if (drainRes[k] !== undefined) drainRes[k] = clamp(drainRes[k] + v);
        });
      });
      const updatedCrises = state.activeCrises.map(c => ({ ...c, turnsActive: c.turnsActive + 1 }));
      const updatedGs = { ...state, resources: drainRes, activeCrises: updatedCrises };
      gsRef.current = updatedGs;
      setGs(updatedGs);
    }

    const wl = warningLevel(gsRef.current);
    const isNearEnd = wl === "critical";

    try {
      const ctx = buildContext(gsRef.current);
      const randomTrigger = gsRef.current.turn > 0 && Math.random() < 0.28;
      const data = await ai(
        `ПОЛИТИЧЕСКАЯ СИМУЛЯЦИЯ\n${ctx}\nКонтекст страны: ${COUNTRIES[gsRef.current.country].context}\n\n${isNearEnd ? "⚠️ КРИТИЧЕСКИЙ МОМЕНТ: Власть лидера под серьёзной угрозой. Событие должно отражать нарастающую нестабильность.\n\n" : ""}Сгенерируй политическое событие (реалистично для ${gsRef.current.country}). Если ресурс ниже 20 — создай кризис связанный с ним. 3-4 варианта ответа.${randomTrigger ? "\n\nТАКЖЕ сгенерируй случайное событие (randomEvent) которое уже произошло без выбора — скандал, утечка, стихия, внешнее давление — с небольшим автоматическим эффектом." : ""}\n\nJSON:\n{"title":"...","source":"МИД|Разведка|Кабинет|Улица|Кремль|Брюссель|Пресса|Олигарх|Армия|Оппозиция","description":"4-5 предложений","isCritical":${isNearEnd},"affectedFactions":["id1"],"choices":[{"id":"a","text":"...","hint":"..."},{"id":"b","text":"...","hint":"..."},{"id":"c","text":"...","hint":"..."}],"randomEvent":${randomTrigger?'{"title":"...","description":"2 предложения","resourceEffect":{"politicalCapital":0},"factionEffect":{"relation":{"id":0}}}':'null'}}`,
        "event"
      );
      if (data.randomEvent) setRandomEvent(data.randomEvent);
      setEvent(data); setPhase("event");
    } catch (e) { console.error(e); setPhase("event"); }
    setLoading(false);
  }, []); // eslint-disable-line

  useEffect(() => { fetchEvent(); }, []); // eslint-disable-line

  const handleChoice = async (choice) => {
    const state = gsRef.current;
    setLoading(true);
    try {
      const ci  = IDEOLOGIES.find(i => i.id === state.ideo);
      const ctx = buildContext(state);
      const minRes = Math.min(...Object.values(state.resources));
      const pa    = computePublicApproval(state.factions);
      const willEnd = minRes <= 4 || pa <= 5;

      const data = await ai(
        `СИМУЛЯЦИЯ — ПОСЛЕДСТВИЯ\n${ctx}\n\nСобытие: "${event.title}"\n${event.description}\nВыбор: "${choice.text}"\nИдеология лидера: ${ci.label}\n\n${willEnd ? "⚠️ ЭТО РЕШЕНИЕ ПРИВОДИТ К ПОТЕРЕ ВЛАСТИ. Опиши в narrative и powerLoss как именно произошла потеря власти — переворот, восстание, импичмент, бегство. Это должна быть драматическая история, не просто 'ресурсы закончились'.\n\n" : ""}Опиши последствия реалистично. Изменения ресурсов −25..+15. Включи изменения фракций (отдельно approval и relation) и ключевых игроков.\n\nJSON:\n{"headline":"газетный заголовок","narrative":"4-5 предложений","resourceChanges":{"politicalCapital":0,"economy":0,"military":0,"externalReputation":0,"internalLegitimacy":0,"personalResource":0},"factionChanges":{"approval":{},"relation":{}},"figureChanges":[{"id":"...","delta":0}],"reactions":["...","..."],"historianNote":"одна фраза","newCrisis":null,"crisisResolved":null,"powerLoss":${willEnd?'"опиши тип и детали потери власти одним предложением"':'null'}}`,
        "consequence"
      );

      const prevRes  = { ...state.resources };
      const prevFac  = state.factions.map(f => ({...f}));
      const prevFig  = state.keyFigures.map(f => ({...f}));

      // Применяем случайное событие если было
      let newRes = applyDeltas(state.resources, data.resourceChanges);
      if (randomEvent?.resourceEffect) newRes = applyDeltas(newRes, randomEvent.resourceEffect);

      let newFactions = applyFactionChanges(state.factions, data.factionChanges);
      if (randomEvent?.factionEffect) newFactions = applyFactionChanges(newFactions, randomEvent.factionEffect);

      const newFigures  = applyFigureChanges(state.keyFigures, data.figureChanges);
      const newTurn     = state.turn + 1;
      const newYear     = state.year + (newTurn % 4 === 0 ? 1 : 0);
      const newHistory  = [...state.history, { year:state.year, title:event.title, choice:choice.text, headline:data.headline, historianNote:data.historianNote }];

      // Обновляем кризисы
      let newCrises = state.activeCrises || [];
      if (data.crisisResolved) newCrises = newCrises.filter(c => c.title !== data.crisisResolved);
      if (data.newCrisis) newCrises = [...newCrises, { ...data.newCrisis, turnsActive:0, id: Date.now() }];

      const newPA   = computePublicApproval(newFactions);
      const isOver  = Object.values(newRes).some(v => v <= 4) || newPA <= 5 || newTurn >= 20;
      const endType = newTurn >= 20 ? "mandate" : newPA <= 5 ? "revolution" : Object.values(newRes).some(v => v <= 4) ? "collapse" : null;

      const newGs = {
        ...state,
        resources: newRes, prevResources: prevRes,
        factions: newFactions, prevFactions: prevFac,
        keyFigures: newFigures, prevFigures: prevFig,
        activeCrises: newCrises,
        turn: newTurn, year: newYear,
        history: newHistory,
        ended: isOver, endType,
        powerLoss: data.powerLoss,
      };
      gsRef.current = newGs;
      setGs(newGs);
      setConsequence(data); setPhase("consequence");
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const { resources, prevResources, factions, prevFactions, keyFigures, prevFigures, leader, country, year, turn, history, ideo, activeCrises } = gs;
  const ci = IDEOLOGIES.find(i => i.id === ideo);
  const publicApproval = computePublicApproval(factions);
  const warnLevel = warningLevel(gs);

  const tabs = [
    { id:"res",   label:"📊" },
    { id:"fac",   label:"🏛️" },
    { id:"fig",   label:"👥" },
    { id:"log",   label:"📜" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"14px" }}>
      <div style={{ maxWidth:1080, width:"100%", display:"grid", gridTemplateColumns:"260px 1fr", gap:14 }}>

        {/* SIDEBAR */}
        <div>
          <Card style={{ marginBottom:10 }}>
            <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".13em", color:G.bl2, marginBottom:6 }}>{COUNTRIES[country].flag} {country.toUpperCase()}</div>
            <div style={{ fontFamily:serif, fontSize:18, fontWeight:600, color:G.gold, lineHeight:1.2, marginBottom:4 }}>{leader.leader?.name}</div>
            <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginBottom:8 }}>{ci.emoji} {ci.label.toUpperCase()}</div>
            <div style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>◷ {year} · ход {turn}/20</div>
          </Card>

          <PublicApprovalWidget value={publicApproval}/>

          {/* Tabs */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:4, margin:"10px 0 6px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setSideTab(t.id)}
                style={{ padding:"6px 0", borderRadius:4, border:`1px solid ${sideTab===t.id?G.gold:G.bdr}`, background:sideTab===t.id?G.bg3:G.bg2, color:sideTab===t.id?G.gold:G.tx3, fontSize:14 }}>
                {t.label}
              </button>
            ))}
          </div>

          <Card style={{ minHeight:200 }}>
            {sideTab === "res" && (
              <>
                <Label>// РЕСУРСЫ</Label>
                {RES_CONFIG.map(r => <ResBar key={r.key} label={r.label} val={resources[r.key]} prev={prevResources?prevResources[r.key]:undefined}/>)}
              </>
            )}
            {sideTab === "fac" && (
              <>
                <Label>// ФРАКЦИИ</Label>
                {factions.map(f => {
                  const prev = prevFactions?.find(p => p.id === f.id);
                  return (
                    <div key={f.id} style={{ marginBottom:10 }}>
                      <div style={{ fontFamily:mono, fontSize:10, color:G.tx2, marginBottom:3 }}>{f.emoji} {f.name}</div>
                      <RelBar label="нар." val={f.approval} prevVal={prev?.approval} showApproval={false}/>
                      <RelBar label="к вам" val={f.relation} prevVal={prev?.relation}/>
                    </div>
                  );
                })}
              </>
            )}
            {sideTab === "fig" && (
              <>
                <Label>// КЛЮЧЕВЫЕ ИГРОКИ</Label>
                {keyFigures.map(f => {
                  const prev = prevFigures?.find(p => p.id === f.id);
                  const c = relColor(f.relation);
                  const delta = prev ? f.relation - prev.relation : 0;
                  return (
                    <div key={f.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${G.bdr}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontFamily:serif, fontSize:13, fontWeight:500 }}>{f.name}</span>
                        <span style={{ fontFamily:mono, fontSize:10, color:c }}>
                          {f.relation>0?"+":""}{f.relation}
                          {delta!==0&&<span style={{ fontSize:9, marginLeft:2, color:delta>0?G.grn:G.red }}>{delta>0?`+${delta}`:delta}</span>}
                        </span>
                      </div>
                      <div style={{ fontFamily:mono, fontSize:9, color:G.tx3, marginTop:2 }}>{f.role}</div>
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
                <Label>// ХРОНИКА</Label>
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

        {/* MAIN */}
        <div>
          {/* Предупреждение */}
          {warnLevel !== "none" && !loading && (
            <div style={{ marginBottom:10, padding:"10px 16px", borderRadius:4, background:warnLevel==="critical"?"rgba(184,82,82,0.15)":"rgba(201,160,74,0.12)", border:`1px solid ${warnLevel==="critical"?G.red:G.amb}` }}>
              <span style={{ fontFamily:mono, fontSize:11, color:warnLevel==="critical"?G.red:G.amb, letterSpacing:".1em" }}>
                {warnLevel==="critical" ? "🚨 КРИТИЧЕСКИЙ МОМЕНТ: Власть под серьёзной угрозой. Следующее решение может стать последним." : "⚠️ НЕСТАБИЛЬНОСТЬ: Ваше положение ослаблено. Действуйте осторожно."}
              </span>
            </div>
          )}

          {/* Активные кризисы */}
          {activeCrises?.length > 0 && !loading && (
            <div style={{ marginBottom:10 }}>
              {activeCrises.map(c => (
                <div key={c.id} style={{ marginBottom:6, padding:"10px 14px", borderRadius:4, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontFamily:mono, fontSize:11, color:G.red, letterSpacing:".08em" }}>⚠️ КРИЗИС: {c.title.toUpperCase()}</span>
                    <span style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>{c.severity} · {c.turnsActive} ход</span>
                  </div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, marginTop:4, fontStyle:"italic" }}>{c.description}</div>
                </div>
              ))}
            </div>
          )}

          {/* Случайное событие */}
          {randomEvent && !loading && (
            <div style={{ marginBottom:10, padding:"10px 14px", borderRadius:4, background:"rgba(74,122,170,0.1)", border:`1px solid ${G.blue}` }}>
              <div style={{ fontFamily:mono, fontSize:10, color:G.bl2, letterSpacing:".1em", marginBottom:4 }}>⚡ СЛУЧАЙНОЕ СОБЫТИЕ</div>
              <div style={{ fontFamily:serif, fontSize:14, fontWeight:500, color:G.txt, marginBottom:3 }}>{randomEvent.title}</div>
              <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{randomEvent.description}</div>
            </div>
          )}

          {loading && (
            <Card style={{ textAlign:"center", padding:"80px 20px" }}>
              <div style={{ fontFamily:mono, fontSize:13, color:G.tx3, letterSpacing:".1em" }}>
                {phase==="loading"?"// СИТУАЦИОННЫЙ ЦЕНТР АНАЛИЗИРУЕТ ДАННЫЕ...":"// ОБРАБОТКА ПОСЛЕДСТВИЙ..."}
              </div>
            </Card>
          )}

          {!loading && phase==="event" && event && (
            <div>
              <Card style={{ marginBottom:12 }}>
                <div style={{ fontFamily:mono, fontSize:11, color:G.bl2, letterSpacing:".12em", marginBottom:12 }}>
                  📡 {event.source?.toUpperCase()}
                  {event.isCritical && <span style={{ marginLeft:12, color:G.red }}>🚨 КРИТИЧЕСКОЕ</span>}
                </div>
                <div style={{ fontFamily:serif, fontSize:26, fontWeight:600, color:G.txt, lineHeight:1.25, marginBottom:14 }}>{event.title}</div>
                <div style={{ fontFamily:serif, fontSize:15, lineHeight:1.8, color:G.tx2 }}>{event.description}</div>
                {event.affectedFactions?.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:12 }}>
                    <span style={{ fontFamily:mono, fontSize:10, color:G.tx3 }}>Затронуто:</span>
                    {event.affectedFactions.map(fid => {
                      const f = factions.find(x => x.id === fid);
                      return f ? <span key={fid} style={{ fontFamily:mono, fontSize:10, padding:"2px 7px", borderRadius:3, background:"rgba(74,122,170,0.15)", color:G.bl2, border:`1px solid rgba(74,122,170,0.3)` }}>{f.emoji}{f.name}</span> : null;
                    })}
                  </div>
                )}
              </Card>
              <Card>
                <Label>// ВАШЕ РЕШЕНИЕ</Label>
                {(event.choices||[]).map(c => (
                  <button key={c.id} onClick={()=>handleChoice(c)} {...hovChoice()}
                    style={{ display:"block", width:"100%", textAlign:"left", padding:"13px 16px", marginBottom:8, borderRadius:4, background:"rgba(255,255,255,0.02)", border:`1px solid ${G.bdr}`, color:G.txt }}>
                    <div style={{ fontFamily:serif, fontSize:16, fontWeight:500, marginBottom:4 }}>{c.text}</div>
                    <div style={{ fontFamily:mono, fontSize:11, color:G.tx3 }}>{c.hint}</div>
                  </button>
                ))}
              </Card>
            </div>
          )}

          {!loading && phase==="consequence" && consequence && (
            <div>
              <Card accent={G.amb} style={{ marginBottom:12 }}>
                <Label>// ПОСЛЕДСТВИЯ</Label>
                <div style={{ fontFamily:serif, fontSize:24, fontWeight:600, color:G.gld2, marginBottom:14, lineHeight:1.25 }}>«{consequence.headline}»</div>
                <div style={{ fontFamily:serif, fontSize:15, lineHeight:1.8, color:G.txt, marginBottom:14 }}>{consequence.narrative}</div>

                {/* Изменения ресурсов */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
                  {Object.entries(consequence.resourceChanges||{}).filter(([,v])=>v!==0).map(([k,v])=>{
                    const cfg=RES_CONFIG.find(r=>r.key===k);
                    return cfg?<span key={k} style={{ fontFamily:mono, fontSize:10, padding:"3px 8px", borderRadius:3, background:v>0?"rgba(92,184,122,0.1)":"rgba(184,82,82,0.1)", color:v>0?G.grn:G.red, border:`1px solid ${v>0?"rgba(92,184,122,0.25)":"rgba(184,82,82,0.25)"}` }}>{cfg.label} {v>0?`+${v}`:v}</span>:null;
                  })}
                </div>

                {/* Изменения фракций */}
                {consequence.factionChanges && Object.keys({...consequence.factionChanges.relation,...consequence.factionChanges.approval}).length > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontFamily:mono, fontSize:10, color:G.tx3, marginBottom:5 }}>ФРАКЦИИ:</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {Object.entries(consequence.factionChanges.relation||{}).filter(([,v])=>v!==0).map(([fid,v])=>{
                        const f=factions.find(x=>x.id===fid);
                        return f?<span key={fid} style={{ fontFamily:mono, fontSize:10, padding:"2px 7px", borderRadius:3, background:v>0?"rgba(92,184,122,0.1)":"rgba(184,82,82,0.1)", color:v>0?G.grn:G.red, border:`1px solid ${v>0?"rgba(92,184,122,0.25)":"rgba(184,82,82,0.25)"}` }}>{f.emoji}{f.name} {v>0?`+${v}`:v}</span>:null;
                      })}
                    </div>
                  </div>
                )}

                {(consequence.reactions||[]).map((r,i)=>(
                  <div key={i} style={{ fontFamily:serif, fontSize:14, color:G.tx2, fontStyle:"italic", padding:"6px 0", borderTop:`1px solid ${G.bdr}` }}>▸ {r}</div>
                ))}
                {consequence.historianNote && (
                  <div style={{ marginTop:12, padding:"10px 14px", background:G.bg3, borderRadius:4, fontFamily:mono, fontSize:11, color:G.tx3 }}>📜 {consequence.historianNote}</div>
                )}
              </Card>

              {/* Новый кризис */}
              {consequence.newCrisis && (
                <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:4, background:"rgba(184,82,82,0.1)", border:`1px solid ${G.red}` }}>
                  <div style={{ fontFamily:mono, fontSize:11, color:G.red, marginBottom:4 }}>🔥 НОВЫЙ КРИЗИС: {consequence.newCrisis.title?.toUpperCase()}</div>
                  <div style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>{consequence.newCrisis.description}</div>
                </div>
              )}

              <div style={{ textAlign:"right" }}>
                {gs.ended
                  ? <PrimaryBtn onClick={onEnd} danger>ПОДВЕСТИ ИТОГИ →</PrimaryBtn>
                  : <PrimaryBtn onClick={fetchEvent}>СЛЕДУЮЩИЙ ХОД →</PrimaryBtn>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ENDING ────────────────────────────────────────────────────────────────────
function Ending({ gs, onRestart }) {
  const [verdict, setVerdict] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gen = async () => {
      try {
        const ci       = IDEOLOGIES.find(i => i.id === gs.ideo);
        const hist     = gs.history.map(h=>`${h.year}: ${h.title}→«${h.choice}»→«${h.headline}»`).join("\n");
        const pa       = computePublicApproval(gs.factions);
        const endTypes = { mandate:"Завершение мандата (20 ходов)", revolution:"Народная революция", collapse:"Коллапс государства" };
        const endDesc  = endTypes[gs.endType] || "Потеря власти";

        const data = await ai(
          `ЗАВЕРШЕНИЕ СИМУЛЯЦИИ\n\nСтрана: ${gs.country}\nЛидер: ${gs.leader.leader.name} (${ci.label}), ${gs.leader.leader.party}\nПериод: ${COUNTRIES[gs.country].startYear}–${gs.year}\nПричина завершения: ${endDesc}\nРейтинг народа в конце: ${pa}%\nРесурсы: ${JSON.stringify(gs.resources)}\nФракции (отношение к лидеру): ${gs.factions.map(f=>`${f.name}:${f.relation}`).join(", ")}\n${gs.powerLoss ? `Как произошла потеря власти: ${gs.powerLoss}` : ""}\n\nХроника решений:\n${hist}\n\nНапиши историческую оценку. ${gs.endType !== "mandate" ? "Начни с драматического описания как именно закончилось правление." : ""}\n\nJSON:\n{"verdict":"4-5 предложений","title":"исторический титул лидера","epitaph":"одна фраза для учебников истории","rating":"Провал|Слабое правление|Противоречивое наследие|Стабильность|Успех|Историческое достижение","fallNarrative":"${gs.endType!=="mandate"?"3-4 предложения о том как именно произошла потеря власти":"null"}"}`,
          "ending"
        );
        setVerdict(data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    gen();
  }, []); // eslint-disable-line

  const avgRes = Math.round(Object.values(gs.resources).reduce((a,b)=>a+b,0)/6);
  const pa = computePublicApproval(gs.factions);
  const isLoss = gs.endType !== "mandate";

  return (
    <div style={{ minHeight:"100vh", background:G.bg, display:"flex", justifyContent:"center", padding:"32px 16px" }}>
      <div style={{ maxWidth:660, width:"100%" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontFamily:mono, fontSize:11, letterSpacing:".22em", color:G.tx3, marginBottom:12 }}>{COUNTRIES[gs.country].flag} {gs.country.toUpperCase()} · {isLoss?"КОНЕЦ ПРАВЛЕНИЯ":"КОНЕЦ МАНДАТА"}</div>
          <Divider/>
        </div>

        <Card style={{ marginBottom:12, borderColor:isLoss?G.red:G.bdr2, textAlign:"center", borderLeft:isLoss?`3px solid ${G.red}`:undefined }}>
          <div style={{ fontFamily:serif, fontSize:34, fontWeight:600, color:isLoss?G.red:G.gold, marginBottom:6 }}>{gs.leader.leader.name}</div>
          {!loading && verdict && <div style={{ fontFamily:mono, fontSize:12, color:G.amb, letterSpacing:".1em", marginBottom:6 }}>{verdict.title?.toUpperCase()}</div>}
          <div style={{ fontFamily:mono, fontSize:11, color:G.tx3 }}>{COUNTRIES[gs.country].startYear}–{gs.year} · {gs.history.length} решений · ресурсы {avgRes}/100 · рейтинг {pa}%</div>
        </Card>

        {loading && <Card style={{ padding:"50px 20px", textAlign:"center" }}><div style={{ fontFamily:mono, fontSize:13, color:G.tx3, letterSpacing:".1em" }}>// ИСТОРИКИ ПИШУТ ХРОНИКИ...</div></Card>}

        {!loading && verdict && (
          <div>
            {/* Драматическое падение */}
            {isLoss && verdict.fallNarrative && verdict.fallNarrative !== "null" && (
              <Card accent={G.red} style={{ marginBottom:12 }}>
                <Label>// КАК ЭТО ПРОИЗОШЛО</Label>
                <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.8, color:G.txt }}>{verdict.fallNarrative}</div>
              </Card>
            )}

            <Card accent={G.amb} style={{ marginBottom:12 }}>
              <Label>// ВЕРДИКТ ИСТОРИИ</Label>
              <div style={{ fontFamily:serif, fontSize:16, lineHeight:1.8, color:G.txt, marginBottom:14 }}>{verdict.verdict}</div>
              <div style={{ fontFamily:serif, fontSize:15, fontStyle:"italic", color:G.tx2, padding:"12px 0", borderTop:`1px solid ${G.bdr}`, borderBottom:`1px solid ${G.bdr}` }}>«{verdict.epitaph}»</div>
              {verdict.rating && <div style={{ marginTop:12, fontFamily:mono, fontSize:12, color:G.amb, letterSpacing:".1em" }}>ОЦЕНКА: {verdict.rating?.toUpperCase()}</div>}
            </Card>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <Card>
                <Label>// РЕСУРСЫ</Label>
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
                <Label>// ФРАКЦИИ (итог)</Label>
                {gs.factions.map(f => {
                  const c=relColor(f.relation);
                  return <div key={f.id} style={{ marginBottom:7 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                      <span style={{ fontFamily:mono, fontSize:10, color:G.tx2 }}>{f.emoji}{f.name}</span>
                      <span style={{ fontFamily:mono, fontSize:10, color:c }}>{f.relation>0?"+":""}{f.relation}</span>
                    </div>
                    <div style={{ height:2, background:G.bdr, borderRadius:2 }}>
                      <div style={{ height:"100%", width:`${((f.relation+100)/200)*100}%`, background:c, borderRadius:2 }}/>
                    </div>
                  </div>;
                })}
              </Card>
            </div>

            {gs.history.length > 0 && (
              <Card style={{ marginBottom:24 }}>
                <Label>// ХРОНИКА ПРАВЛЕНИЯ</Label>
                {gs.history.map((h,i)=>(
                  <div key={i} style={{ display:"flex", gap:12, padding:"6px 0", borderBottom:i<gs.history.length-1?`1px solid ${G.bdr}`:"none" }}>
                    <span style={{ fontFamily:mono, fontSize:11, color:G.tx3, minWidth:36 }}>{h.year}</span>
                    <span style={{ fontFamily:serif, fontSize:13, color:G.tx2, fontStyle:"italic" }}>«{h.headline}»</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        <div style={{ textAlign:"center" }}><PrimaryBtn onClick={onRestart}>↺ НОВАЯ ПАРТИЯ</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("setup");
  const [gs, setGs]         = useState(null);
  return (
    <>
      <Fonts/>
      {screen==="setup"   && <Setup   onStart={d=>{setGs(d);setScreen("intro");}}/>}
      {screen==="intro"   && <Intro   gs={gs} onGo={()=>setScreen("game")}/>}
      {screen==="game"    && <Game    gs={gs} setGs={setGs} onEnd={()=>setScreen("ending")}/>}
      {screen==="ending"  && <Ending  gs={gs} onRestart={()=>setScreen("setup")}/>}
    </>
  );
}