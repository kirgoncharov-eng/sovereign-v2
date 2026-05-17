"use client";

import { useState, useEffect } from "react";

const COUNTRIES = {
  "Беларусь": { flag: "🇧🇾", context: "Постлукашенковская Беларусь. Санкции Запада, жёсткая зависимость от России, силовики привыкли к авторитаризму, оппозиция в эмиграции и подполье, общество разорвано.", startYear: 2025 },
  "Украина":  { flag: "🇺🇦", context: "Украина в условиях войны или послевоенной реконструкции. Кандидат на членство в ЕС. Западные союзники устают, олигархи ослаблены, общество истощено и требует победы.", startYear: 2025 },
  "Грузия":   { flag: "🇬🇪", context: "Малое государство. Абхазия и Южная Осетия оккупированы Россией. Один олигарх контролирует правящую партию. Заявка на ЕС под угрозой. Улица против власти.", startYear: 2025 }
};

const DIFFICULTIES = {
  debut:     { label: "ДЕБЮТ",    emoji: "🟢", desc: "Убедительная победа на выборах. Мандат есть. Есть время строить." },
  coalition: { label: "КОАЛИЦИЯ", emoji: "🟡", desc: "Хрупкое правительство, экономический спад, внешнее давление нарастает." },
  crisis:    { label: "КРИЗИС",   emoji: "🔴", desc: "Протесты в столице. Олигарх дестабилизирует. Рейтинг рушится." },
  ruins:     { label: "ОБЛОМКИ",  emoji: "⬛", desc: "Война / коллапс / переворот. Выживание — уже победа." }
};

const IDEOLOGIES = [
  { id: "liberal",     emoji: "◈", label: "Либерал",    desc: "Реформы · ЕС · Права человека · Прозрачность" },
  { id: "nationalist", emoji: "◆", label: "Националист", desc: "Суверенитет · Традиции · Сильное государство" },
  { id: "pragmatist",  emoji: "◇", label: "Прагматик",   desc: "Никаких принципов кроме результата и баланса" },
  { id: "leftist",     emoji: "●", label: "Левый",       desc: "Справедливость · Антиолигархия · Перераспределение" }
];

const RES_CONFIG = [
  { key: "politicalCapital",   label: "ПОЛИТКАПИТАЛ" },
  { key: "economy",            label: "ЭКОНОМИКА"    },
  { key: "military",           label: "СИЛОВИКИ"     },
  { key: "externalReputation", label: "РЕПУТАЦИЯ"    },
  { key: "internalLegitimacy", label: "ЛЕГИТИМНОСТЬ" },
  { key: "personalResource",   label: "ЛИЧНЫЙ РЕС."  }
];

const START_RES = {
  debut:     { politicalCapital: 72, economy: 65, military: 62, externalReputation: 58, internalLegitimacy: 70, personalResource: 82 },
  coalition: { politicalCapital: 50, economy: 44, military: 56, externalReputation: 50, internalLegitimacy: 46, personalResource: 65 },
  crisis:    { politicalCapital: 33, economy: 36, military: 50, externalReputation: 38, internalLegitimacy: 28, personalResource: 55 },
  ruins:     { politicalCapital: 18, economy: 20, military: 32, externalReputation: 22, internalLegitimacy: 15, personalResource: 40 }
};

const SYS = `Ты — движок нарративной политической симуляции. Отвечай ТОЛЬКО валидным JSON без markdown-разметки и без преамбул. Все тексты на русском языке.`;

async function ai(prompt, task = 'event') {
  const r = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, task })
  });
  const { text } = await r.json();
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return {}; }
}

// При вызовах передавай task:
// fetchEvent → ai(prompt, 'event')
// handleChoice → ai(prompt, 'consequence')
// Ending → ai(prompt, 'ending')

const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const applyDeltas = (res, d) => {
  const n = { ...res };
  Object.entries(d || {}).forEach(([k, v]) => { if (n[k] !== undefined) n[k] = clamp(n[k] + (v || 0)); });
  return n;
};
const barColor = v => v >= 60 ? "#5cb87a" : v >= 35 ? "#c9a04a" : "#b85252";

