import { test } from "node:test";
import assert from "node:assert/strict";
import { BILL, LAWS } from "../content/laws.ts";
import { DEEDS, ELECTION_NIGHT, INTERCUTS } from "../content/roles.ts";
import { classicApi, fill } from "./classic.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import type { GameState } from "./types.ts";

const CHRISTIAN = /(церк|Церк|прихожан|Прихожан|молебен|молебн|икон|епарх|священ|Священ|храм|Храм|патриарх|Патриарх|христиан)/;

// Все тексты закона, которые может увидеть игрок.
function lawTexts(def: (typeof LAWS)[number]): string[] {
  const follow = def.followUp;
  const all = [def.pitch, def.passed, def.failed, def.vetoed, ...Object.values(def.head),
    ...(follow ? [follow.title, follow.description, ...follow.choices.flatMap(c => [c.text, c.hint, c.scene, c.fail, ...(c.head ?? [])])] : [])];
  return all.filter((text): text is string => typeof text === "string");
}

test("Казахстан: в законах нет церковной лексики, закон о статусе церкви заменён своим", async () => {
  const kz = createInitialState("Казахстан", "debut", "pragmatist", await classicApi.setup("Казахстан", "debut", "pragmatist", 3));
  const forKz = LAWS.filter(def => !def.countries || def.countries.includes("Казахстан"));
  assert.ok(!forKz.some(def => def.id === "church_status"), "закон о церкви в Казахстане не вносится");
  assert.ok(forKz.some(def => def.id === "religion_status"), "у Казахстана свой закон о традиционной религии");
  for (const def of forKz) for (const text of lawTexts(def)) {
    const filled = fill(text, kz, { law: def.title });
    assert.ok(!CHRISTIAN.test(filled), `${def.id}: ${filled.match(CHRISTIAN)?.[0]} — «${filled.slice(0, 120)}»`);
  }
  // Реплики и сцены людей по ролям: муфтий не служит молебен.
  const roleTexts = JSON.stringify([DEEDS, ELECTION_NIGHT, INTERCUTS]).match(/"[^"]{20,}"/g) ?? [];
  for (const raw of roleTexts) {
    const filled = fill(JSON.parse(raw), kz, { name: "Серик Мукашев", role: "верховный муфтий" });
    assert.ok(!CHRISTIAN.test(filled), filled);
  }
  const ge = createInitialState("Грузия", "debut", "pragmatist", await classicApi.setup("Грузия", "debut", "pragmatist", 3));
  assert.equal(fill("{faith:Church} отвечает молчанием", ge), "Церковь отвечает молчанием");
  assert.equal(fill("{faith:Church} отвечает молчанием", kz), "Духовенство отвечает молчанием");
});

test("отложенный законопроект: за партию сцена не повторяется, пока не кончатся варианты", async () => {
  let s: GameState = createInitialState("Беларусь", "debut", "pragmatist", await classicApi.setup("Беларусь", "debut", "pragmatist", 9), seededRandom(9));
  const scenes: string[] = [];
  while (!s.ended && s.turn < 160 && scenes.length < BILL.delayScenes.length) {
    // Здоровая страна: проверяем текст, а не выживание.
    s = { ...s, resources: { politicalCapital: 60, economy: 60, military: 60, externalReputation: 60, internalLegitimacy: 60, personalResource: 60 },
      factions: s.factions.map(f => ({ ...f, relation: 40 })), activeCrises: [] };
    const ev = await classicApi.event(s);
    const before = startEvent(s, ev);
    const delay = ev.cardId?.startsWith("law:") ? ev.choices.find(c => c.id === "c") : undefined;
    const choice = delay ?? ev.choices.find(c => !c.path) ?? ev.choices[0];
    s = resolveTurn(before, choice.id, await classicApi.consequence(before, choice.id));
    if (delay) scenes.push(delay.scene!);
  }
  assert.ok(scenes.length >= 4, `законопроектов за партию: ${scenes.length}`);
  assert.equal(new Set(scenes).size, scenes.length, scenes.join("\n"));
});

// Партии в кавычках разрешены: их оборачивает quoted(), не добавляя вторые кавычки.
test("названия лагерей без кавычек внутри: иначе выходит «Лагерь «Партия «…»»»", async () => {
  const { FACTIONS_DATA } = await import("./data.ts");
  for (const name of Object.values(FACTIONS_DATA).flat().map(f => f.name)) assert.ok(!/[«»"]/.test(name), name);
});
