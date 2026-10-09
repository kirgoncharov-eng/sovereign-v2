// Когда открывается президентский стол: сообщения, правительство, поручения.
// Первые два хода игрок знакомится с главным — делом, резолюцией и газетой. Стол появляется с третьего хода,
// когда основной ритм уже понятен; тогда же начинают жить программы и приходят первые письма.
import { openLivingWorld } from "./living-world.ts";
import type { GameState } from "./types.ts";

export const DESK_FROM = 2; // столько решений принято к моменту, когда стол открывается

export function openDeskWhenDue(gs: GameState): GameState {
  if (!gs.world && gs.turn < DESK_FROM) return gs;
  return openLivingWorld(gs);
}
