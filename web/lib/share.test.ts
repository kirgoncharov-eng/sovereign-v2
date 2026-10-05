import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShare, shareCaption, shareQuery, type ShareResult } from "./share.ts";

test("ссылка на итог: параметры переживают дорогу туда и обратно, мусор отсекается", () => {
  const r: ShareResult = { name: "Тенгиз Абашидзе", country: "Грузия", end: "reelected", title: "Человек второго срока",
    turns: 20, from: 2025, to: 2029, rating: 63, score: 1540, kept: 2, promised: 3, daily: "2026-10-05", arc: "Заговор генералов", solved: true };
  assert.deepEqual(parseShare(new URLSearchParams(shareQuery(r))), r);
  const evil = parseShare(new URLSearchParams("n=<script>x&c=Грузия&e=hacked&t=999&r=-5&k=9-9&d=zzz"))!;
  assert.equal(evil.name.includes("<"), false);
  assert.equal(evil.end, "collapse");
  assert.deepEqual([evil.turns, evil.rating, evil.kept, evil.promised, evil.daily], [400, 0, 3, 3, undefined]);
  assert.equal(parseShare(new URLSearchParams("c=Грузия")), null, "без имени карточки нет");
  const cap = shareCaption({ ...r, end: "collapse", turns: 7, daily: undefined });
  assert.match(cap.description, /у власти 1 год 9 месяцев/);
  assert.match(cap.challenge, /правил 1 год 9 месяцев\. А твой\?/);
  assert.match(shareCaption({ ...r, turns: 46, daily: undefined }).challenge, /правил 11 лет 6 месяцев/);
});