const G = {
  bg: "#07090e", bg2: "#0c1120", bg3: "#111b2e",
  bdr: "#1a2438", bdr2: "#243452",
  gold: "#c8a86c", gld2: "#e0c488",
  blue: "#4a7aaa", bl2: "#6a9aca",
  txt: "#ccc8be", tx2: "#8a8778", tx3: "#50504e",
  grn: "#5cb87a", amb: "#c9a04a", red: "#b85252",
};
const mono  = "'Share Tech Mono','Courier New',monospace";
const serif = "'Cormorant Garamond','Georgia',serif";

// hover helpers — no useState needed
const hov = (active, activeColor) => ({
  onMouseOver: e => { if (!active) { e.currentTarget.style.background = G.bg3; e.currentTarget.style.borderColor = activeColor || G.gold; } },
  onMouseOut:  e => { if (!active) { e.currentTarget.style.background = G.bg2; e.currentTarget.style.borderColor = G.bdr; } }
});
const hovChoice = () => ({
  onMouseOver: e => { e.currentTarget.style.background = G.bg3; e.currentTarget.style.borderColor = G.gold; e.currentTarget.style.color = G.gld2; },
  onMouseOut:  e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = G.bdr; e.currentTarget.style.color = G.txt; }
});
const hovPrimary = (danger) => ({
  onMouseOver: e => { e.currentTarget.style.background = G.bg3; },
  onMouseOut:  e => { e.currentTarget.style.background = "transparent"; }
});

function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Share+Tech+Mono&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:${G.bg};font-family:${serif};color:${G.txt}}
      button{cursor:pointer;transition:all .15s;font-family:${mono}}
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-track{background:${G.bg2}}
      ::-webkit-scrollbar-thumb{background:${G.bdr2}}
    `}</style>
  );
}

function Divider() {
  return <div style={{ height: 1, background: `linear-gradient(to right,transparent,${G.bdr2},transparent)`, margin: "0 0 28px" }} />;
}

function Label({ children }) {
  return <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.18em", color: G.tx3, marginBottom: 14 }}>{children}</div>;
}

function Card({ children, style, accent }) {
  return (
    <div style={{ background: G.bg2, border: `1px solid ${G.bdr}`, borderRadius: 6, padding: "22px 24px", ...(accent ? { borderLeft: `3px solid ${accent}` } : {}), ...style }}>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} {...hovPrimary(danger)}
      style={{ background: "transparent", border: `1px solid ${danger ? G.red : G.gold}`, color: disabled ? G.tx3 : danger ? G.red : G.gold, padding: "14px 48px", borderRadius: 4, fontSize: 15, letterSpacing: "0.2em", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function ResBar({ label, val, prev }) {
  const c = barColor(val);
  const delta = prev !== undefined ? val - prev : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 13, color: G.tx2 }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 13, color: c, fontWeight: "bold" }}>
          {val}{delta !== 0 && <span style={{ color: delta > 0 ? G.grn : G.red, fontSize: 11, marginLeft: 3 }}>{delta > 0 ? `+${delta}` : delta}</span>}
        </span>
      </div>
      <div style={{ height: 3, background: G.bdr, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${val}%`, background: c, borderRadius: 2, transition: "all .7s ease" }} />
      </div>
    </div>
  );
}

