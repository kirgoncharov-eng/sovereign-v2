// Приём ошибок из игры: {pid, errors:[{kind, msg, v}]}. Отвечает 204; мусор — 400.
import { PID } from "@/lib/server/analytics.ts";
import { parseErrors, recordErrors } from "@/lib/server/errors.ts";
import { clientKey, limit } from "@/lib/server/rateLimit.ts";

export async function POST(req: Request) {
  if (!(await limit(`err:${clientKey(req)}`)).ok) return new Response(null, { status: 429 });
  let body: { pid?: unknown; errors?: unknown; context?: Record<string, unknown> };
  try {
    const raw = await req.text();
    if (raw.length > 8_000) return new Response(null, { status: 413 });
    body = JSON.parse(raw);
  } catch { return new Response(null, { status: 400 }); }
  if (typeof body.pid !== "string" || !PID.test(body.pid)) return new Response(null, { status: 400 });
  try { await recordErrors(parseErrors(body.errors), Date.now(), body.pid, body.context); } catch (e) { console.error("error-report", e); }
  return new Response(null, { status: 204 });
}
