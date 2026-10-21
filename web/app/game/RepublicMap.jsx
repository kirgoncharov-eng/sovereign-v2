"use client";

import { useId, useState } from "react";
import {
  computeRegionalTrust,
  REGION_IDS,
} from "@/lib/game/republic-map.ts";

const WORD_LABEL = {
  верят: "Верят",
  ждут: "Ждут",
  против: "Против",
};

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
      <div className="sv-republic-map-header">
        <div>
          <span className="sv-republic-map-badge">СХЕМА РЕСПУБЛИКИ · 1978</span>
          <h3 className="sv-republic-map-title">Доверие и настроения четырёх мест</h3>
        </div>
        {current.lastAffected && (
          <span className="sv-republic-map-alert" role="status">
            ● Задето решением последнего хода
          </span>
        )}
      </div>

      <div className="sv-republic-map-svg-container">
        <svg
          viewBox="0 0 540 380"
          className="sv-republic-map-svg"
          aria-label="Интерактивная карта четырёх мест республики"
        >
          <defs>
            {/* Сетка топографического планшета */}
            <pattern id={`grid-${mapId}`} width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1d2b24" strokeWidth="0.75" />
            </pattern>
            {/* Штриховка болот Полесья */}
            <pattern id={`swamp-${mapId}`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="12" stroke="#253a30" strokeWidth="1.2" />
            </pattern>
            {/* Фильтр свечения активного региона */}
            <filter id={`glow-${mapId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#d8b35d" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Фоновый планшет */}
          <rect width="540" height="380" rx="4" fill="#0d1411" stroke="#2a3a30" strokeWidth="1.5" />
          <rect width="540" height="380" fill={`url(#grid-${mapId})`} />

          {/* КОНТУРЫ РЕГИОНОВ */}

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
              d="M 35 45 L 210 38 L 225 155 L 140 185 L 42 165 Z"
              fill={selectedId === "grodno" ? "#162820" : "#111f18"}
              stroke={selectedId === "grodno" ? "#d8b35d" : "#2e4839"}
              strokeWidth={selectedId === "grodno" ? "2.5" : "1.2"}
              filter={selectedId === "grodno" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Символ Гродно: Таможенная арка и причал */}
            <g transform="translate(100, 75)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "grodno" ? 1 : 0.85}>
              {/* Арка */}
              <path d="M 0 35 L 0 10 Q 15 -2 30 10 L 30 35" />
              <path d="M 8 35 L 8 14 Q 15 8 22 14 L 22 35" strokeWidth="1" />
              <line x1="-5" y1="35" x2="35" y2="35" strokeWidth="2" />
              {/* Речной причал / кнехт */}
              <rect x="42" y="24" width="16" height="11" fill="#1b2e23" stroke="#9bb39e" strokeWidth="1" />
              <line x1="45" y1="20" x2="55" y2="20" stroke="#9bb39e" strokeWidth="1.5" />
              <circle cx="50" cy="18" r="2" fill="#cbb37a" />
            </g>
            <text x="115" y="132" textAnchor="middle" fill="#eae3cf" fontSize="13" fontFamily="var(--font-narrow)" fontWeight="600" letterSpacing="1">
              ГРОДНО
            </text>
            <text x="115" y="146" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              ТАМОЖНЯ · ПОРТ
            </text>
            {/* Бейдж статуса */}
            <g transform="translate(115, 160)">
              <rect x="-32" y="-9" width="64" height="16" rx="2" fill="#0d1411" stroke={WORD_COLOR[regionalData.grodno.word]} strokeWidth="1" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.grodno.word]} fontSize="9" fontFamily="var(--font-mono)" fontWeight="700">
                {WORD_LABEL[regionalData.grodno.word].toUpperCase()} · {regionalData.grodno.score}%
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
              d="M 215 35 L 495 42 L 505 195 L 360 215 L 230 160 Z"
              fill={selectedId === "minsk" ? "#1a2c22" : "#13211a"}
              stroke={selectedId === "minsk" ? "#d8b35d" : "#32503f"}
              strokeWidth={selectedId === "minsk" ? "2.5" : "1.2"}
              filter={selectedId === "minsk" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Символ Минска: Заводские корпуса МТЗ, трубы с дымом и звезда столицы */}
            <g transform="translate(330, 70)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "minsk" ? 1 : 0.85}>
              {/* Заводской корпус с пилообразными крышами (шед) */}
              <path d="M 0 38 L 0 20 L 16 12 L 16 20 L 32 12 L 32 20 L 48 12 L 48 38 Z" fill="#1b2e23" />
              {/* Высокие трубы */}
              <line x1="56" y1="38" x2="56" y2="2" strokeWidth="2.5" />
              <line x1="66" y1="38" x2="66" y2="6" strokeWidth="2" />
              {/* Дым над трубами */}
              <path d="M 56 0 Q 52 -8 60 -12 Q 68 -15 62 -22" stroke="#7d9185" strokeWidth="1.2" strokeDasharray="2 2" />
              {/* Звезда столицы */}
              <polygon points="24,-4 27,3 35,3 29,8 31,16 24,11 17,16 19,8 13,3 21,3" fill="#d8b35d" stroke="#d8b35d" strokeWidth="0.5" />
            </g>
            <text x="365" y="132" textAnchor="middle" fill="#eae3cf" fontSize="14" fontFamily="var(--font-narrow)" fontWeight="700" letterSpacing="1">
              ★ МИНСК
            </text>
            <text x="365" y="146" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              СТОЛИЦА · ЗАВОДЫ
            </text>
            {/* Бейдж статуса */}
            <g transform="translate(365, 160)">
              <rect x="-32" y="-9" width="64" height="16" rx="2" fill="#0d1411" stroke={WORD_COLOR[regionalData.minsk.word]} strokeWidth="1" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.minsk.word]} fontSize="9" fontFamily="var(--font-mono)" fontWeight="700">
                {WORD_LABEL[regionalData.minsk.word].toUpperCase()} · {regionalData.minsk.score}%
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
              d="M 40 170 L 145 190 L 195 245 L 180 345 L 35 330 Z"
              fill={selectedId === "brest" ? "#162820" : "#111f18"}
              stroke={selectedId === "brest" ? "#d8b35d" : "#2e4839"}
              strokeWidth={selectedId === "brest" ? "2.5" : "1.2"}
              filter={selectedId === "brest" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Символ Бреста: Цитадель и ж/д стрелка */}
            <g transform="translate(85, 215)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "brest" ? 1 : 0.85}>
              {/* Контур бастиона-звезды */}
              <polygon points="25,5 32,18 45,18 36,28 39,42 25,34 11,42 14,28 5,18 18,18" fill="#1b2e23" stroke="#cbb37a" strokeWidth="1.5" />
              {/* Ж/Д цистерна / эстакада */}
              <rect x="52" y="24" width="22" height="12" rx="3" fill="#1a2520" stroke="#9bb39e" strokeWidth="1.2" />
              <line x1="55" y1="38" x2="57" y2="40" stroke="#9bb39e" strokeWidth="2" />
              <line x1="69" y1="38" x2="71" y2="40" stroke="#9bb39e" strokeWidth="2" />
            </g>
            <text x="105" y="285" textAnchor="middle" fill="#eae3cf" fontSize="13" fontFamily="var(--font-narrow)" fontWeight="600" letterSpacing="1">
              БРЕСТ
            </text>
            <text x="105" y="299" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              БАСТИОН · ТРАНЗИТ
            </text>
            {/* Бейдж статуса */}
            <g transform="translate(105, 313)">
              <rect x="-32" y="-9" width="64" height="16" rx="2" fill="#0d1411" stroke={WORD_COLOR[regionalData.brest.word]} strokeWidth="1" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.brest.word]} fontSize="9" fontFamily="var(--font-mono)" fontWeight="700">
                {WORD_LABEL[regionalData.brest.word].toUpperCase()} · {regionalData.brest.score}%
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
              d="M 200 248 L 362 218 L 505 198 L 505 348 L 185 348 Z"
              fill={selectedId === "polesie" ? "#172921" : "#112019"}
              stroke={selectedId === "polesie" ? "#d8b35d" : "#2e4839"}
              strokeWidth={selectedId === "polesie" ? "2.5" : "1.2"}
              filter={selectedId === "polesie" ? `url(#glow-${mapId})` : undefined}
            />
            {/* Штриховка плавней */}
            <path d="M 220 280 L 480 280 L 480 340 L 220 340 Z" fill={`url(#swamp-${mapId})`} opacity="0.35" pointerEvents="none" />
            {/* Символ Полесья: Зерновые элеваторы и колосья */}
            <g transform="translate(325, 235)" stroke="#cbb37a" strokeWidth="1.5" fill="none" opacity={selectedId === "polesie" ? 1 : 0.85}>
              {/* Силосные башни элеватора */}
              <rect x="0" y="8" width="14" height="30" rx="2" fill="#1b2e23" />
              <rect x="16" y="4" width="14" height="34" rx="2" fill="#1b2e23" />
              <rect x="32" y="8" width="14" height="30" rx="2" fill="#1b2e23" />
              <line x1="-3" y1="8" x2="49" y2="8" strokeWidth="1.5" />
              {/* Колосок */}
              <path d="M 58 38 Q 63 20 60 5" stroke="#d8b35d" strokeWidth="1.5" />
              <line x1="56" y1="12" x2="62" y2="8" stroke="#d8b35d" strokeWidth="1.2" />
              <line x1="62" y1="18" x2="68" y2="14" stroke="#d8b35d" strokeWidth="1.2" />
              <line x1="55" y1="24" x2="61" y2="20" stroke="#d8b35d" strokeWidth="1.2" />
            </g>
            <text x="355" y="295" textAnchor="middle" fill="#eae3cf" fontSize="14" fontFamily="var(--font-narrow)" fontWeight="600" letterSpacing="1">
              ПОЛЕСЬЕ
            </text>
            <text x="355" y="309" textAnchor="middle" fill="#9ba89f" fontSize="10" fontFamily="var(--font-mono)">
              ЭЛЕВАТОРЫ · ПЛАВНИ · СОВЕТЫ
            </text>
            {/* Бейдж статуса */}
            <g transform="translate(355, 323)">
              <rect x="-32" y="-9" width="64" height="16" rx="2" fill="#0d1411" stroke={WORD_COLOR[regionalData.polesie.word]} strokeWidth="1" />
              <text y="3" textAnchor="middle" fill={WORD_COLOR[regionalData.polesie.word]} fontSize="9" fontFamily="var(--font-mono)" fontWeight="700">
                {WORD_LABEL[regionalData.polesie.word].toUpperCase()} · {regionalData.polesie.score}%
              </text>
            </g>
          </g>

          {/* ГИДРОГРАФИЯ (Реки Неман и Припять) */}
          {/* Река Неман (из центра на северо-запад через Гродно) */}
          <path
            d="M 280 120 Q 210 135 155 125 T 90 90 T 35 70"
            fill="none"
            stroke="#2f544c"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.8"
          />
          <text x="65" y="65" fill="#4f7c72" fontSize="9" fontFamily="var(--font-mono)" fontStyle="italic">
            р. Неман
          </text>

          {/* Река Припять (вдоль Полесья) */}
          <path
            d="M 120 280 Q 220 270 310 285 T 490 275"
            fill="none"
            stroke="#2f544c"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.8"
          />
          <text x="440" y="268" fill="#4f7c72" fontSize="9" fontFamily="var(--font-mono)" fontStyle="italic">
            р. Припять
          </text>

          {/* ЖЕЛЕЗНОДОРОЖНАЯ МАГИСТРАЛЬ (Брест — Барановичи — Минск) */}
          <path
            d="M 105 235 L 210 185 L 330 115"
            fill="none"
            stroke="#8a7952"
            strokeWidth="2"
            strokeDasharray="5 4"
            opacity="0.75"
          />
          <circle cx="210" cy="185" r="3" fill="#8a7952" />
        </svg>
      </div>

      {/* Быстрые кнопки переключения регионов */}
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
                {WORD_LABEL[r.word]} · {r.score}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Досье выбранного региона */}
      <article className="sv-republic-dossier" aria-live="polite">
        <div className="sv-republic-dossier-header">
          <div>
            <span className="sv-republic-dossier-sub">{current.tagline}</span>
            <h4 className="sv-republic-dossier-title">{current.name}</h4>
          </div>
          <div className="sv-republic-dossier-status-pill" style={{ borderColor: WORD_COLOR[current.word] }}>
            <span style={{ color: WORD_COLOR[current.word] }}>
              {WORD_LABEL[current.word].toUpperCase()}
            </span>
            <strong style={{ color: "#eae3cf" }}>{current.score}%</strong>
          </div>
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
