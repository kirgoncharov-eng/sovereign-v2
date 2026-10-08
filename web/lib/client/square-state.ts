import { computePolls } from "../game/engine.ts";
import type { GameState } from "../game/types.ts";
import type { SquareState } from "./square.ts";

// Площадь отражает уже случившееся. Новые варианты и прогнозы не меняют её состояние.
export function squareStateOf(gs: GameState, phase?: number): SquareState {
  const sec = gs.factions.filter(f => f.bloc === "security");
  const last = gs.history.at(-1);
  const tags = last?.success === true ? last.tags ?? [] : [];
  const election = gs.elections?.at(-1);
  const justVoted = election?.turn === gs.turn;
  const incident = gs.currentEvent?.card === "terror" || gs.currentEvent?.card === "gas_blast" || gs.lastTurn?.scene === "explosion";
  const security = sec.length ? sec.reduce((n, f) => n + f.relation, 0) / sec.length : 0;
  const rating = computePolls(gs.country, gs.factions, gs.resources).leader;
  return {
    country: gs.country, seed: gs.seed, turn: gs.turn, phase,
    legitimacy: gs.resources.internalLegitimacy, economy: gs.resources.economy,
    military: gs.resources.military, rating, security,
    crises: gs.activeCrises.length, election: !!justVoted,
    blackout: gs.resources.economy < 20 || gs.activeCrises.some(c => /энерг|электр/i.test(c.title)),
    response: gs.endType === "coup" || gs.endType === "dictator" ? "lockdown"
      : incident ? "mourning"
      : tags.includes("repress") ? "lockdown"
      : justVoted && election.outcome === "won" ? "celebration"
      : tags.includes("investment") && gs.resources.economy >= 30 ? "works" : null,
  };
}
