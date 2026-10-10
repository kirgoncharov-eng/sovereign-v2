// Метаданные измерения не участвуют в расчёте партии и проверке «Дела дня».
import { acquisitionChannel, validChannel } from "./acquisition-source.ts";

export interface AnalyticsRun {
  id: string;
  startedAt: number;
  version: string;
  source: "tg" | "web";
  channel?: string;
  mode: "ordinary" | "daily";
}
export function validAnalyticsRun(v: unknown): v is AnalyticsRun {
  if (!v || typeof v !== "object") return false;
  const r = v as AnalyticsRun;
  return typeof r.id === "string" && /^[a-z0-9]{16,32}$/.test(r.id)
    && Number.isSafeInteger(r.startedAt) && r.startedAt > 0
    && typeof r.version === "string" && /^[a-zA-Z0-9._-]{1,24}$/.test(r.version)
    && ["tg", "web"].includes(r.source) && ["ordinary", "daily"].includes(r.mode)
    && (r.channel === undefined || validChannel(r.channel));
}
let current: AnalyticsRun | undefined;
export function setRunContext(run: unknown) { current = validAnalyticsRun(run) ? run : undefined; }
export function runProps(): Record<string, string | number | boolean> {
  if (!current) return {};
  return {
    rid: current.id, at: current.startedAt, rv: current.version, rs: current.source, rm: current.mode,
    ...(current.channel ? { rc: current.channel } : {}),
  };
}
export function newAnalyticsRun(version: string, source: AnalyticsRun["source"], daily: boolean): AnalyticsRun {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const channel = acquisitionChannel();
  return {
    id: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""),
    startedAt: Date.now(), version, source, mode: daily ? "daily" : "ordinary",
    ...(channel ? { channel } : {}),
  };
}
