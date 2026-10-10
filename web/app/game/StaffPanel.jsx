"use client";
// Кадровый резерв в досье: три кандидата в год, одно кадровое решение за квартал.
// Назначение — замена: кандидат садится в кресло советника, прежний уходит. Цену и реакцию лагерей видно до подписи.
import { useState } from "react";
import {
  DOSSIER_COST, DOSSIER_PRESS_LOYALTY, DOSSIER_SECURITY_LOYALTY, candidatePool, dismissalOf, dossierBlocked, staffingBlocked, staffingOpen,
} from "@/lib/game/staffing.ts";
import { RES_CONFIG } from "@/lib/game/data.ts";

const SHORT = {
  politicalCapital: "политкапитал", economy: "экономика", military: "силовики",
  externalReputation: "репутация", internalLegitimacy: "легитимность", personalResource: "личный ресурс",
};
const BLOC_NAME = {
  security: "силовики", business: "бизнес", church: "церковь", liberal: "либералы", west: "Запад",
  russia: "Москва", nationalist: "националисты", regional: "регионы", ruling: "правящая партия",
};
const upperFirst = text => text.charAt(0).toUpperCase() + text.slice(1);
const stars = skill => "★".repeat(skill) + "☆".repeat(3 - skill);
const signed = value => (value > 0 ? `+${value}` : `−${-value}`);
const costLine = cost => RES_CONFIG.filter(resource => cost[resource.key])
  .map(resource => `${SHORT[resource.key]} ${signed(cost[resource.key])}`).join(", ");

function Candidate({ gs, candidate, onHire }) {
  const [confirm, setConfirm] = useState(false);
  const current = gs.advisors.find(advisor => advisor.id === candidate.seat);
  const leaving = current ? dismissalOf(gs, current) : null;
  const blocked = staffingBlocked(gs, candidate);
  const camps = Object.entries(candidate.relation)
    .filter(([bloc]) => gs.factions.some(faction => faction.bloc === bloc))
    .map(([bloc, value]) => `${BLOC_NAME[bloc] ?? bloc} ${signed(value)}`);
  const price = costLine(candidate.cost);
  return (
    <div className="sv-staff-candidate">
      <div className="sv-staff-head">
        <strong>{candidate.name}</strong>
        <span>{upperFirst(candidate.title)} · {stars(candidate.skill)} · лояльность {candidate.loyalty}</span>
      </div>
      <p className="sv-staff-bio">{candidate.bio}</p>
      <div className="sv-staff-line">На место: {current ? `${current.name}, ${current.role.toLowerCase()}` : candidate.seat}</div>
      {price && <div className="sv-staff-line">Цена назначения: {price}</div>}
      {camps.length > 0 && <div className="sv-staff-line">Лагеря: {camps.join(", ")}</div>}
      {leaving && (
        <div className={`sv-staff-line ${leaving.scandal ? "sv-staff-bad" : ""}`}>
          {leaving.text}{leaving.camp ? ` Лагерь «${leaving.camp.name}» обидится.` : ""}
        </div>
      )}
      {blocked ? <div className="sv-staff-line sv-staff-muted">{blocked}</div>
        : confirm ? (
          <div className="sv-staff-actions">
            <button type="button" className="sv-staff-sign" onClick={() => { setConfirm(false); onHire(candidate.id); }}>Подписать указ</button>
            <button type="button" className="sv-staff-cancel" onClick={() => setConfirm(false)}>Отмена</button>
          </div>
        ) : <button type="button" className="sv-staff-hire" onClick={() => setConfirm(true)}>Назначить</button>}
    </div>
  );
}

export default function StaffPanel({ gs, onHire }) {
  const [error, setError] = useState(null);
  if (!staffingOpen(gs)) return null;
  const pool = candidatePool(gs);
  const hire = id => {
    try { setError(null); onHire(id); } catch (failure) { setError(failure.message); }
  };
  return (
    <section className="sv-staff" aria-label="Кадровый резерв">
      <div className="sv-staff-title">КАДРОВЫЙ РЕЗЕРВ</div>
      <p className="sv-staff-note">Одно кадровое решение за квартал. Новый человек занимает кресло советника — прежний уходит. Резерв обновляется раз в год.</p>
      {gs.staffing?.receipt && gs.staffing.lastTurn === gs.turn && <p className="sv-staff-receipt">{gs.staffing.receipt}</p>}
      {pool.length ? pool.map(candidate => <Candidate key={candidate.id} gs={gs} candidate={candidate} onHire={hire}/>)
        : <p className="sv-staff-note">Резерв на этот год исчерпан.</p>}
      {error && <p className="sv-staff-line sv-staff-bad">✖ {error}</p>}
    </section>
  );
}

// Досье на советника: собрать (силовики, стоит денег и их лояльности) или пустить в ход один раз.
export function DossierActions({ gs, advisor, onDossier }) {
  const [error, setError] = useState(null);
  if (!staffingOpen(gs)) return null;
  const action = advisor.dossier ? (advisor.dossier.used ? null : "press") : "collect";
  if (!action) return null;
  const blocked = dossierBlocked(gs, advisor.id, action);
  const label = action === "collect"
    ? `Собрать досье (${costLine(DOSSIER_COST)}, силовики ${signed(DOSSIER_SECURITY_LOYALTY)} лояльности)`
    : `Напомнить о досье (лояльность ${signed(DOSSIER_PRESS_LOYALTY)})`;
  const run = () => {
    try { setError(null); onDossier(advisor.id, action); } catch (failure) { setError(failure.message); }
  };
  return (
    <div className="sv-dossier-actions">
      {blocked ? <span className="sv-staff-muted">{blocked}</span>
        : <button type="button" className="sv-staff-hire" onClick={run}>{label}</button>}
      {error && <div className="sv-staff-bad">✖ {error}</div>}
    </div>
  );
}
