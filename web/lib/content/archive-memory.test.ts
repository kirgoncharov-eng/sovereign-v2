import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_FOUND, ARCHIVE_MEMORY } from "./archive-memory.ts";

// #178: каждый текст называет тот же документ и ставит тот же выбор, что и варианты дела.
test("память архива: у каждого исхода свой текст о приложении 1956 года и о долгах трёх заводов", () => {
  const texts = [...Object.values(ARCHIVE_MEMORY).flatMap(ending => [ending.ok, ending.failed]), ARCHIVE_FOUND];
  assert.equal(new Set(texts).size, texts.length, "тексты исходов не повторяются");
  for (const text of texts) {
    assert.match(text, /1956 года/, text);
    assert.match(text, /трёх заводов/, text);
    assert.match(text, /владельц/, text);
    assert.doesNotMatch(text, /\{|undefined|Депутат нашёл/, text);
  }
});
