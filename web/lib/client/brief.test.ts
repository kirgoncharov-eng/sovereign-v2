import { test } from "node:test";
import assert from "node:assert/strict";
import { CASE_LEAD, NEWS_LEAD, TAIL_LEAST, TOP_CHANGES, ledgerRows, splitLead, wordCount } from "./brief.ts";
import { classicApi } from "../game/classic.ts";
import { COUNTRIES } from "../game/data.ts";
import { createInitialState, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";

const words = (count: number, word = "слово") => Array.from({ length: count }, () => word).join(" ");

test("слова считаются по-русски: дефисы и числа — одно слово, знаки препинания — нет", () => {
  assert.equal(wordCount("7 января 2025, вторник. Кто-то звонит — снова!"), 7);
  assert.equal(wordCount(""), 0);
});

test("завязка дела: абзацы целиком, пока помещаются в лимит", () => {
  const text = [words(14), words(39), words(27), words(24), words(25)].join("\n\n");
  const { lead, rest } = splitLead(text, CASE_LEAD);
  assert.equal(lead.length, 3, "14 + 39 + 27 = 80 слов — в завязке, следующий абзац уже не помещается");
  assert.equal(rest.length, 2);
  assert.equal([...lead, ...rest].join("\n\n"), text, "ни один абзац не потерян и не разрезан");
});

test("короткая шапка не оставляет завязку пустой: второй абзац берётся, даже если он длинный", () => {
  const { lead, rest } = splitLead([words(13), words(80), words(30)].join("\n\n"), CASE_LEAD);
  assert.equal(lead.length, 2);
  assert.equal(rest.length, 1);
});

test("короткий хвост не прячется за «Подробнее»", () => {
  const { lead, rest } = splitLead([words(50), words(30), words(12)].join("\n\n"), CASE_LEAD);
  assert.equal(lead.length, 3);
  assert.equal(rest.length, 0);
});

test("газета: первый абзац, остальное — по «Читать полностью»", () => {
  const { lead, rest } = splitLead([words(22), words(25), words(22)].join("\n\n"), NEWS_LEAD);
  assert.equal(lead.length, 1);
  assert.equal(rest.length, 2);
});

test("ведомость: свёрнутой — три самые заметные перемены, развёрнутой — всё", () => {
  const rows = [
    { k: "economy", delta: -5 }, { k: "military", delta: 1 }, { k: "internalLegitimacy", delta: -4 }, { k: "personalResource", delta: -4 },
    { k: "business", delta: 8, rel: true }, { k: "west", delta: -6, rel: true },
  ];
  const short = ledgerRows(rows, false);
  assert.deepEqual(short.shown.map(row => row.k), ["economy", "business", "west"], "ресурсы идут первыми, группы — за ними");
  assert.equal(short.hidden, rows.length - TOP_CHANGES);
  const full = ledgerRows(rows, true);
  assert.equal(full.shown.length, rows.length);
  assert.equal(full.hidden, 0);
  const equal = [{ k: "west", delta: 4, rel: true }, { k: "economy", delta: -4 }, { k: "military", delta: 4 }, { k: "church", delta: 4, rel: true }];
  const tie = ledgerRows(equal, false);
  assert.deepEqual(tie.shown.map(row => row.k), ["economy", "military", "west"], "при равном сдвиге ресурс важнее группы");
});

// Критерий #97: завязка дела не длиннее ~90 слов во всех странах, а газета до «Читать полностью» — ~45.
test("на настоящих партиях завязка дела и газеты короткая, а текст не теряется", async () => {
  for (const country of Object.keys(COUNTRIES)) {
    let state = createInitialState(country, "debut", "pragmatist", await classicApi.setup(country, "debut", "pragmatist", 11), seededRandom(11));
    for (let turn = 0; turn < 12 && !state.ended; turn++) {
      state = startEvent(state, await classicApi.event(state));
      const event = state.currentEvent!;
      const caseLead = splitLead(event.description, CASE_LEAD);
      const caseWords = wordCount(caseLead.lead.join(" "));
      // Лимит превышается, только если без последнего абзаца завязка была бы совсем короткой
      // или если прятать пришлось бы одну короткую фразу.
      const withoutLast = wordCount(caseLead.lead.slice(0, -1).join(" "));
      const shortTail = !caseLead.rest.length && caseWords < CASE_LEAD.limit + TAIL_LEAST;
      const where = `${country}, ход ${turn + 1}`;
      assert.ok(caseWords <= CASE_LEAD.limit || withoutLast < CASE_LEAD.least || shortTail, `${where}: завязка «${event.title}» — ${caseWords} слов`);
      const paragraphs = event.description.split(/\n\n+/).map(part => part.trim()).filter(Boolean);
      assert.deepEqual([...caseLead.lead, ...caseLead.rest], paragraphs, `${where}: ни один абзац дела не потерян`);
      const id = event.choices[0].id;
      state = resolveTurn(state, id, await classicApi.consequence(state, id));
      const news = splitLead(state.lastTurn!.narrative, NEWS_LEAD);
      assert.ok(news.lead.length >= 1, `${where}: у газеты есть первый абзац`);
      const newsWords = wordCount(news.lead.join(" "));
      if (news.rest.length) assert.ok(newsWords <= 90, `${where}: газета до «Читать полностью» — ${newsWords} слов`);
    }
  }
});
