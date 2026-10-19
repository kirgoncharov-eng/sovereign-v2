import { test } from "node:test";
import assert from "node:assert/strict";
import { STORIES } from "./stories.ts";
import { STORY_REPLIES } from "./story-replies.ts";

// Ответы на письма (#156): две короткие резолюции, продолжения — только для шагов после письма с ответом.
test("ответы на письма: у каждой истории — письмо с двумя резолюциями и продолжения в пределах истории", () => {
  for (const [id, design] of Object.entries(STORY_REPLIES)) {
    const story = STORIES.find(item => item.id === id);
    assert.ok(story, `${id}: нет такой истории`);
    assert.ok(design.step < story.steps.length - 1, `${id}: после письма с ответом должна идти развязка`);
    assert.equal(design.options.length, 2);
    assert.notEqual(design.options[0].id, design.options[1].id);
    for (const option of design.options) {
      assert.ok(Object.values(option.cost).every(value => Math.abs(value ?? 0) <= 3), `${id}/${option.id}: цена ответа небольшая`);
      assert.ok(option.text.length <= 60, `${id}/${option.id}: резолюция короткая — «${option.text}»`);
      for (const step of Object.keys(option.steps ?? {}).map(Number)) {
        assert.ok(step > design.step && step < story.steps.length, `${id}/${option.id}: шаг ${step} вне истории`);
      }
    }
  }
});
