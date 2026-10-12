import test from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES } from "../game/data.ts";
import { createAdvisorArtScene } from "./advisor-art-review.ts";
import { reviewConversation } from "./advisor-conversation-review.ts";

test("разговор открытки: реальные люди и их позиции во всех шести странах", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    const scene = await createAdvisorArtScene(country);
    const before = JSON.stringify(scene);
    const lines = reviewConversation(scene)!;
    assert.deepEqual(lines.map(line => line.speaker.id), ["security", "economist", "security"]);
    assert.deepEqual(lines.map(line => line.reply), [false, true, true]);
    for (const line of lines) {
      assert.ok(scene.takes.includes(line.speaker));
      assert.ok(scene.state.advisors.some(advisor => advisor.name === line.speaker.name));
      assert.ok(scene.state.currentEvent!.choices.some(choice => choice.id === line.speaker.favors));
      assert.ok(!/\{\w+\}|2011|погиб|водитель|\d+%/.test(line.text));
    }
    assert.equal(JSON.stringify(scene), before);
  }
});

test("разговор не приклеивается к другому эпизоду, отсутствующим людям или иной позиции", async () => {
  const original = await createAdvisorArtScene();
  const scene = structuredClone(original);
  scene.state.currentEvent!.beat!.episode = 2;
  assert.equal(reviewConversation(scene), null);
  scene.state.currentEvent!.beat!.episode = 1;
  scene.state.currentEvent!.beat!.arcId = "money";
  assert.equal(reviewConversation(scene), null);
  scene.state.currentEvent = null;
  assert.equal(reviewConversation(scene), null);
  assert.equal(reviewConversation({ ...original, takes: original.takes.slice(0, 1) }), null);
  const later = structuredClone(original);
  later.state.turn = 1;
  assert.equal(reviewConversation(later), null);
  const altered = structuredClone(original);
  altered.takes.find(take => take.id === "security")!.favors = "c";
  assert.equal(reviewConversation(altered), null);
  const missingChoice = structuredClone(original);
  missingChoice.state.currentEvent!.choices = missingChoice.state.currentEvent!.choices.slice(1);
  assert.equal(reviewConversation(missingChoice), null);
});
