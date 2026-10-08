import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOf, readStats, record, renderStats } from "./analytics.ts";

const DAY = 864e5, t0 = Date.parse("2026-10-01T10:00:00Z");

test("аналитика: счётчики по дням, воронка, когорта возвращаемости, безопасная страница", async () => {
  // Без ключей Upstash хранилище живёт в памяти процесса.
  await record("player0001", [{ e: "open", p: { src: "tg" } }, { e: "start", p: { country: "Беларусь", diff: "coalition" } }, { e: "turn", p: { n: 1 } }], t0);
  await record("player0002", [{ e: "open", p: { src: "web" } }, { e: "start", p: { country: "<script>", diff: "crisis" } }], t0);
  await record("player0001", [{ e: "turn", p: { n: 2 } }, { e: "bogus" }], t0 + 60_000); // тот же день — не новый визит
  await record("player0001", [{ e: "open", p: { src: "tg" } }], t0 + DAY);              // вернулся на 1-й день
  const s = await readStats(2, t0 + DAY);
  const [d0, d1] = s.days;
  assert.equal(d0.date, dayOf(t0));
  assert.equal(d0.h.players, 2);
  assert.equal(d0.h.new, 2);
  assert.equal(d0.h.start, 2);
  assert.equal(d0.h["start|country=Беларусь"], 1);
  assert.equal(d0.h["turn|n=1"], 1);
  assert.equal(d0.h.bogus, undefined, "неизвестные события не пишутся");
  assert.equal(d1.h.players, 1);
  assert.equal(d1.h.new ?? 0, 0);
  assert.equal(s.cohorts.at(0)!.h.d0, 2);
  assert.equal(s.cohorts.at(0)!.h.d1, 1);
  const html = renderStats(s);
  assert.ok(html.includes("50%"), "возврат на 1-й день — половина когорты");
  assert.ok(!html.includes("<script>"), "значения от клиента экранируются или вычищаются");
});

test("сводка автору: вчерашний день, неделя, где бросают и оценки", async () => {
  const { digestText } = await import("./analytics.ts");
  const day = (date: string, h: Record<string, number>) => ({ date, h });
  const s = {
    days: [
      day("2026-10-01", { players: 10, new: 6, start: 20, end: 8, "turn|n=1": 20, "turn|n=3": 18, "turn|n=5": 9, "turn|n=10": 8, "turn|n=15": 7, "turn|n=20": 6, "end|type=collapse": 5, "end|kept=1": 6, "end|kept=2": 2, feedback: 3, rating_sum: 11, rating_n: 3 }),
      day("2026-10-02", { players: 12, new: 7, start: 9, end: 4 }),
      day("2026-10-03", { players: 1 }),
    ],
    cohorts: [day("2026-10-01", { d0: 6, d1: 2 }), day("2026-10-02", { d0: 7 }), day("2026-10-03", {})],
  };
  const t = digestText(s, "https://x.test/api/stats?key=k");
  assert.match(t, /сводка за 02\.10/);
  assert.match(t, /Устройств: 12 \(новых 7\)/);
  assert.ok(!t.includes("Где бросают"));
  assert.match(t, /не конверсия и не подтверждённые отправки/);
  assert.match(t, /средняя оценка 3\.7/);
  assert.match(t, /Обещаний исполняют в среднем: 1\.3/);
  assert.match(t, /href="https:\/\/x\.test/);
});

test("разрезы: подписи интервалов времени доходят до счётчиков без искажений", async () => {
  const { record, readStats } = await import("./analytics.ts");
  const now = Date.parse("2026-11-05T10:00:00Z");
  for (const sec of ["до 30 с", "30-60 с", "1-2 мин", "2-5 мин", "больше 5 мин"]) await record("tester0001", [{ e: "first", p: { sec } }], now);
  const h = (await readStats(1, now)).days[0].h;
  for (const sec of ["до 30 с", "30-60 с", "1-2 мин", "2-5 мин", "больше 5 мин"]) assert.equal(h[`first|sec=${sec}`], 1, sec);
});


test("аналитика: мусор не создаёт визит, версия и канал сохраняются, повторные возвраты не раздувают D1/D7",async()=>{
 const time=Date.parse('2026-12-01T23:58:00Z');
 await record('garbageonly',[{e:'garbage'}],time);
 assert.equal((await readStats(1,time)).days[0].h.players,undefined);
 await record('version001',[{e:'open',p:{v:'6.1',src:'tg'}},{e:'start',p:{v:'6.1',src:'tg'}}],time);
 await record('version001',[{e:'resume',p:{v:'6.1',src:'tg'}}],time+120_000);
 await record('version001',[{e:'open',p:{v:'6.1',src:'tg'}}],time+180_000);
 const first=(await readStats(2,time+180_000)).cohorts[0];assert.equal(first.h.d0,1);assert.equal(first.h.d1,1);
 await record('version001',[{e:'open',p:{v:'6.1',src:'tg'}}],time+7*DAY);
 await record('version001',[{e:'open',p:{v:'6.1',src:'tg'}}],time+7*DAY+60_000);
 const stats=await readStats(8,time+7*DAY+60_000);assert.equal(stats.cohorts[0].h.d7,1);
 assert.equal(stats.days[0].h['open|v=6.1'],1);assert.equal(stats.days[0].h['start|src=tg'],1);
 const html=renderStats(stats);assert.ok(html.includes('не доля конкретных партий'));assert.ok(!html.includes('финалов, после которых поделились'));assert.ok(html.includes('Версии приложения'));
});
