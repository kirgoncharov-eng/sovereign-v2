// Клиент к /api/ai. Отправляет только то, что нужно серверу для промпта.
import type { Assessment, Narration, GameEvent, GameState, Intro, Verdict } from "../game/types.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте интернет.", 0);
  }
  let data: (T & { error?: string }) | null = null;
  try { data = await r.json(); } catch { /* не JSON — например, таймаут платформы */ }
  if (!r.ok || !data) {
    const fallback = r.status === 504 ? "Модель не успела ответить." : `Ошибка сервера (${r.status}).`;
    throw new ApiError(data?.error || fallback, r.status);
  }
  return data;
}

// Серверу не нужны снимки прошлого хода, отчёт и вердикт — не гоняем их по сети.
function slim(state: GameState) {
  return {
    ...state,
    prevResources: null, prevFactions: null, prevFigures: null,
    lastTurn: null, verdict: null,
  };
}

export const api = {
  setup: (country: string, diff: string, ideo: string) =>
    call<{ intro: Intro }>({ task: "setup", country, diff, ideo }).then(d => d.intro),
  event: (state: GameState) =>
    call<{ event: GameEvent }>({ task: "event", state: slim(state) }).then(d => d.event),
  consequence: (state: GameState, choiceId: string) =>
    call<{ narration: Narration }>({ task: "consequence", state: slim(state), choiceId }).then(d => d.narration),
  assess: (state: GameState, text: string) =>
    call<{ assessment: Assessment }>({ task: "assess", state: slim(state), text }).then(d => d.assessment),
  ending: (state: GameState) =>
    call<{ verdict: Verdict }>({ task: "ending", state: slim(state) }).then(d => d.verdict),
};
