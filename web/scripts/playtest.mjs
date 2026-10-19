// Плейтест в браузере: одна партия на экране телефона, как её видит игрок.
// Играет демо-сборку (npm run build:demo) или адрес из --url, жмёт первый вариант в каждом деле,
// проходит пресс-конференции, звонки и бюджет. Пишет скриншоты и сводку в --out.
//
//   node scripts/playtest.mjs [--turns=40] [--out=playtest] [--url=https://…]
//
// Установка: npm ci && npm run playtest:install; запуск: npm run playtest -- --turns=24.
// Playwright закреплён в devDependencies. Код выхода 1 — ошибки в консоли, игра застряла
// или первая сессия перегружена (стол на первом ходу, первое решение дольше 15 секунд).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const TURNS = Number(arg("turns", "40"));
const OUT = resolve(arg("out", "playtest"));
const URL_ARG = arg("url", "");
const SHOT_TURNS = [1, 2, 3];
const FIRST_DECISION_LIMIT_MS = 15_000;

mkdirSync(OUT, { recursive: true });
const shot = name => join(OUT, `${name}.png`);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function openGame(page) {
  if (URL_ARG) return page.goto(URL_ARG, { waitUntil: "domcontentloaded" });
  // Проверяем настоящий документ демо: обёртка скрыла бы ошибки doctype и кодировки.
  const demo = readFileSync(resolve("demo/dist/sovereign.html"), "utf8");
  const file = join(OUT, "game.html");
  writeFileSync(file, demo);
  // Доступность игры проверяют её кнопки, а не завершение необязательных загрузок шрифтов.
  return page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });
}

// Какое дело на столе: от этого зависит, как его пройти.
const kindOf = page => page.evaluate(() => {
  const text = document.body.innerText;
  if (document.querySelector("[data-negotiation-call]")) return "negotiation";
  if (text.includes("Роспись бюджета")) return "budget";
  if (text.includes("Как говорить?")) return "call";
  if (text.includes("ВЫЙТИ К ЖУРНАЛИСТАМ")) return "press";
  if (document.querySelector(".sv-inspect")) return "inspect";
  return "card";
});
const titleOf = page => page.evaluate(() =>
  [...document.querySelectorAll("h2")].filter(heading => heading.getClientRects().length > 0)
    .map(heading => heading.innerText).find(text => text && !/Сообщения и люди|Корреспонденция/.test(text)) ?? "");
const deskVisible = page => page.evaluate(() =>
  [...document.querySelectorAll("button")].some(b => /^Сообщения/.test(b.innerText.trim()) || /^Правительство/.test(b.innerText.trim())));

async function decide(page, kind) {
  const opt = n => page.locator(`#opt-${n}`);
  if (kind === "budget") return opt(1).dispatchEvent("click");
  // Переговоры по закону: выбрать вариант, затем подтвердить.
  if (kind === "negotiation") {
    await opt(1).tap();
    return page.locator("[data-negotiation-confirm] button", { hasText: "Подтвердить решение" }).tap();
  }
  if (kind === "call") { await opt(1).tap(); await wait(300); return opt(1).tap(); }
  if (kind === "press") {
    await opt(1).tap();
    for (let i = 0; i < 3; i++) { await wait(400); await opt(1 + (i % 3)).tap(); }
    return opt(1).tap();
  }
  if (kind === "inspect" && await page.locator(".sv-docline").count() > 1) await page.locator(".sv-docline").nth(1).tap();
  await opt(1).scrollIntoViewIfNeeded();
  await opt(1).tap();
  await wait(200);
  const sign = page.locator(".sv-actionbar button", { hasText: "Подписать" });
  if (await sign.count() && await sign.isVisible()) return sign.tap();
  return opt(1).tap();
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true });
const errors = [];
const layoutProblems = new Set();
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/ERR_CERT|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });

const started = Date.now();
await openGame(page);
const documentMode = await page.evaluate(() => ({ mode: document.compatMode, charset: document.characterSet }));
await wait(900);
await page.screenshot({ path: shot("0-title") });
await page.getByRole("button", { name: /начать игру/i }).first().tap();
await wait(900);
const opening = page.getByRole("button", { name: /Открыть первое дело/i });
if (await opening.isVisible()) {
  await page.screenshot({ path: shot("0-opening"), fullPage: true });
  await opening.tap();
}

const timeline = [];
let firstDecisionMs = null, deskOnTurn1 = false, stuck = false, ended = false;
for (let t = 1; t <= TURNS; t++) {
  try { await page.locator("#opt-1").waitFor({ timeout: 8000 }); } catch { ended = true; break; }
  await wait(300);
  const kind = await kindOf(page);
  timeline.push(`${t} · ${kind} · ${(await titleOf(page)).slice(0, 50)}`);
  if (t === 1) deskOnTurn1 = await deskVisible(page);
  const councilOverlaps = await page.evaluate(() => {
    const topics = document.querySelector('[aria-label="Обсудить вариант"]');
    if (!topics) return false;
    const bounds = topics.getBoundingClientRect();
    return [...topics.querySelectorAll("button")].some(button => {
      const rect = button.getBoundingClientRect();
      return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1
        || rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
    });
  });
  if (councilOverlaps) layoutProblems.add("переключатели совета выходят за границы блока и перекрывают реплики");
  if (SHOT_TURNS.includes(t)) await page.screenshot({ path: shot(`turn-${t}`), fullPage: true });
  await decide(page, kind);
  if (firstDecisionMs === null) firstDecisionMs = Date.now() - started;
  await wait(1200);
  // Ночь выборов и печать газеты — ждём или пропускаем анимацию.
  if (await page.locator(".sv-actionbar button", { hasText: "Сразу к итогам" }).count()) await wait(6500);
  const skip = page.locator(".sv-actionbar button", { hasText: "Показать текст" });
  if (await skip.count()) await skip.tap().catch(() => {});
  const next = page.locator("button", { hasText: /Следующий ход|Подвести/i }).filter({ visible: true }).last();
  try { await next.waitFor({ timeout: 30_000 }); } catch { stuck = true; timeline.push(`${t} · застряли: нет кнопки следующего хода`); break; }
  await wait(400);
  if (SHOT_TURNS.includes(t)) await page.screenshot({ path: shot(`turn-${t}-result`), fullPage: true });
  const last = /Подвести/.test(await next.innerText());
  await next.tap();
  await wait(1000);
  if (last) { ended = true; break; }
}
await wait(2500);
await page.screenshot({ path: shot("end"), fullPage: true });
await browser.close();

const problems = [
  ...(documentMode.mode !== "CSS1Compat" ? ["страница открылась в устаревшем режиме вёрстки"] : []),
  ...(documentMode.charset.toUpperCase() !== "UTF-8" ? ["кодировка страницы отличается от UTF-8"] : []),
  ...errors.map(e => `ошибка в консоли: ${e}`),
  ...layoutProblems,
  ...(stuck ? ["партия застряла"] : []),
  ...(deskOnTurn1 ? ["на первом ходу виден стол — первая сессия перегружена"] : []),
  ...(firstDecisionMs !== null && firstDecisionMs > FIRST_DECISION_LIMIT_MS ? [`первое решение через ${Math.round(firstDecisionMs / 1000)} с`] : []),
];
const summary = { turns: timeline.length, ended, firstDecisionMs, deskOnTurn1, documentMode, problems, timeline };
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(problems.length ? 1 : 0);
