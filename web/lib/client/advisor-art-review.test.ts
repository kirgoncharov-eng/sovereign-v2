import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { ADVISOR_REVIEW_ART, createAdvisorArtScene, reviewChoiceBrief } from "./advisor-art-review.ts";
import { COUNTRIES } from "../game/data.ts";
import { choiceEffects } from "../game/engine.ts";

test("арт-сцена: настоящий спор и варианты доступны во всех шести странах", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const scene = await createAdvisorArtScene(country);
    assert.equal(scene.state.country, country);
    assert.equal(scene.takes.length, 2);
    assert.notEqual(scene.takes[0].favors, scene.takes[1].favors);
    for (const take of scene.takes) {
      assert.ok(scene.state.currentEvent!.choices.some(choice => choice.id === take.favors));
      assert.ok(!/\{\w+\}/.test(take.text));
    }
  }
});

test("портреты принадлежат людям фиксированной сцены и укладываются в бюджет", async () => {
  const scene = await createAdvisorArtScene();
  let bytes = 0;
  for (const take of scene.takes) {
    const asset = ADVISOR_REVIEW_ART[take.name];
    assert.ok(asset, take.name);
    bytes += statSync(new URL(`../../public${asset}`, import.meta.url)).size;
  }
  assert.ok(bytes < 1_000_000);
});

test("описание цены не раскрывает цифры и предупреждает о слабой опоре", async () => {
  const scene = await createAdvisorArtScene();
  const choice = scene.state.currentEvent!.choices.find(candidate => (choiceEffects(scene.state, candidate).resources.economy ?? 0) < 0)!;
  const state = { ...scene.state, resources: { ...scene.state.resources, economy: 10 } };
  const brief = reviewChoiceBrief(state, choice);
  assert.ok(brief.costs.length > 0);
  assert.ok(brief.warnings.some(warning => warning.includes("ЭКОНОМИКА")));
  assert.ok(!Object.values(brief).flat().some(value => typeof value === "number"));
});
