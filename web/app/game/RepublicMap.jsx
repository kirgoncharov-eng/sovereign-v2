"use client";

import { useId, useState } from "react";
import {
  computeRegionalTrust,
  REGION_IDS,
} from "@/lib/game/republic-map.ts";

const WORD_COLOR = {
  верят: "#5cb887",
  ждут: "#d8b35d",
  против: "#cf665b",
};

export default function RepublicMap({ gs, onSelectRegion }) {
  const mapId = useId();
  const regionalData = computeRegionalTrust(gs);

  // По умолчанию выбираем либо задетый последним решением регион, либо Минск
  const defaultSelected =
    REGION_IDS.find((id) => regionalData[id]?.lastAffected) || "minsk";
  const [selectedId, setSelectedId] = useState(defaultSelected);

  const current = regionalData[selectedId] || regionalData.minsk;

  return (
    <div className="sv-republic-map-wrap" role="region" aria-label="Карта регионов Неманской республики">
      {/* Шапка ведомственного планшета */}
      <div className="sv-republic-map-header">
        <div>
          <span className="sv-republic-map-badge">ВЕДОМСТВЕННАЯ СХЕМА · ЦК 1978</span>
          <h3 className="sv-republic-map-title">Настроения и доверие четырёх мест</h3>
        </div>
        {current.lastAffected && (
          <span className="sv-republic-map-alert" role="status">
            ⚡ Задето решением последнего хода
          </span>
        )}
      </div>

      {/* Интерактивная векторная карта */}
      <div className="sv-republic-map-svg-container">
        <svg
          viewBox="0 0 540 390"
          className="sv-republic-map-svg"
          aria-label="Интерактивная карта четырёх мест республики: Минск, Гродно, Брест, Полесье"
        >
          <defs>
            {/* Топографическая сетка с крестиками */}
            <pattern id={`grid-${mapId}`} width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1d2b24" strokeWidth="0.75" />
              <path d="M 13 15 L 17 15 M 15 13 L 15 17" stroke="#2c3f35" strokeWidth="0.8" />
            </pattern>
            {/* Штриховка плавней Полесья */}
            <pattern id={`swamp-${mapId}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="14" stroke="#274034" strokeWidth="1.5" />
            </pattern>
            {/* Мягкое свечение выбранного региона */}
            <filter id={`glow-${mapId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#d8b35d" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Фоновый планшет */}
          <rect width="540" height="390" rx="4" fill="#0c1310" stroke="#283a2f" strokeWidth="1.5" />
          <rect width="540" height="390" fill={`url(#grid-${mapId})`} />

          {/* Картографический гриф в правом верхнем углу */}
          <g opacity="0.65" transform="translate(415, 18)">
            <rect x="0" y="0" width="112" height="18" fill="#121b16" stroke="#293c32" strokeWidth="0.8" />
            <text x="56" y="12" textAnchor="middle" fill="#9da89f" fontSize="8.5" fontFamily="var(--font-mono)" letterSpacing="0.5">
              СХЕМА № 4 · 1978
            </text>
          </g>

          {/* Роза ветров (компас) в левом верхнем углу */}
          <g opacity="0.6" transform="translate(26, 26)">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#2c4236" strokeWidth="0.8" />
            <line x1="0" y1="-12" x2="0" y2="12" stroke="#8c7b58" strokeWidth="1" />
            <line x1="-12" y1="0" x2="12" y2="0" stroke="#8c7b58" strokeWidth="1" />
            <polygon points="0,-13 -3,-3 0,0 3,-3" fill="#d8b35d" />
            <text x="0" y="-16" textAnchor="middle" fill="#d8b35d" fontSize="8" fontFamily="var(--font-mono)" fontWeight="700">
              N
            </text>
          </g>

          {/* Горизонтали рельефа (Минская возвышенность) */}
          <path
            d="M 280 65 Q 360 55 430 75 Q 470 120 420 160 Q 330 180 270 140 Q 250 90 280 65 Z"
            fill="none"
            stroke="#1c2c23"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            opacity="0.8"
          />

          {/* КОНТУРЫ 4 РЕГИОНОВ */}

          {/* 1. ГРОДНО (Северо-Запад) */}
          <g
            className="sv-map-region-group"
            data-active={selectedId === "grodno"}
            onClick={() => { setSelectedId("grodno"); onSelectRegion?.("grodno"); }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === "grodno"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedId("grodno"); onSelectRegion?.("grodno"); } }}
          >
            <path
              d="M 38 48 L 210 40 L 225 155 L 140 188 L 44 168 Z"
              fill={selectedId === "grodno" ? "#182c23" : "#111f18"}
              stroke={selectedId === "grodno" ? "#d8b35d" : "#2e4839"}
              strokeWidth={selectedId === "grodno" ? "2.5" : "1.2"}
              filter={selectedId === "grodno" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Символы Гродно: Таможенная арка, крепостной зубец, речной причал */}
            <g transform="translate(95, 74)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "grodno" ? 1 : 0.85}>
              {/* Монументальная таможенная арка */}
              <path d="M 0 36 L 0 12 Q 16 -3 32 12 L 32 36" />
              <path d="M 8 36 L 8 16 Q 16 9 24 16 L 24 36" strokeWidth="1" />
              <line x1="-5" y1="36" x2="37" y2="36" strokeWidth="2" />
              {/* Решетка ворот */}
              <line x1="16" y1="12" x2="16" y2="36" stroke="#9bb39e" strokeWidth="1" strokeDasharray="3 3" />
              {/* Причал и кнехт */}
              <rect x="44" y="24" width="18" height="12" fill="#1b2e23" stroke="#9bb39e" strokeWidth="1.2" />
              <circle cx="53" cy="20" r="2.5" fill="#cbb37a" stroke="#cbb37a" />
              <line x1="48" y1="22" x2="58" y2="22" stroke="#9bb39e" strokeWidth="1.5" />
            </g>
            <text x="115" y="132" textAnchor="middle" fill="#eae3cf" fontSize="13.5" fontFamily="var(--font-narrow)" fontWeight="700" letterSpacing="1">
              ГРОДНО
            </text>
            <text x="115" y="146" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              ТАМОЖНЯ · ТОРГОВЛЯ
            </text>
            {/* Статус-бейдж с числом и расшифровкой */}
            <g transform="translate(115, 163)">
              <rect x="-42" y="-10" width="84" height="18" rx="2" fill="#0c1310" stroke={WORD_COLOR[regionalData.grodno.word]} strokeWidth="1.2" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.grodno.word]} fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="700">
                {regionalData.grodno.wordInfo.label.toUpperCase()} · {regionalData.grodno.score}%
              </text>
            </g>
          </g>

          {/* 2. МИНСК (Центральный узел) */}
          <g
            className="sv-map-region-group"
            data-active={selectedId === "minsk"}
            onClick={() => { setSelectedId("minsk"); onSelectRegion?.("minsk"); }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === "minsk"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedId("minsk"); onSelectRegion?.("minsk"); } }}
          >
            <path
              d="M 215 38 L 498 44 L 508 198 L 360 218 L 230 160 Z"
              fill={selectedId === "minsk" ? "#1a2f24" : "#13211a"}
              stroke={selectedId === "minsk" ? "#d8b35d" : "#32503f"}
              strokeWidth={selectedId === "minsk" ? "2.5" : "1.2"}
              filter={selectedId === "minsk" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Символы Минска: Заводские цеха МТЗ, 3 трубы с дымом, шестерня и звезда */}
            <g transform="translate(325, 68)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "minsk" ? 1 : 0.85}>
              {/* Заводской корпус с пилообразными крышами */}
              <path d="M 0 40 L 0 20 L 16 12 L 16 20 L 32 12 L 32 20 L 48 12 L 48 40 Z" fill="#1b2e23" />
              {/* Остекление цеха */}
              <line x1="6" y1="26" x2="12" y2="34" stroke="#9bb39e" strokeWidth="1" />
              <line x1="22" y1="26" x2="28" y2="34" stroke="#9bb39e" strokeWidth="1" />
              <line x1="38" y1="26" x2="44" y2="34" stroke="#9bb39e" strokeWidth="1" />
              {/* Три заводские трубы */}
              <line x1="56" y1="40" x2="56" y2="2" strokeWidth="2.8" />
              <line x1="66" y1="40" x2="66" y2="7" strokeWidth="2.2" />
              <line x1="74" y1="40" x2="74" y2="12" strokeWidth="1.8" />
              {/* Дым над трубами */}
              <path d="M 56 0 Q 50 -10 60 -15 Q 70 -20 62 -28" stroke="#8ea396" strokeWidth="1.3" strokeDasharray="2 2" />
              <path d="M 66 5 Q 63 -3 70 -8" stroke="#8ea396" strokeWidth="1" strokeDasharray="2 2" />
              {/* Золотая звезда столицы */}
              <polygon points="24,-6 27,2 35,2 29,8 31,16 24,11 17,16 19,8 13,2 21,2" fill="#d8b35d" stroke="#d8b35d" strokeWidth="0.5" />
            </g>
            <text x="365" y="132" textAnchor="middle" fill="#eae3cf" fontSize="14.5" fontFamily="var(--font-narrow)" fontWeight="700" letterSpacing="1">
              ★ МИНСК
            </text>
            <text x="365" y="146" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              СТОЛИЦА · МАШИНОСТРОЕНИЕ
            </text>
            {/* Статус-бейдж */}
            <g transform="translate(365, 163)">
              <rect x="-42" y="-10" width="84" height="18" rx="2" fill="#0c1310" stroke={WORD_COLOR[regionalData.minsk.word]} strokeWidth="1.2" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.minsk.word]} fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="700">
                {regionalData.minsk.wordInfo.label.toUpperCase()} · {regionalData.minsk.score}%
              </text>
            </g>
          </g>

          {/* 3. БРЕСТ (Юго-Запад) */}
          <g
            className="sv-map-region-group"
            data-active={selectedId === "brest"}
            onClick={() => { setSelectedId("brest"); onSelectRegion?.("brest"); }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === "brest"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedId("brest"); onSelectRegion?.("brest"); } }}
          >
            <path
              d="M 42 172 L 145 192 L 195 248 L 180 352 L 36 335 Z"
              fill={selectedId === "brest" ? "#182c23" : "#111f18"}
              stroke={selectedId === "brest" ? "#d8b35d" : "#2e4839"}
              strokeWidth={selectedId === "brest" ? "2.5" : "1.2"}
              filter={selectedId === "brest" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Символы Бреста: Звездный бастион крепости, мазутная цистерна, рельсовые шпалы */}
            <g transform="translate(80, 218)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "brest" ? 1 : 0.85}>
              {/* Бастион цитадели */}
              <polygon points="25,4 33,18 47,18 37,28 41,43 25,34 9,43 13,28 3,18 17,18" fill="#1b2e23" stroke="#cbb37a" strokeWidth="1.5" />
              {/* Цистерна / нефтебаза */}
              <rect x="54" y="24" width="24" height="13" rx="3.5" fill="#1a2520" stroke="#9bb39e" strokeWidth="1.2" />
              <line x1="57" y1="39" x2="59" y2="42" stroke="#9bb39e" strokeWidth="2" />
              <line x1="71" y1="39" x2="73" y2="42" stroke="#9bb39e" strokeWidth="2" />
              <line x1="60" y1="28" x2="72" y2="28" stroke="#d8b35d" strokeWidth="1" />
            </g>
            <text x="105" y="286" textAnchor="middle" fill="#eae3cf" fontSize="13.5" fontFamily="var(--font-narrow)" fontWeight="700" letterSpacing="1">
              БРЕСТ
            </text>
            <text x="105" y="300" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              БАСТИОН · НЕФТЬ · Ж/Д
            </text>
            {/* Статус-бейдж */}
            <g transform="translate(105, 318)">
              <rect x="-42" y="-10" width="84" height="18" rx="2" fill="#0c1310" stroke={WORD_COLOR[regionalData.brest.word]} strokeWidth="1.2" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.brest.word]} fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="700">
                {regionalData.brest.wordInfo.label.toUpperCase()} · {regionalData.brest.score}%
              </text>
            </g>
          </g>

          {/* 4. ПОЛЕСЬЕ (Юг) */}
          <g
            className="sv-map-region-group"
            data-active={selectedId === "polesie"}
            onClick={() => { setSelectedId("polesie"); onSelectRegion?.("polesie"); }}
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === "polesie"}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedId("polesie"); onSelectRegion?.("polesie"); } }}
          >
            <path
              d="M 200 252 L 362 222 L 508 202 L 508 355 L 185 355 Z"
              fill={selectedId === "polesie" ? "#192e24" : "#112019"}
              stroke={selectedId === "polesie" ? "#d8b35d" : "#2e4839"}
              strokeWidth={selectedId === "polesie" ? "2.5" : "1.2"}
              filter={selectedId === "polesie" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Штриховка плавней */}
            <path d="M 220 286 L 485 286 L 485 348 L 220 348 Z" fill={`url(#swamp-${mapId})`} opacity="0.38" pointerEvents="none" />
            {/* Символы Полесья: Зерновые элеваторы, колос, шлюзы */}
            <g transform="translate(320, 238)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "polesie" ? 1 : 0.85}>
              {/* Силосы элеватора */}
              <rect x="0" y="8" width="14" height="32" rx="2.5" fill="#1b2e23" />
              <rect x="16" y="4" width="14" height="36" rx="2.5" fill="#1b2e23" />
              <rect x="32" y="8" width="14" height="32" rx="2.5" fill="#1b2e23" />
              <line x1="-3" y1="8" x2="49" y2="8" strokeWidth="1.5" />
              {/* Наклонная галерея нории */}
              <line x1="23" y1="4" x2="48" y2="-5" stroke="#9bb39e" strokeWidth="1.5" />
              {/* Колос ржи/пшеницы */}
              <path d="M 58 40 Q 64 20 60 4" stroke="#d8b35d" strokeWidth="1.5" />
              <line x1="56" y1="12" x2="63" y2="7" stroke="#d8b35d" strokeWidth="1.2" />
              <line x1="62" y1="18" x2="69" y2="13" stroke="#d8b35d" strokeWidth="1.2" />
              <line x1="55" y1="24" x2="62" y2="19" stroke="#d8b35d" strokeWidth="1.2" />
              <line x1="61" y1="30" x2="68" y2="25" stroke="#d8b35d" strokeWidth="1.2" />
            </g>
            <text x="355" y="296" textAnchor="middle" fill="#eae3cf" fontSize="14.5" fontFamily="var(--font-narrow)" fontWeight="700" letterSpacing="1">
              ПОЛЕСЬЕ
            </text>
            <text x="355" y="310" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              ХЛЕБ · ПЛАВНИ · СОВЕТЫ
            </text>
            {/* Статус-бейдж */}
            <g transform="translate(355, 328)">
              <rect x="-42" y="-10" width="84" height="18" rx="2" fill="#0c1310" stroke={WORD_COLOR[regionalData.polesie.word]} strokeWidth="1.2" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.polesie.word]} fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="700">
                {regionalData.polesie.wordInfo.label.toUpperCase()} · {regionalData.polesie.score}%
              </text>
            </g>
          </g>

          {/* ГИДРОГРАФИЯ (Реки Неман и Припять) */}
          {/* Река Неман (из центра на северо-запад через Гродно) */}
          <path
            d="M 280 120 Q 210 135 155 125 T 90 90 T 35 70"
            fill="none"
            stroke="#2f544c"
            strokeWidth="3.8"
            strokeLinecap="round"
            opacity="0.85"
          />
          <text x="65" y="63" fill="#4f7c72" fontSize="9" fontFamily="var(--font-mono)" fontStyle="italic">
            р. Неман
          </text>

          {/* Река Припять (вдоль Полесья) */}
          <path
            d="M 120 282 Q 220 270 310 286 T 495 276"
            fill="none"
            stroke="#2f544c"
            strokeWidth="3.8"
            strokeLinecap="round"
            opacity="0.85"
          />
          <text x="445" y="268" fill="#4f7c72" fontSize="9" fontFamily="var(--font-mono)" fontStyle="italic">
            р. Припять
          </text>

          {/* ЖЕЛЕЗНОДОРОЖНАЯ МАГИСТРАЛЬ (Брест — Барановичи — Минск) */}
          <path
            d="M 105 235 L 210 185 L 330 115"
            fill="none"
            stroke="#8a7952"
            strokeWidth="2.2"
            strokeDasharray="6 4"
            opacity="0.8"
          />
          {/* Узловая станция Барановичи */}
          <circle cx="210" cy="185" r="3.5" fill="#d8b35d" stroke="#1b241c" strokeWidth="1" />
          <text x="210" y="200" textAnchor="middle" fill="#8a7952" fontSize="8" fontFamily="var(--font-mono)">
            узл. Барановичи
          </text>
        </svg>
      </div>

      {/* Быстрые вкладки выбора региона с процентами и ясными статусами */}
      <div className="sv-republic-map-tabs" role="tablist" aria-label="Выбор региона республики">
        {REGION_IDS.map((id) => {
          const r = regionalData[id];
          const isSelected = selectedId === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isSelected}
              className="sv-republic-map-tab-btn"
              data-active={isSelected}
              onClick={() => { setSelectedId(id); onSelectRegion?.(id); }}
            >
              <span className="sv-republic-tab-name">{r.name}</span>
              <span
                className="sv-republic-tab-status"
                style={{ color: WORD_COLOR[r.word] }}
              >
                {r.wordInfo.label} · {r.score}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Подробное досье выбранного региона с логичным объяснением настроений */}
      <article className="sv-republic-dossier" aria-live="polite">
        <div className="sv-republic-dossier-header">
          <div>
            <span className="sv-republic-dossier-sub">{current.tagline}</span>
            <h4 className="sv-republic-dossier-title">{current.name}</h4>
          </div>
          <div className="sv-republic-dossier-status-pill" style={{ borderColor: WORD_COLOR[current.word] }}>
            <span style={{ color: WORD_COLOR[current.word] }}>
              {current.wordInfo.label.toUpperCase()}
            </span>
            <strong style={{ color: "#eae3cf" }}>{current.score}%</strong>
            <small style={{ color: "#9da89f", fontSize: "10px" }}>{current.wordInfo.sub}</small>
          </div>
        </div>

        {/* Разъяснение настроений региона */}
        <div className="sv-republic-mood-box" style={{ borderLeftColor: WORD_COLOR[current.word] }}>
          <strong>Настроения людей: {current.wordInfo.label} ({current.wordInfo.sub})</strong>
          <p>{current.wordInfo.explanation}</p>
        </div>

        <p className="sv-republic-dossier-summary">{current.summary}</p>

        {/* Характерные символы региона */}
        <div className="sv-republic-symbols-row">
          <small className="sv-republic-symbols-label">Ориентиры места:</small>
          <div className="sv-republic-symbols-tags">
            {current.keySymbols.map((sym, idx) => (
              <span key={idx} className="sv-republic-symbol-tag">
                {sym}
              </span>
            ))}
          </div>
        </div>

        {/* Отношения лагерей этого места */}
        {current.factions.length > 0 && (
          <div className="sv-republic-factions-box">
            <small className="sv-republic-factions-label">Лагеря и группы влияния:</small>
            <div className="sv-republic-factions-list">
              {current.factions.map((f) => (
                <div key={f.id} className="sv-republic-faction-item">
                  <span>{f.name}</span>
                  <strong style={{ color: f.relation > 0 ? "#5cb887" : f.relation < 0 ? "#cf665b" : "#9ba89f" }}>
                    {f.relation > 0 ? `+${f.relation}` : f.relation}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
