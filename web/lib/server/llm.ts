// Вызовы моделей. Только сервер: здесь используются ключи API.
import { mockResponse, type Task } from "./mock.ts";

const MODEL_FAST = process.env.MODEL_FAST || "gemini-3.1-flash-lite";
const MODEL_DEEP = process.env.MODEL_DEEP || "gemini-3.1-flash-lite";
const MODEL_FALLBACK = process.env.MODEL_FALLBACK || "claude-haiku-4-5-20251001";

const GEMINI_URL = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

type Tier = "fast" | "deep";

async function callGemini(prompt: string, model: string, maxTokens: number, system: string): Promise<string> {
  const r = await fetch(GEMINI_URL(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GOOGLE_AI_KEY || "" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        // КРИТИЧНО: отключаем thinking mode — иначе модель тратит время на размышления и таймаутится
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const d = await r.json();
  if (!r.ok) {
    console.error("Gemini error:", JSON.stringify(d));
    throw new Error(`Gemini: ${d.error?.message || r.status}`);
  }
  return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callClaude(prompt: string, model: string, maxTokens: number, system: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) {
    console.error("Claude error:", JSON.stringify(d));
    throw new Error(`Claude: ${d.error?.message || r.status}`);
  }
  return d.content?.find((b: { type: string }) => b.type === "text")?.text || "";
}

async function callModel(prompt: string, model: string, maxTokens: number, system: string): Promise<string> {
  const call = model.startsWith("gemini") ? callGemini : callClaude;
  try {
    return await call(prompt, model, maxTokens, system);
  } catch (err) {
    if (model === MODEL_FALLBACK) throw err;
    console.warn(`Primary model ${model} failed, using fallback ${MODEL_FALLBACK}:`, (err as Error).message);
    return await callClaude(prompt, MODEL_FALLBACK, maxTokens, system);
  }
}

export function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // модель иногда добавляет текст вокруг JSON — вырезаем внешний объект
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
}

export class GenerationError extends Error {}

// Запрашивает JSON и проверяет его; при негодном ответе повторяет запрос один раз.
export async function generate<T>(opts: {
  task: Task;
  prompt: string;
  system: string;
  tier: Tier;
  maxTokens: number;
  validate: (raw: unknown) => T | null;
}): Promise<T> {
  const model = opts.tier === "deep" ? MODEL_DEEP : MODEL_FAST;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = process.env.AI_MOCK === "1"
      ? mockResponse(opts.task)
      : await callModel(opts.prompt, model, opts.maxTokens, opts.system);
    const result = opts.validate(parseJson(text));
    if (result) return result;
    console.warn(`Invalid model response (attempt ${attempt + 1}):`, text.slice(0, 500));
  }
  throw new GenerationError("Модель вернула некорректный ответ");
}
