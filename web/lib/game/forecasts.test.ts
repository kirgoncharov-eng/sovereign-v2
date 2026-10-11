import { test } from "node:test";
import assert from "node:assert/strict";
import { classicApi } from "./classic.ts";
import { COUNTRIES } from "./data.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "./engine.ts";
import { ADVISOR_STAKE, debate, debateApplies, forecastReview, pairFor, type AdvisorTake } from "./forecasts.ts";
import { DISLOYAL_BELOW, campOf, isDisloyal, mannerOf } from "./advisors.ts";
import { choiceEffects } from "./engine.ts";
import type { GameState } from "./types.ts";

const SLOT = /\{[^}]*\}/;

async function fresh(country: string, seed: number) {
  return createInitialState(country, "coalition", "pragmatist", await classicApi.setup(country, "coalition", "pragmatist", seed), seededRandom(seed));
}

// Партия первым вариантом с особыми делами по второму; на каждом деле — что сказали советники.
async function debates(country: string, seed: number, turns = 30): Promise<{ state: GameState; takes: AdvisorTake[] }[]> {
  let s = await fresh(country, seed);
  const out: { state: GameState; takes: AdvisorTake[] }[] = [];
  while (!s.ended && s.turn < turns) {
    s = startEvent(s, await classicApi.event(s));
    const takes = debate(s);
    if (takes) out.push({ state: s, takes });
    const ev = s.currentEvent!;
    const choice = ev.press || ev.call || ev.budget ? ev.choices[1] : ev.choices.find(c => !c.path) ?? ev.choices[0];
    s = resolveTurn(s, choice.id, await classicApi.consequence(s, choice.id));
  }
  return out;
}

test("спор советников детерминирован для зерна партии", async () => {
  for (const country of ["Казахстан", "Грузия"]) {
    const first = await debates(country, 31, 20);
    const second = await debates(country, 31, 20);
    assert.ok(first.length >= 5, `${country}: споров ${first.length}`);
    assert.deepEqual(first.map(d => d.takes), second.map(d => d.takes));
  }
});

test("лояльный советник честен в своей области и ошибается только в сторону своего варианта", async () => {
  let spun = 0, claims = 0;
  for (const country of Object.keys(COUNTRIES)) for (const seed of [7, 52]) {
    for (const { state, takes } of await debates(country, seed)) {
      assert.equal(takes.length, 2);
      for (const take of takes) {
        const interest = ADVISOR_STAKE[take.id].interest;
        const loyal = !isDisloyal(state.advisors.find(a => a.id === take.id)!);
        for (const claim of take.claims) {
          claims++;
          if (claim.said !== claim.truth) spun++;
          if (claim.domain) {
            assert.equal(claim.resource, interest);
            if (loyal) assert.equal(claim.said, claim.truth, `${take.name} лжёт о своей области`);
          }
          // За свой вариант — не хуже правды, о чужом — не лучше: ошибка всегда в пользу своего интереса.
          if (claim.choiceId === take.favors) assert.ok(claim.said >= claim.truth, `${take.name} очерняет свой вариант`);
          else assert.ok(claim.said <= claim.truth, `${take.name} хвалит чужой вариант`);
        }
      }
    }
  }
  assert.ok(spun > 0 && spun < claims, `лукавых утверждений ${spun} из ${claims}`);
});

test("кто спорит, зависит от дела: в каждой стране встречаются все три пары", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const pairs = new Set<string>();
    for (const seed of [11, 40]) for (const { state, takes } of await debates(country, seed, 20)) {
      assert.deepEqual(takes.map(t => t.id), pairFor(state, state.currentEvent!));
      pairs.add(takes.map(t => t.id).join("+"));
    }
    assert.ok(pairs.size >= 3, `${country}: пары ${[...pairs].join(", ")}`);
  }
});

test("нелояльный советник служит своему лагерю: выбирает его вариант и лжёт даже в своей области", async () => {
  let checked = 0, lies = 0;
  for (const country of Object.keys(COUNTRIES)) {
    for (const { state } of await debates(country, 19, 16)) {
      const ids = pairFor(state, state.currentEvent!);
      const traitor = state.advisors.find(a => a.id === ids[0])!;
      const camp = campOf(state, traitor);
      if (!camp) continue;
      const turned = { ...state, advisors: state.advisors.map(a => (a.id === traitor.id ? { ...a, loyalty: DISLOYAL_BELOW - 10 } : a)) };
      const take = debate(turned)!.find(t => t.id === traitor.id)!;
      const relation = (id: string) => choiceEffects(turned, turned.currentEvent!.choices.find(c => c.id === id)!).factionRel[camp.id] ?? 0;
      const best = Math.max(...turned.currentEvent!.choices.map(c => relation(c.id)));
      assert.equal(relation(take.favors), best, `${country}: ${traitor.name} выбрал не вариант лагеря «${camp.name}»`);
      for (const claim of take.claims) {
        if (claim.said !== claim.truth) lies++;
        if (claim.choiceId === take.favors) assert.ok(claim.said >= claim.truth);
        else assert.ok(claim.said <= claim.truth);
      }
      checked++;
    }
  }
  assert.ok(checked >= 20 && lies > checked / 2, `проверено ${checked}, ложных утверждений ${lies}`);
});

test("манера советника постоянна для имени и встречаются все три", async () => {
  const manners = new Set<string>();
  for (const country of Object.keys(COUNTRIES)) for (const advisor of (await fresh(country, 3)).advisors) {
    assert.equal(mannerOf(advisor), mannerOf({ ...advisor }));
    manners.add(mannerOf(advisor));
  }
  assert.deepEqual([...manners].sort(), ["alarm", "dry", "smooth"]);
});

test("реплики без пустых слотов, и советники спорят чаще, чем соглашаются", async () => {
  let agree = 0, total = 0;
  for (const country of Object.keys(COUNTRIES)) {
    for (const { takes } of await debates(country, 11)) {
      total++;
      if (takes[0].favors === takes[1].favors) agree++;
      for (const take of takes) {
        assert.ok(!SLOT.test(take.text), take.text);
        assert.match(take.text, /^[А-Я]/);
      }
    }
  }
  assert.ok(agree * 2 < total, `согласны ${agree} из ${total}`);
});

test("звонки, бюджет и пресс-конференции идут без спора", async () => {
  for (const { state } of await debates("Украина", 3, 24)) {
    const ev = state.currentEvent!;
    assert.ok(!ev.call && !ev.budget && !ev.press && !ev.special);
    assert.ok(debateApplies(ev));
  }
});

test("газета сверяет прогнозы о выбранном варианте с тем, что вышло", async () => {
  const [{ state, takes }] = await debates("Казахстан", 21, 6);
  const chosen = takes[0].favors;
  const lines = forecastReview(state, chosen, false);
  const about = takes.flatMap(t => t.claims.filter(c => c.choiceId === chosen));
  assert.equal(lines.length, about.length);
  for (const line of lines) assert.match(line, /^.+: «.+»\. Решение: .+ — (верно|мимо)\.$/);
  const after = resolveTurn(state, chosen, await classicApi.consequence(state, chosen));
  assert.deepEqual(after.lastTurn!.forecasts ?? [], lines);
});
