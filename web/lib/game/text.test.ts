import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, IDEOLOGIES } from "./data.ts";
import { classicApi } from "./classic.ts";
import { createInitialState, isFemaleName, resolveTurn, startEvent } from "./engine.ts";
import { PLACES } from "../content/frame.ts";
import type { GameState } from "./types.ts";

// Логика текста на целых партиях: слоты заполнены, говорят те, кого решение касается,
// закрытые эпизоды интриги публика не комментирует, место в шапке совпадает с родом дела.
async function play(country: string, seed: number, ideo: string, each: (before: GameState, after: GameState) => void) {
  let s = createInitialState(country, "debut", ideo as GameState["ideo"], await classicApi.setup(country, "debut", ideo, seed));
  let i = 0;
  while (!s.ended) {
    const ev = await classicApi.event(s);
    const before = startEvent(s, ev);
    const c = ev.choices[(i++ * 7 + seed) % ev.choices.length];
    s = resolveTurn(before, c.id, await classicApi.consequence(before, c.id));
    each(before, s);
  }
  return s;
}

test("текст партии: без пустых слотов, говорят стороны закона, эпизоды интриги без публики, эха не больше двух", async () => {
  const slot = /\{\w+(:\w+)*(\|[^}]*)?\}/;
  for (const country of Object.keys(COUNTRIES)) for (const seed of [3, 11, 29]) {
    const ideo = IDEOLOGIES[seed % IDEOLOGIES.length].id;
    const s = await play(country, seed, ideo, (b, a) => {
      const ev = b.currentEvent!, t = a.lastTurn!;
      const all = [ev.title, ev.description, ...ev.choices.flatMap(c => [c.text, c.hint]), t.headline, t.narrative, ...t.reactions, ...(t.press ?? []).map(p => p.headline)].join("\n");
      assert.ok(!slot.test(all), `${country}/${seed}, ход ${a.turn}: незаполненный слот\n${all.match(slot)?.[0]}`);
      assert.ok((t.narrative.match(/Аукается/g) ?? []).length <= 2, "не больше двух эхо за ход");
      if (ev.beat) {
        assert.equal(t.reactions.length, 0, "эпизод интриги — дело закрытое: без публичных реплик");
        if (!t.election) assert.equal(t.press?.length ?? 0, 0, "и без газетных откликов");
      }
      // Законопроект застаёт президента в парламенте.
      if (ev.title.startsWith("Законопроект")) assert.ok(PLACES.parliament.some(p => ev.description.includes(p.slice(0, 20))), ev.description.slice(0, 160));
      // По закону высказываются только его стороны — и каждая со своей стороны.
      const choice = ev.choices.find(c => c.text === t.choiceText);
      if (choice?.stance && t.success) for (const r of t.reactions) {
        const who = b.keyFigures.find(f => r.includes(f.name));
        const bloc = who && b.factions.find(f => f.id === who.faction)?.bloc;
        assert.ok(bloc && choice.stance[bloc] !== undefined, `${country}, ход ${a.turn}: о законе говорит посторонний — ${r}`);
      }
    });
    // Антагонист интриги — мужчина: тексты интриг написаны в мужском роде.
    if (s.arc) assert.ok(!isFemaleName(s.arc.target), `${country}/${seed}: антагонист ${s.arc.target}`);
  }
});

test("число по названию группы: «Кремль передаёт», «Западные партнёры ставят»", async () => {
  const { fill } = await import("./classic.ts");
  const by = async (country: string) => createInitialState(country, "debut", "liberal", await classicApi.setup(country, "debut", "liberal", 1));
  assert.equal(fill("{fac:russia} {v:russia:передаёт|передают}", await by("Беларусь")), "Кремль передаёт");
  assert.equal(fill("{fac:west} {v:west:ставит|ставят}", await by("Грузия")), "Западные партнёры ставят");
  assert.equal(fill("{fac:security} {v:security:считает|считают}", await by("Казахстан")), "КНБ и полиция считают");
});
