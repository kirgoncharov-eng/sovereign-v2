import test from "node:test";
import assert from "node:assert/strict";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import { createAdvisorArtScene } from "./advisor-art-review.ts";
import { reviewConversation } from "./advisor-conversation-review.ts";

test("разговор о гарантиях: реальные люди, позиции и цена решения", async () => {
  const scene = await createAdvisorArtScene(ALTERNATE_COUNTRY);
  const before = JSON.stringify(scene);
  const lines = reviewConversation(scene)!;

  assert.ok(scene.state.currentEvent?.choices.some(choice => choice.law?.id === "alt_export_guarantee"));
  assert.deepEqual(lines.map(line => line.speaker.id), ["security", "economist", "security"]);
  assert.deepEqual(lines.map(line => line.reply), [false, true, true]);
  assert.match(lines.map(line => line.text).join(" "), /казн|банк|завод/);
  for (const line of lines) {
    assert.ok(scene.takes.includes(line.speaker));
    assert.ok(scene.state.advisors.some(advisor => advisor.name === line.speaker.name));
    assert.ok(scene.state.currentEvent!.choices.some(choice => choice.id === line.speaker.favors));
    assert.ok(!/интернет|смартфон|лайк|процент/.test(line.text));
  }
  assert.equal(JSON.stringify(scene), before);
});

test(
  "разговор не приклеивается к другой стране, закону, отсутствующим людям"
    + " или иной позиции",
  async () => {
    const original = await createAdvisorArtScene(ALTERNATE_COUNTRY);
    const legacy = await createAdvisorArtScene("Украина");
    assert.equal(reviewConversation(legacy), null);

    const scene = structuredClone(original);
    scene.state.currentEvent!.choices.find(choice => choice.law)!.law!.id = "other_law";
    assert.equal(reviewConversation(scene), null);
    scene.state.currentEvent = null;
    assert.equal(reviewConversation(scene), null);
    assert.equal(reviewConversation({ ...original, takes: original.takes.slice(0, 1) }), null);

    const altered = structuredClone(original);
    altered.takes.find(take => take.id === "security")!.favors = "c";
    assert.equal(reviewConversation(altered), null);

    const missingChoice = structuredClone(original);
    missingChoice.state.currentEvent!.choices = missingChoice.state.currentEvent!.choices.slice(1);
    assert.equal(reviewConversation(missingChoice), null);
  },
);