// ── SETUP ──────────────────────────────────────────────────────────────────────

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
      const data = await ai(
        `Страна: ${country}\nКонтекст: ${COUNTRIES[state.country]?.context || ""}\nСложность: ${DIFFICULTIES[diff].label} — ${DIFFICULTIES[diff].desc}\nИдеология: ${ci.label}\n\nСгенерируй стартовые данные. Имена соответствуют культуре страны. Лидер — мужчина.\n\nJSON:\n{\n  "leader":{"name":"...","party":"...","bio":"2 предложения"},\n  "speech":"4-5 предложений вступительной речи",\n  "situation":"4 напряжённых предложения о ситуации",\n  "players":[{"name":"...","role":"...","mood":"союзник|нейтрал|враг"}]\n}`
      );
      onStart({ country, diff, ideo, leader: data, resources: { ...START_RES[diff] }, prevResources: null, year: COUNTRIES[country].startYear, turn: 0, history: [], ended: false });
    } catch (e) { setErr("Ошибка API. Попробуйте снова."); console.error(e); }
    setLoading(false);
  };

  const btnStyle = (active) => ({
    display: "block", width: "100%", textAlign: "left", padding: "13px 16px", marginBottom: 8, borderRadius: 4,
    background: active ? G.bg3 : G.bg2, border: `1px solid ${active ? G.gold : G.bdr}`, color: active ? G.gld2 : G.txt
  });

  return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", justifyContent: "center", padding: "44px 16px" }}>
      <div style={{ maxWidth: 620, width: "100%" }}>

        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.26em", color: G.tx3, marginBottom: 18 }}>// СУВЕРЕН · ПОЛИТИЧЕСКАЯ СИМУЛЯЦИЯ //</div>
          <h1 style={{ fontFamily: serif, fontSize: 48, fontWeight: 600, color: G.gold }}>Конфигурация</h1>
          <div style={{ fontFamily: serif, fontSize: 19, color: G.tx2, fontStyle: "italic", marginTop: 12, marginBottom: 24 }}>Ваши решения определят судьбу страны</div>
          <Divider />
        </div>

        <div style={{ marginBottom: 26 }}>
          <Label>СТРАНА</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: country ? 12 : 0 }}>
            {Object.entries(COUNTRIES).map(([name]) => {
              const active = country === name;
              return (
                <button key={name} onClick={() => setCountry(name)} {...hov(active)}
                  style={{ padding: "18px 8px", borderRadius: 4, textAlign: "center", background: active ? G.bg3 : G.bg2, border: `1px solid ${active ? G.gold : G.bdr}`, color: active ? G.gld2 : G.txt }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{COUNTRIES[name].flag}</div>
                  <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.1em" }}>{name.toUpperCase()}</div>
                </button>
              );
            })}
          </div>
          {country && <div style={{ padding: "13px 16px", background: G.bg2, border: `1px solid ${G.bdr}`, borderRadius: 4, fontSize: 16, color: G.tx2, fontStyle: "italic", lineHeight: 1.65 }}>{COUNTRIES[country].context}</div>}
        </div>

        <div style={{ marginBottom: 26 }}>
          <Label>СТАРТОВЫЙ МОМЕНТ / СЛОЖНОСТЬ</Label>
          {Object.entries(DIFFICULTIES).map(([id, d]) => {
            const active = diff === id;
            return (
              <button key={id} onClick={() => setDiff(id)} {...hov(active)}
                style={btnStyle(active)}>
                <span style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.08em" }}>{d.emoji} {d.label}</span>
                <span style={{ fontFamily: serif, fontSize: 17, color: active ? G.gld2 : G.tx2, marginLeft: 12, fontStyle: "italic" }}>{d.desc}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 36 }}>
          <Label>ИДЕОЛОГИЯ</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {IDEOLOGIES.map(i => {
              const active = ideo === i.id;
              return (
                <button key={i.id} onClick={() => setIdeo(i.id)} {...hov(active)}
                  style={{ textAlign: "left", padding: "14px 16px", borderRadius: 4, background: active ? G.bg3 : G.bg2, border: `1px solid ${active ? G.gold : G.bdr}`, color: active ? G.gld2 : G.txt }}>
                  <div style={{ fontFamily: mono, fontSize: 14, marginBottom: 6 }}>{i.emoji} {i.label.toUpperCase()}</div>
                  <div style={{ fontFamily: serif, fontSize: 15, color: G.tx2, fontStyle: "italic" }}>{i.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {err && <div style={{ fontFamily: mono, color: G.red, fontSize: 14, textAlign: "center", marginBottom: 14 }}>{err}</div>}
        <div style={{ textAlign: "center" }}>
          <PrimaryBtn onClick={go} disabled={!ready || loading}>{loading ? "СОЗДАНИЕ МИРА..." : "▶  НАЧАТЬ"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ── INTRO ──────────────────────────────────────────────────────────────────────

function Intro({ gs, onGo }) {
  const { country, ideo, leader } = gs;
  const ci = IDEOLOGIES.find(i => i.id === ideo);
  const moodColor = m => m === "союзник" ? G.grn : m === "враг" ? G.red : G.tx3;

  return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ maxWidth: 660, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.22em", color: G.tx3, marginBottom: 16 }}>{COUNTRIES[country].flag} {country.toUpperCase()} · НОВОЕ РУКОВОДСТВО</div>
          <Divider />
        </div>

        <Card style={{ marginBottom: 16, borderColor: G.bdr2 }}>
          <div style={{ fontFamily: serif, fontSize: 38, fontWeight: 600, color: G.gold, marginBottom: 6 }}>{leader.leader?.name}</div>
          <div style={{ fontFamily: mono, fontSize: 13, color: G.bl2, letterSpacing: "0.1em", marginBottom: 14 }}>{leader.leader?.party} · {ci.emoji} {ci.label.toUpperCase()}</div>
          <div style={{ fontFamily: serif, fontSize: 17, color: G.tx2, fontStyle: "italic", lineHeight: 1.7 }}>{leader.leader?.bio}</div>
        </Card>

        <Card accent={G.blue} style={{ marginBottom: 16 }}>
          <Label>// ОБРАЩЕНИЕ К НАЦИИ</Label>
          <div style={{ fontFamily: serif, fontSize: 18, fontStyle: "italic", lineHeight: 1.8, color: G.txt }}>«{leader.speech}»</div>
        </Card>

        <Card accent={G.red} style={{ marginBottom: 16 }}>
          <Label>// ОПЕРАТИВНАЯ ОБСТАНОВКА</Label>
          <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.75, color: G.txt }}>{leader.situation}</div>
        </Card>

        {(leader.players || []).length > 0 && (
          <Card style={{ marginBottom: 28 }}>
            <Label>// КЛЮЧЕВЫЕ ИГРОКИ</Label>
            {leader.players.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < leader.players.length - 1 ? `1px solid ${G.bdr}` : "none" }}>
                <div>
                  <span style={{ fontFamily: serif, fontSize: 18, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: G.tx3, marginLeft: 12 }}>{p.role}</span>
                </div>
                <span style={{ fontFamily: mono, fontSize: 12, color: moodColor(p.mood), letterSpacing: "0.1em" }}>{p.mood?.toUpperCase()}</span>
              </div>
            ))}
          </Card>
        )}

        <div style={{ textAlign: "center" }}><PrimaryBtn onClick={onGo}>ПРИСТУПИТЬ К УПРАВЛЕНИЮ →</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── GAME ───────────────────────────────────────────────────────────────────────

function Game({ gs, setGs, onEnd }) {
  const [event, setEvent]           = useState(null);
  const [consequence, setConsequence] = useState(null);
  const [phase, setPhase]           = useState("loading");
  const [loading, setLoading]       = useState(false);

  const fetchEvent = async (state) => {
    setLoading(true); setPhase("loading"); setConsequence(null);
    try {
      const ci = IDEOLOGIES.find(i => i.id === state.ideo);
      const last = state.history.slice(-3).map(h => `[${h.year}] ${h.title}: выбор — «${h.choice}». Итог: ${h.headline}`).join("\n");
      const data = await ai(
        `ПОЛИТИЧЕСКАЯ СИМУЛЯЦИЯ\n\nСтрана: ${state.country || "BY"}\nКонтекст: ${COUNTRIES[state.country].context}\nЛидер: ${state.leader.leader.name} (${ci.label}), ${state.leader.leader.party}\nГод ${state.year}, ход ${state.turn + 1} из 20\n\nРесурсы (0–100):\nПолиткапитал: ${state.resources.politicalCapital}, Экономика: ${state.resources.economy}, Силовики: ${state.resources.military}, Репутация: ${state.resources.externalReputation}, Легитимность: ${state.resources.internalLegitimacy}, Личный ресурс: ${state.resources.personalResource}\n\n${last ? `Предыдущие решения:\n${last}` : `Стартовая ситуация: ${state.leader.situation}`}\n\nСгенерируй политическое событие которое лидер должен немедленно разрешить. Если ресурсы ниже 25 — порождай соответствующий кризис. Реалистично для ${state.country}. 3-4 варианта.\n\nJSON:\n{\n  "title":"...",\n  "source":"МИД / Разведка / Кабинет / Улица / Кремль / Брюссель / Пресса / Олигарх / Армия / Оппозиция",\n  "description":"4-5 предложений",\n  "choices":[{"id":"a","text":"...","hint":"..."},{"id":"b","text":"...","hint":"..."},{"id":"c","text":"...","hint":"..."}]\n}`
      );
      setEvent(data); setPhase("event");
    } catch (e) { console.error(e); setPhase("event"); }
    setLoading(false);
  };

  useEffect(() => { fetchEvent(gs); }, []);

  const handleChoice = async (choice) => {
    setLoading(true);
    try {
      const ci = IDEOLOGIES.find(i => i.id === gs.ideo);
      const data = await ai(
        `СИМУЛЯЦИЯ — ПОСЛЕДСТВИЯ\n\nСтрана: ${gs.country}\nЛидер: ${gs.leader.leader.name} (${ci.label})\nГод ${gs.year}\n\nРесурсы: Политкапитал ${gs.resources.politicalCapital}, Экономика ${gs.resources.economy}, Силовики ${gs.resources.military}, Репутация ${gs.resources.externalReputation}, Легитимность ${gs.resources.internalLegitimacy}, Личный ресурс ${gs.resources.personalResource}\n\nСобытие: "${event.title}"\n${event.description}\n\nВыбор: "${choice.text}"\n\nОпиши последствия. Реалистично, иногда неожиданно. Учитывай идеологию. Изменения ресурсов от –25 до +15.\n\nJSON:\n{\n  "headline":"газетный заголовок",\n  "narrative":"4-5 предложений",\n  "resourceChanges":{"politicalCapital":0,"economy":0,"military":0,"externalReputation":0,"internalLegitimacy":0,"personalResource":0},\n  "reactions":["реакция 1","реакция 2"],\n  "historianNote":"одна фраза"\n}`
      );
      const prevRes = { ...gs.resources };
      const newRes  = applyDeltas(gs.resources, data.resourceChanges);
      const newTurn = gs.turn + 1;
      const newYear = gs.year + (newTurn % 4 === 0 ? 1 : 0);
      const newHistory = [...gs.history, { year: gs.year, title: event.title, choice: choice.text, headline: data.headline, historianNote: data.historianNote }];
      const isOver = Object.values(newRes).some(v => v <= 4) || newTurn >= 20;
      setGs({ ...gs, resources: newRes, prevResources: prevRes, turn: newTurn, year: newYear, history: newHistory, ended: isOver });
      setConsequence(data); setPhase("consequence");
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const { resources, prevResources, leader, country, year, turn, history, ideo } = gs;
  const ci = IDEOLOGIES.find(i => i.id === ideo);

  return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", justifyContent: "center", padding: "20px 14px" }}>
      <div style={{ maxWidth: 1060, width: "100%", display: "grid", gridTemplateColumns: "250px 1fr", gap: 16 }}>

        {/* SIDEBAR */}
        <div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.13em", color: G.bl2, marginBottom: 9 }}>{COUNTRIES[country].flag} {country.toUpperCase()}</div>
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600, color: G.gold, lineHeight: 1.2, marginBottom: 6 }}>{leader.leader?.name}</div>
            <div style={{ fontFamily: mono, fontSize: 13, color: G.tx3, marginBottom: 12 }}>{ci.emoji} {ci.label.toUpperCase()}</div>
            <div style={{ fontFamily: mono, fontSize: 13, color: G.tx3 }}>◷ {year} · ход {turn}/20</div>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <Label>// РЕСУРСЫ</Label>
            {RES_CONFIG.map(r => <ResBar key={r.key} label={r.label} val={resources[r.key]} prev={prevResources ? prevResources[r.key] : undefined} />)}
          </Card>

          {history.length > 0 && (
            <Card>
              <Label>// ХРОНИКА</Label>
              {[...history].reverse().slice(0, 5).map((h, i) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < Math.min(history.length, 5) - 1 ? `1px solid ${G.bdr}` : "none" }}>
                  <div style={{ fontFamily: mono, fontSize: 12, color: G.tx3 }}>{h.year}</div>
                  <div style={{ fontFamily: serif, fontSize: 15, color: G.tx2, fontStyle: "italic", lineHeight: 1.4 }}>«{h.headline}»</div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* MAIN */}
        <div>
          {loading && (
            <Card style={{ textAlign: "center", padding: "90px 20px" }}>
              <div style={{ fontFamily: mono, fontSize: 15, color: G.tx3, letterSpacing: "0.1em" }}>
                {phase === "loading" ? "// СИТУАЦИОННЫЙ ЦЕНТР АНАЛИЗИРУЕТ ДАННЫЕ..." : "// ОБРАБОТКА ПОСЛЕДСТВИЙ..."}
              </div>
            </Card>
          )}

          {!loading && phase === "event" && event && (
            <div>
              <Card style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: mono, fontSize: 13, color: G.bl2, letterSpacing: "0.12em", marginBottom: 16 }}>📡 {event.source?.toUpperCase()}</div>
                <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 600, color: G.txt, lineHeight: 1.25, marginBottom: 18 }}>{event.title}</div>
                <div style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.8, color: G.tx2 }}>{event.description}</div>
              </Card>
              <Card>
                <Label>// РЕШЕНИЕ</Label>
                {(event.choices || []).map(c => (
                  <button key={c.id} onClick={() => handleChoice(c)} {...hovChoice()}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "16px 18px", marginBottom: 10, borderRadius: 4, background: "rgba(255,255,255,0.02)", border: `1px solid ${G.bdr}`, color: G.txt }}>
                    <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 500, marginBottom: 5 }}>{c.text}</div>
                    <div style={{ fontFamily: mono, fontSize: 13, color: G.tx3 }}>{c.hint}</div>
                  </button>
                ))}
              </Card>
            </div>
          )}

          {!loading && phase === "consequence" && consequence && (
            <div>
              <Card accent={G.amb} style={{ marginBottom: 14 }}>
                <Label>// ПОСЛЕДСТВИЯ</Label>
                <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 600, color: G.gld2, marginBottom: 18, lineHeight: 1.25 }}>«{consequence.headline}»</div>
                <div style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.8, color: G.txt, marginBottom: 18 }}>{consequence.narrative}</div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                  {Object.entries(consequence.resourceChanges || {}).filter(([, v]) => v !== 0).map(([k, v]) => {
                    const cfg = RES_CONFIG.find(r => r.key === k);
                    return cfg ? (
                      <span key={k} style={{ fontFamily: mono, fontSize: 13, padding: "4px 10px", borderRadius: 3, letterSpacing: "0.06em", background: v > 0 ? "rgba(92,184,122,0.1)" : "rgba(184,82,82,0.1)", color: v > 0 ? G.grn : G.red, border: `1px solid ${v > 0 ? "rgba(92,184,122,0.25)" : "rgba(184,82,82,0.25)"}` }}>
                        {cfg.label} {v > 0 ? `+${v}` : v}
                      </span>
                    ) : null;
                  })}
                </div>

                {(consequence.reactions || []).map((r, i) => (
                  <div key={i} style={{ fontFamily: serif, fontSize: 17, color: G.tx2, fontStyle: "italic", padding: "8px 0", borderTop: `1px solid ${G.bdr}` }}>▸ {r}</div>
                ))}

                {consequence.historianNote && (
                  <div style={{ marginTop: 16, padding: "12px 16px", background: G.bg3, borderRadius: 4, fontFamily: mono, fontSize: 13, color: G.tx3 }}>📜 {consequence.historianNote}</div>
                )}
              </Card>

              <div style={{ textAlign: "right" }}>
                {gs.ended
                  ? <PrimaryBtn onClick={onEnd} danger>ПОДВЕСТИ ИТОГИ →</PrimaryBtn>
                  : <PrimaryBtn onClick={() => fetchEvent(gs)}>СЛЕДУЮЩИЙ ХОД →</PrimaryBtn>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ENDING ─────────────────────────────────────────────────────────────────────

function Ending({ gs, onRestart }) {
  const [verdict, setVerdict] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gen = async () => {
      try {
        const ci = IDEOLOGIES.find(i => i.id === gs.ideo);
        const hist = gs.history.map(h => `${h.year}: ${h.title} → «${h.choice}» → «${h.headline}»`).join("\n");
        const collapsed = Object.values(gs.resources).some(v => v <= 4);
        const data = await ai(
          `ЗАВЕРШЕНИЕ СИМУЛЯЦИИ\n\nСтрана: ${gs.country}\nЛидер: ${gs.leader.leader.name} (${ci.label})\nПериод: ${COUNTRIES[gs.country].startYear}–${gs.year}\nПричина: ${collapsed ? "Коллапс ресурсов" : "Истечение мандата (20 ходов)"}\nРесурсы: ${JSON.stringify(gs.resources)}\n\nХроника:\n${hist}\n\nНапиши историческую оценку правления.\n\nJSON:\n{\n  "verdict":"3-4 предложения",\n  "title":"исторический титул",\n  "epitaph":"одна фраза для учебников",\n  "rating":"Провал / Слабое правление / Противоречивое наследие / Стабильность / Успех / Историческое достижение"\n}`
        );
        setVerdict(data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    gen();
  }, []);

  const avgRes = Math.round(Object.values(gs.resources).reduce((a, b) => a + b, 0) / 6);

  return (
    <div style={{ minHeight: "100vh", background: G.bg, display: "flex", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ maxWidth: 660, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.22em", color: G.tx3, marginBottom: 16 }}>{COUNTRIES[gs.country].flag} {gs.country.toUpperCase()} · КОНЕЦ ЭПОХИ</div>
          <Divider />
        </div>

        <Card style={{ marginBottom: 16, borderColor: G.bdr2, textAlign: "center" }}>
          <div style={{ fontFamily: serif, fontSize: 40, fontWeight: 600, color: G.gold, marginBottom: 8 }}>{gs.leader.leader.name}</div>
          {!loading && verdict && <div style={{ fontFamily: mono, fontSize: 14, color: G.amb, letterSpacing: "0.1em", marginBottom: 8 }}>{verdict.title?.toUpperCase()}</div>}
          <div style={{ fontFamily: mono, fontSize: 13, color: G.tx3 }}>{COUNTRIES[gs.country].startYear}–{gs.year} · {gs.history.length} решений · средний уровень {avgRes}/100</div>
        </Card>

        {loading && <Card style={{ padding: "60px 20px", textAlign: "center" }}><div style={{ fontFamily: mono, fontSize: 15, color: G.tx3, letterSpacing: "0.1em" }}>// ИСТОРИКИ ПИШУТ ХРОНИКИ...</div></Card>}

        {!loading && verdict && (
          <div>
            <Card accent={G.amb} style={{ marginBottom: 16 }}>
              <Label>// ВЕРДИКТ ИСТОРИИ</Label>
              <div style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.8, color: G.txt, marginBottom: 18 }}>{verdict.verdict}</div>
              <div style={{ fontFamily: serif, fontSize: 17, fontStyle: "italic", color: G.tx2, padding: "14px 0", borderTop: `1px solid ${G.bdr}`, borderBottom: `1px solid ${G.bdr}` }}>«{verdict.epitaph}»</div>
              {verdict.rating && <div style={{ marginTop: 14, fontFamily: mono, fontSize: 14, color: G.amb, letterSpacing: "0.1em" }}>ОЦЕНКА: {verdict.rating?.toUpperCase()}</div>}
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <Label>// ФИНАЛЬНЫЕ ПОКАЗАТЕЛИ</Label>
              {RES_CONFIG.map(r => {
                const v = gs.resources[r.key]; const c = barColor(v);
                return (
                  <div key={r.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: mono, fontSize: 13, color: G.tx2 }}>{r.label}</span>
                      <span style={{ fontFamily: mono, fontSize: 13, color: c }}>{v}</span>
                    </div>
                    <div style={{ height: 3, background: G.bdr, borderRadius: 2 }}><div style={{ height: "100%", width: `${v}%`, background: c, borderRadius: 2 }} /></div>
                  </div>
                );
              })}
            </Card>

            {gs.history.length > 0 && (
              <Card style={{ marginBottom: 28 }}>
                <Label>// ХРОНИКА ПРАВЛЕНИЯ</Label>
                {gs.history.map((h, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, padding: "8px 0", borderBottom: i < gs.history.length - 1 ? `1px solid ${G.bdr}` : "none" }}>
                    <span style={{ fontFamily: mono, fontSize: 13, color: G.tx3, minWidth: 38 }}>{h.year}</span>
                    <span style={{ fontFamily: serif, fontSize: 16, color: G.tx2, fontStyle: "italic" }}>{h.headline}</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        <div style={{ textAlign: "center" }}><PrimaryBtn onClick={onRestart}>↺ НОВАЯ ПАРТИЯ</PrimaryBtn></div>
      </div>
    </div>
  );
}

// ── APP ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("setup");
  const [gs, setGs]         = useState(null);
  return (
    <>
      <Fonts />
      {screen === "setup"   && <Setup   onStart={d => { setGs(d); setScreen("intro"); }} />}
      {screen === "intro"   && <Intro   gs={gs} onGo={() => setScreen("game")} />}
      {screen === "game"    && <Game    gs={gs} setGs={setGs} onEnd={() => setScreen("ending")} />}
      {screen === "ending"  && <Ending  gs={gs} onRestart={() => setScreen("setup")} />}
    </>
  );
}
