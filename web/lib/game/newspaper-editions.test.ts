import test from "node:test";
import assert from "node:assert/strict";
import { NEWSPAPER_EDITIONS } from "../content/newspaper-editions.ts";
import { isOrdinaryNewspaperEvent, newspaperHeadline, newspaperName } from "./newspaper-editions.ts";

test("у каждой кампании три вымышленных издания, соседние выпуски не повторяются", () => {
  assert.equal(Object.keys(NEWSPAPER_EDITIONS).length, 7);
  for (const [country, editions] of Object.entries(NEWSPAPER_EDITIONS)) {
    assert.equal(new Set(editions).size, 3, country);
    const names = Array.from({ length: 12 }, (_, index) => newspaperName(country, 41, index + 1));
    assert.ok(names.every((name, index) => index === 0 || name !== names[index - 1]), country);
    assert.deepEqual(names, Array.from({ length: 12 }, (_, index) => newspaperName(country, 41, index + 1)));
  }
});

test("название издания переживает JSON, неизвестной стране достаётся запасное", () => {
  const before = { country: "Беларусь · 1978", seed: 77, turn: 9 };
  const restored = JSON.parse(JSON.stringify(before)) as typeof before;
  assert.equal(
    newspaperName(before.country, before.seed, before.turn),
    newspaperName(restored.country, restored.seed, restored.turn),
  );
  assert.equal(newspaperName("Неизвестная", 1, 1), "Вечерняя газета");
});

test("обычный заголовок меняется детерминированно и не путает успех с провалом", () => {
  const common = { base: "Заводы получили кредит", event: "Экспортные гарантии", choice: "Провести закон" };
  const success = Array.from({ length: 24 }, (_, turn) => newspaperHeadline({
    ...common, success: true, ordinary: true, seed: 19, turn,
  }));
  const failure = Array.from({ length: 24 }, (_, turn) => newspaperHeadline({
    ...common, base: "Банки придержали ссуды", success: false, ordinary: true, seed: 19, turn,
  }));

  assert.ok(new Set(success).size >= 2);
  assert.ok(new Set(failure).size >= 2);
  assert.ok(success.every(headline => !/сорвано|не исполнено/.test(headline)));
  assert.ok(failure.every(headline => !/решение исполнено|^Исполнено/.test(headline)));
  assert.equal(success[7], newspaperHeadline({ ...common, success: true, ordinary: true, seed: 19, turn: 7 }));
});

test("особое событие сохраняет точный авторский заголовок", () => {
  const headline = newspaperHeadline({
    base: "Президент: «Я отвечу прямо»",
    event: "Пресс-конференция",
    choice: "Ответить",
    success: true,
    ordinary: false,
    seed: 5,
    turn: 8,
  });
  assert.equal(headline, "Президент: «Я отвечу прямо»");
});

test("обычные карточки отделены от законов, людей, интриг и мини-механик", () => {
  assert.equal(isOrdinaryNewspaperEvent("alt_wages"), true);
  assert.equal(isOrdinaryNewspaperEvent("factory_strike"), true);
  for (const cardId of ["law:2:amnesty", "sp:5:pact:church", "terms:18", "prs:9:q1,q2", "arc:1"]) {
    assert.equal(isOrdinaryNewspaperEvent(cardId), false, cardId);
  }
});
