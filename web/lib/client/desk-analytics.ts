import { track } from "./analytics.ts";
import { validAnalyticsRun } from "./run-context.ts";
import type { GameState } from "../game/types.ts";

export const DESK_EVENTS = ["available", "messages", "government", "appointed"] as const;
export type DeskEvent = (typeof DESK_EVENTS)[number];
type Sender = (event: "desk", props: Record<string, string | number | boolean>) => void;
const availableRuns = new Set<string>();

export function trackDesk(gs: GameState, kind: DeskEvent, send: Sender = track): void {
  if (gs.daily || gs.ended || !gs.world || !validAnalyticsRun(gs.analyticsRun)) return;
  const run = gs.analyticsRun;
  if (kind === "available") {
    if (availableRuns.has(run.id)) return;
    if (availableRuns.size >= 1000) availableRuns.clear();
    availableRuns.add(run.id);
  }
  send("desk", {
    kind, rid: run.id, at: run.startedAt, rv: run.version, rs: run.source, rm: run.mode,
    ...(run.channel ? { rc: run.channel } : {}),
  });
}

// Вызывается после успешной подписи. Выбор варианта и чтение сюда не попадают.
export function trackAppointment(gs: GameState, action: string, send: Sender = track): void {
  if (/^(appoint:|replace:|health:appoint:|health:replace:|government:start:)/.test(action)) {
    trackDesk(gs, "appointed", send);
  }
}
