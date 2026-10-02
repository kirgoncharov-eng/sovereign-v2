// Приём анонимных событий аналитики. Тело — {pid, events:[{e, p?}]}; отвечает 204 всегда, кроме мусора.
import { PID, record, type TrackInput } from "@/lib/server/analytics.ts";
import { checkRate, clientKey } from "@/lib/server/rateLimit.ts";

export async function POST(req: Request) {
  if (!checkRate(`track:${clientKey(req)}`).ok) return new Response(null, { status: 429 });
  let body: { pid?: unknown; events?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400 }); }
  const pid = typeof body.pid === "string" ? body.pid : "";
  if (!PID.test(pid) || !Array.isArray(body.events)) return new Response(null, { status: 400 });
  const events = body.events.slice(0, 20).filter((x): x is TrackInput =>
    !!x && typeof x === "object" && typeof (x as TrackInput).e === "string" && ((x as TrackInput).p === undefined || typeof (x as TrackInput).p === "object"));
  try { await record(pid, events); } catch (e) { console.error("track", e); }
  return new Response(null, { status: 204 });
}
