// Единая точка обращения к модели. Клиент присылает только игровое состояние и выбор —
// промпты собираются здесь, поэтому эндпоинт нельзя использовать как прокси к API.
import { MAX_TURNS, FIGURE_ROLES } from "@/lib/game/data.ts";
import { findChoice, planTurn, warningLevel } from "@/lib/game/engine.ts";
import { consequencePrompt, councilPrompt, endingPrompt, eventPrompt, setupPrompt, SYS_BASE, SYS_CONSEQUENCE, SYS_ENDING } from "@/lib/game/prompts.ts";
import {
  isObj, sanitizeNarration, sanitizeProposals, sanitizeEvent, sanitizeIntro, sanitizeState, sanitizeVerdict,
  validCountry, validDiff, validIdeo,
} from "@/lib/game/sanitize.ts";
import { generate, GenerationError } from "@/lib/server/llm.ts";
import { beatEvent, inspectEvent, pressEvent, specialEvent } from "@/lib/game/classic.ts";
import { checkRate, clientKey } from "@/lib/server/rateLimit.ts";

// Vercel: разрешаем функции работать до 60 секунд (по умолчанию 10)
export const maxDuration = 60;

const MAX_BODY = 100_000;
const RANDOM_EVENT_CHANCE = 0.28;

const fail = (status: number, error: string, headers?: HeadersInit) =>
  Response.json({ error }, { status, headers });

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // не браузерный запрос — его ограничивает rate limit
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// Клиент спрашивает, доступен ли режим «ИИ-режиссёр» на этом сервере.
export function GET() {
  return Response.json({ ai: Boolean(process.env.GOOGLE_AI_KEY || process.env.ANTHROPIC_API_KEY) || process.env.AI_MOCK === "1" });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Запрещено");

  const rate = checkRate(clientKey(req));
  if (!rate.ok) {
    return fail(429, "Слишком много запросов. Передохните и попробуйте позже.", { "Retry-After": String(rate.retryAfter) });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, "Слишком большой запрос");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail(400, "Некорректный JSON"); }
  if (!isObj(body)) return fail(400, "Некорректный запрос");

  try {
    switch (body.task) {
      case "setup": {
        const { country, diff, ideo } = body;
        if (!validCountry(country) || !validDiff(diff) || !validIdeo(ideo)) return fail(400, "Некорректные параметры партии");
        const intro = await generate({
          task: "setup",
          prompt: setupPrompt(country, diff, ideo),
          system: SYS_BASE, tier: "fast", maxTokens: 1200,
          validate: r => sanitizeIntro(r, FIGURE_ROLES[country].length),
        });
        return Response.json({ intro });
      }

      case "event": {
        const state = sanitizeState(body.state);
        if (!state || state.ended || state.turn >= MAX_TURNS) return fail(400, "Некорректное состояние игры");
        // Интриги и дела о людях и союзах — авторские в обоих режимах.
        const authored = beatEvent(state) ?? inspectEvent(state) ?? pressEvent(state) ?? specialEvent(state);
        if (authored) return Response.json({ event: authored });
        const isCritical = warningLevel(state) === "critical";
        const withRandom = state.turn > 0 && Math.random() < RANDOM_EVENT_CHANCE;
        const factionIds = state.factions.map(f => f.id);
        const event = await generate({
          task: "event",
          prompt: eventPrompt(state, { isCritical, withRandom }),
          system: SYS_BASE, tier: "fast", maxTokens: 1200,
          validate: r => sanitizeEvent(r, factionIds, { isCritical, allowRandom: withRandom, crisisIds: state.activeCrises.map(c => c.id) }),
        });
        return Response.json({ event });
      }

      case "consequence": {
        const state = sanitizeState(body.state);
        const event = state?.currentEvent;
        const choice = event && typeof body.choiceId === "string" ? findChoice(event, body.choiceId) : undefined;
        if (!state || state.ended || !choice) return fail(400, "Некорректное состояние игры");
        const narration = await generate({
          task: "consequence",
          prompt: consequencePrompt(state, planTurn(state, choice.id)),
          system: SYS_CONSEQUENCE, tier: "fast", maxTokens: 1500,
          validate: sanitizeNarration,
        });
        return Response.json({ narration });
      }

      case "council": {
        const state = sanitizeState(body.state);
        if (!state || state.ended || !state.currentEvent || state.councilCharges <= 0 || state.currentEvent.council?.length) {
          return fail(400, "Совет сейчас собрать нельзя");
        }
        const crisisIds = state.activeCrises.map(c => c.id);
        const proposals = await generate({
          task: "council",
          prompt: councilPrompt(state),
          system: SYS_BASE, tier: "fast", maxTokens: 1200,
          validate: r => {
            const list = isObj(r) ? sanitizeProposals(r.council, state.advisors, crisisIds) : [];
            return list.length >= 2 ? list : null;
          },
        });
        return Response.json({ proposals });
      }

      case "ending": {
        const state = sanitizeState(body.state);
        if (!state || !state.ended) return fail(400, "Некорректное состояние игры");
        const verdict = await generate({
          task: "ending",
          prompt: endingPrompt(state),
          system: SYS_ENDING, tier: "deep", maxTokens: 1500,
          validate: sanitizeVerdict,
        });
        return Response.json({ verdict });
      }

      default:
        return fail(400, "Неизвестная задача");
    }
  } catch (err) {
    console.error("Route error:", (err as Error).message);
    const msg = err instanceof GenerationError ? err.message : "Сервис модели недоступен";
    return fail(502, msg);
  }
}
