import { test } from "node:test";
import assert from "node:assert/strict";
import { TERM, reignLength, reignShort } from "./data.ts";
import { classicApi } from "./classic.ts";
import { createInitialState, resolveTurn, startEvent } from "./engine.ts";
import { electionKind, firstReign, nextReign, pathOptions } from "./terms.ts";
import type { GameState, PathId, Reign } from "./types.ts";

const reign = (r: Partial<Reign>): Reign => ({ ...firstReign(), ...r });

async function state(country: string, patch: Partial<GameState> = {}): Promise<GameState> {
  const s = createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", 9), () => 0.4);
  return { ...s, ...patch };
}

test("годы у власти: ход — квартал", () => {
  assert.equal(reignLength(0), "меньше квартала");
  assert.equal(reignLength(3), "9 месяцев");
  assert.equal(reignLength(20), "5 лет");
  assert.equal(reignLength(21), "5 лет 3 месяца");
  assert.equal(reignLength(46), "11 лет 6 месяцев");
  assert.equal(reignLength(8), "2 года");
  assert.equal(reignShort(29), "7 л. 3 м.");
  assert.equal(reignShort(9), "2 г. 3 м.");
});

test("выборы по сроку и должности: у премьера — парламентские в конце, у правителя без выборов — никаких", () => {
  assert.equal(electionKind(10, null), "parliament");
  assert.equal(electionKind(30, null), "parliament", "в середине второго срока — снова парламентские");
  assert.equal(electionKind(40, null), "president");
  assert.equal(electionKind(30, null, "premier"), null, "у премьера одни выборы — в конце срока");
  assert.equal(electionKind(40, null, "premier"), "parliament");
  assert.equal(electionKind(30, null, "ruler"), null);
  assert.equal(electionKind(40, { id: "dictatorship", turn: 38 }, "ruler"), null);
  assert.equal(electionKind(40, { id: "run", turn: 38 }, "ruler"), "president", "правитель вернул выборы");
});

test("новый срок: что засчитано конституцией и как держится власть", () => {
  const r = firstReign();
  assert.deepEqual([nextReign(r, "reelected", { id: "run", turn: 18 }).counted, nextReign(r, "reelected", null).office], [2, "president"]);
  assert.equal(nextReign(reign({ counted: 2 }), "zeroed", { id: "zeroing", turn: 38 }).counted, 1, "обнуление сбрасывает счёт");
  const ruler = nextReign(r, "dictator", { id: "dictatorship", turn: 18 });
  assert.deepEqual([ruler.office, ruler.ruled, ruler.how, ruler.term], ["ruler", 1, "dictatorship", 1]);
  assert.equal(nextReign(ruler, "reelected", { id: "run", turn: 38 }).counted, 1, "правитель вернул выборы — счёт сроков заново");
  assert.equal(nextReign(r, "premier", { id: "rokirovka", turn: 18 }).office, "premier");
  assert.deepEqual(nextReign(r, "reelected", { id: "run", turn: 18 }).past, [{ term: 0, path: "run", outcome: "reelected" }]);
});

test("папка о сроках во втором сроке: исчерпанные сроки нужно обнулять, у правителя и премьера — свои пути", async () => {
  const open = (opts: ReturnType<typeof pathOptions>) => opts.filter(o => !o.lock).map(o => o.id);
  const ua = await state("Украина", { turn: 37, reign: reign({ term: 1, counted: 2 }) });
  const opts = pathOptions(ua);
  assert.equal(opts.find(o => o.id === "run")?.lock, "limit", "два срока позади — на выборы нельзя");
  assert.ok(open(opts).includes("zeroing"), "остаётся обнулить");
  const by = await state("Беларусь", { turn: 37, reign: reign({ term: 1, counted: 2 }) });
  assert.ok(open(pathOptions(by)).includes("run"), "без ограничения сроков — хоть пятый раз");
  assert.equal(pathOptions(by).find(o => o.id === "zeroing")?.lock, "na", "обнулять нечего — и в папке об этом не пишут");
  const ruler = await state("Беларусь", { turn: 37, reign: reign({ term: 1, office: "ruler", ruled: 1, how: "postpone" }) });
  const ids: PathId[] = pathOptions(ruler).map(o => o.id);
  assert.deepEqual(ids.sort(), ["exit", "postpone", "run", "successor"].sort());
  assert.ok(pathOptions(ruler).find(o => o.id === "postpone")?.keep);
  const premier = await state("Армения", { turn: 37, reign: reign({ term: 1, office: "premier" }) });
  assert.ok(!pathOptions(premier).some(o => o.id === "zeroing" || o.id === "rokirovka"));
});

test("бессрочная партия: после переизбрания — второй срок с новой интригой, текст без пустых слотов, вердикт в годах", async () => {
  const slot = /\{\w+(:\w+)*(\|[^}]*)?\}/;
  let s = await state("Беларусь");
  let sawTerm = false, i = 0;
  const arcs = new Set<string>();
  while (!s.ended && s.turn < 140) {
    // Здоровая страна: проверяем текст и переходы, а не выживание.
    s = { ...s, resources: { politicalCapital: 60, economy: 60, military: 60, externalReputation: 60, internalLegitimacy: 60, personalResource: 60 },
      factions: s.factions.map(f => ({ ...f, relation: 40 })), activeCrises: [] };
    if (s.arc) arcs.add(s.arc.id);
    const ev = await classicApi.event(s);
    const b = startEvent(s, ev);
    const stay = ev.choices.find(c => c.path === "run" || c.path === "zeroing");
    const c = ev.special?.kind === "terms" && stay ? stay : ev.choices[i++ % ev.choices.length];
    s = resolveTurn(b, c.id, await classicApi.consequence(b, c.id));
    const t = s.lastTurn!;
    assert.ok(!slot.test([ev.title, ev.description, t.headline, t.narrative, ...t.reactions].join("\n")), `ход ${s.turn}: пустой слот`);
    if (t.term) {
      sawTerm = true;
      assert.equal(s.turn % TERM, 0, "срок кончается на двадцатом ходу");
      assert.equal(s.path, null);
    }
  }
  assert.ok(sawTerm, "был хотя бы один новый срок");
  assert.ok(arcs.size >= 2, "в разных сроках — разные интриги");
  assert.ok(s.ended, "правление когда-нибудь кончается");
  const v = await classicApi.ending(s);
  assert.match(v.verdict, new RegExp(`правил страной ${reignLength(s.turn)}`));
});
