import { kv } from "./kv.ts";
import { validAnalyticsRun, type AnalyticsRun } from "../client/run-context.ts";
import type { TrackInput } from "./analytics.ts";

const TTL = 120 * 86400;
const dateOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export interface RunCohort {
  date: string;
  mode: AnalyticsRun["mode"];
  version: string;
  source: AnalyticsRun["source"];
  channel?: string;
  h: Record<string, number>;
}

// Каждый рубеж записывается один раз. Метаданные старта передаются и с поздними
// событиями: потерянный/задержавшийся первый пакет не сдвигает когорту на день финала.
export async function recordRunMilestones(pid: string, event: TrackInput, now: number) {
  if (!["start", "resume", "turn", "end", "share", "intro", "first", "desk"].includes(event.e)) return;
  const p = event.p;
  const candidate = { id: p?.rid, startedAt: p?.at, version: p?.rv, source: p?.rs, mode: p?.rm, channel: p?.rc };
  if (event.e === "desk" && (candidate.mode !== "ordinary"
    || !["available", "messages", "government", "appointed"].includes(String(p?.kind)))) return;
  if (!validAnalyticsRun(candidate) || candidate.startedAt > now + 300_000 || now - candidate.startedAt >= TTL * 1000) return;
  const key = `an:run:${pid}:${candidate.id}`;
  const newMeasurement = await kv.hsetnx(key, "meta", JSON.stringify(candidate));
  const raw = await kv.hget(key, "meta");
  if (!raw) return;
  const run: AnalyticsRun = JSON.parse(raw);
  if (now - run.startedAt >= TTL * 1000) return;
  const date = dateOf(run.startedAt);
  const group = `${run.mode}|${run.version}|${run.source}${run.channel ? `|${run.channel}` : ""}`;
  const cohort = `an:runs:${date}:${group}`;
  await kv.sadd(`an:runs:${date}:groups`, group);
  const milestones = ["started"];
  if (event.e === "desk") {
    if (run.mode !== "ordinary") return;
    const deskMilestone: Record<string, string> = {
      available: "deskAvailable", messages: "deskMessages", government: "deskGovernment", appointed: "deskAppointed",
    };
    const name = typeof p?.kind === "string" ? deskMilestone[p.kind] : undefined;
    if (typeof name !== "string") return;
    milestones.push("deskAvailable", name);
    if (p?.kind === "messages" || p?.kind === "government") milestones.push("deskOpened");
  }
  if (newMeasurement) milestones.push("windowMeasured");
  if (event.e === "resume") milestones.push("resumed");
  if (event.e === "end") milestones.push("ended");
  if (event.e === "share") milestones.push("shareAttempt");
  const n = event.e === "turn" ? p?.n : event.e === "end" ? p?.turns : undefined;
  if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000) {
    for (const step of [1, 3, 5, 10, 20]) if (n >= step) milestones.push(`turn${step}`);
    if (now - run.startedAt <= 3 * 864e5 && (event.e === "end" || n >= 20)) milestones.push("resolved3d");
  }
  for (const milestone of milestones) {
    if (await kv.hsetnx(key, milestone, "1")) await kv.hincrby(cohort, milestone);
  }
  await Promise.all([kv.expire(key, TTL), kv.expire(cohort, TTL), kv.expire(`an:runs:${date}:groups`, TTL)]);
}

export async function readRunCohorts(dates: string[]): Promise<RunCohort[]> {
  const rows = await Promise.all(dates.map(async date => {
    const groups = await kv.smembers(`an:runs:${date}:groups`);
    return Promise.all(groups.sort().map(async group => {
      const [mode, version, source, channel] = group.split("|") as [AnalyticsRun["mode"], string, AnalyticsRun["source"], string?];
      const values = await kv.hgetall(`an:runs:${date}:${group}`);
      return { date, mode, version, source, channel,
        h: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Number(value) || 0])) };
    }));
  }));
  return rows.flat();
}
