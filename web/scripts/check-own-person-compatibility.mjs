// 18 архивных партий с назначениями и 60 партий 1978 без новых назначений против отдельного checkout main.
// node scripts/check-own-person-compatibility.mjs --base=/path/to/main/web
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = process.argv.find((arg) => arg.startsWith("--base="))?.slice(7);
if (!baseline) throw new Error("Укажите --base=<путь к web отдельного checkout main>");
const modules = async (tree) => ({
  c: await import(tree + "/lib/game/classic.ts"),
  e: await import(tree + "/lib/game/engine.ts"),
  s: await import(tree + "/lib/game/staffing.ts"),
});
const cur = await modules(root),
  old = await modules(resolve(baseline));
const { COUNTRIES, DIFFICULTIES } = await import(root + "/lib/game/data.ts");
const alt = "Беларусь · 1978";
const fresh = async (m, country, diff, seed) =>
  m.e.createInitialState(country, diff, "pragmatist", await m.c.classicApi.setup(country, diff, "pragmatist", seed), m.e.seededRandom(seed));
async function step(m, state) {
  state = m.e.startEvent(state, await m.c.classicApi.event(state));
  const ev = state.currentEvent;
  let choice = ev.choices.find((c) => c.path === "exit") ?? ev.choices[0];
  if (ev.budget) choice = m.c.budgetChoice(state, { army: 2, social: 2, economy: 2, apparatus: 2, culture: 2 }, false);
  else if (ev.call && !ev.call.negotiation) choice = m.c.callChoice(state, "numbers", "deal");
  else if (ev.press) choice = m.c.pressChoice(state, [0, -1, 2]);
  if (ev.budget || ev.call || ev.press)
    state = {
      ...state,
      currentEvent: { ...ev, choices: [choice, ev.choices[1]] },
    };
  return m.e.resolveTurn(state, choice.id, await m.c.classicApi.consequence(state, choice.id));
}
let archive = 0,
  historical = 0,
  turns = 0,
  archivePools = 0;
for (const country of Object.keys(COUNTRIES))
  for (const diff of country === alt ? Object.keys(DIFFICULTIES) : ["debut"])
    for (let seed = 1; seed <= (country === alt ? 15 : 3); seed++) {
      let a = await fresh(cur, country, diff, seed),
        b = await fresh(old, country, diff, seed);
      assert.deepEqual(a, b);
      if (country !== alt)
        for (let year = 0; year < 4; year++) {
          assert.deepEqual(cur.s.candidatePool({ ...a, turn: 4 + year * 4 }), old.s.candidatePool({ ...b, turn: 4 + year * 4 }));
          archivePools++;
        }
      while (!a.ended && a.turn < 100) {
        if (country !== alt && a.turn >= 2 && a.turn % 4 === 2) {
          const ca = cur.s.candidatePool(a).find((x) => !cur.s.staffingBlocked(a, x));
          if (ca) {
            a = cur.s.hireAdvisor(a, ca.id);
            b = old.s.hireAdvisor(b, ca.id);
            assert.deepEqual(a, b);
          }
        }
        a = await step(cur, a);
        b = await step(old, b);
        assert.deepEqual(a, b, `${country}/${diff}/${seed}/${a.turn}`);
        turns++;
      }
      assert.equal(a.ended, true);
      assert.deepEqual(await cur.c.classicApi.ending(a), await old.c.classicApi.ending(b));
      country === alt ? historical++ : archive++;
    }
let ownPools = 0;
for (let seed = 1; seed <= 60; seed++) {
  const a = { ...(await fresh(cur, alt, "debut", seed)), turn: 4 },
    b = { ...(await fresh(old, alt, "debut", seed)), turn: 4 };
  const x = cur.s.candidatePool(a),
    y = old.s.candidatePool(b);
  for (let i = 0; i < x.length; i++)
    if (!["relative", "freak"].includes(x[i].channel)) assert.deepEqual(x[i], y[i]);
    else for (const key of ["id", "name", "seat", "loyalty"]) assert.deepEqual(x[i][key], y[i][key], key);
  assert.deepEqual(cur.s.candidatePool({ ...a, daily: "2026-11-03" }), old.s.candidatePool({ ...b, daily: "2026-11-03" }));
  ownPools++;
}
console.log(
  JSON.stringify({
    archive,
    historicalWithoutNewHires: historical,
    turns,
    archivePools,
    ownPools,
    unexplainedDifferences: 0,
  }),
);
