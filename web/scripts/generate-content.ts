// Пакетная генерация карточек событий для режима «Сценарии».
// Модель пишет карточки офлайн, скрипт проверяет каждую и дописывает годные в lib/content/generated.ts.
// Запуск: GOOGLE_AI_KEY=... (или ANTHROPIC_API_KEY=...) node scripts/generate-content.ts [партий=5] [карточек в партии=10]
import { writeFile } from "node:fs/promises";
import { ACTION_TAGS, ACTIONS, COUNTRIES, RESOURCE_KEYS } from "../lib/game/data.ts";
import { EVENT_CARDS, type EventCard } from "../lib/content/events.ts";
import { GENERATED_CARDS } from "../lib/content/generated.ts";
import { isObj, str } from "../lib/game/sanitize.ts";
import { generate } from "../lib/server/llm.ts";
import type { ActionTag, ResourceKey } from "../lib/game/types.ts";

const BLOCS = ["security", "business", "church", "liberal", "west", "russia", "nationalist", "regional", "ruling"];
const batches = Number(process.argv[2]) || 5;
const perBatch = Number(process.argv[3]) || 10;

function sanitizeCard(raw: unknown, taken: Set<string>): EventCard | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id, 40).replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const title = str(raw.title, 120), description = str(raw.description, 500);
  if (!id || taken.has(id) || !title || !description) return null;
  const choices = (Array.isArray(raw.choices) ? raw.choices : []).filter(isObj).map(c => ({
    text: str(c.text, 200), hint: str(c.hint, 120),
    tags: (Array.isArray(c.tags) ? c.tags : []).filter((t): t is ActionTag => ACTION_TAGS.includes(t as ActionTag)).slice(0, 2),
    ...(c.resolves === true ? { resolves: true } : {}),
  })).filter(c => c.text && c.tags.length).slice(0, 3);
  if (choices.length < 2 || new Set(choices.map(c => c.tags.join())).size < choices.length) return null;
  const w = isObj(raw.when) ? raw.when : {};
  const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is ResourceKey => RESOURCE_KEYS.includes(k as ResourceKey)) : undefined);
  const when = {
    ...(keys(w.low)?.length ? { low: keys(w.low) } : {}),
    ...(keys(w.high)?.length ? { high: keys(w.high) } : {}),
    ...(BLOCS.includes(w.hostile as string) ? { hostile: w.hostile } : {}),
    ...(w.crisis === true ? { crisis: true } : {}),
    ...(typeof w.minTurn === "number" ? { minTurn: Math.max(1, Math.min(18, Math.round(w.minTurn))) } : {}),
  } as EventCard["when"];
  const countries = Array.isArray(raw.countries) ? raw.countries.filter(c => typeof c === "string" && c in COUNTRIES) as string[] : [];
  return { id, source: str(raw.source, 30, "Кабинет"), title, description, choices, when, ...(countries.length ? { countries } : {}) };
}

const catalog = ACTION_TAGS.map(t => `${t} — ${ACTIONS[t].label}: ${ACTIONS[t].desc}`).join("\n");
const cards = [...GENERATED_CARDS];
const taken = new Set([...EVENT_CARDS, ...cards].map(c => c.id));

for (let b = 0; b < batches; b++) {
  const country = Object.keys(COUNTRIES)[b % Object.keys(COUNTRIES).length];
  const prompt = `Сгенерируй ${perBatch} разных карточек событий для политической симуляции. Страна: ${country} (${COUNTRIES[country].context}).
Каждая карточка — острая политическая ситуация с тремя РАЗНЫМИ по типу вариантами решения. Никаких реальных ныне живущих политиков.
Слоты в тексте: {capital}, {rival} (партия-конкурент), {fig:блок} — имя ключевой фигуры блока (${BLOCS.join(", ")}).
Типы действий (tags, 1–2 на вариант):\n${catalog}
Условия появления (when, необязательно): low/high — список ресурсов (${RESOURCE_KEYS.join(", ")}), hostile — блок, crisis — true, minTurn — число.
Уже есть карточки: ${[...taken].slice(-60).join(", ")} — не повторяй их темы.
JSON: {"cards":[{"id":"snake_case","countries":["${country}"],"source":"Улица|Кабинет|Разведка|Пресса|МИД|Армия|Олигарх|Кремль|Брюссель","title":"...","description":"2-3 предложения","when":{},"choices":[{"text":"...","hint":"кто выиграет, кто проиграет","tags":["..."]}]}]}`;
  const got = await generate({
    task: "event", prompt, system: "Ты — сценарист политической игры. Отвечай только JSON на русском.", tier: "deep", maxTokens: 6000,
    validate: r => (isObj(r) && Array.isArray(r.cards) ? r.cards : null),
  });
  let ok = 0;
  for (const raw of got) {
    const card = sanitizeCard(raw, taken);
    if (card) { cards.push(card); taken.add(card.id); ok++; }
  }
  console.log(`партия ${b + 1}/${batches} (${country}): принято ${ok} из ${got.length}`);
}

await writeFile(new URL("../lib/content/generated.ts", import.meta.url), `// Карточки, сгенерированные офлайн скриптом scripts/generate-content.ts и прошедшие проверку.
// Файл перезаписывается скриптом; вручную не править.
import type { EventCard } from "./events.ts";

export const GENERATED_CARDS: EventCard[] = ${JSON.stringify(cards, null, 2)};
`);
console.log(`всего сгенерированных карточек: ${cards.length}`);
