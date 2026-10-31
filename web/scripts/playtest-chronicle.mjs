// Плейтест «Хроники срока» (#302) в браузере на экране телефона: новая партия 1978 года с титула идёт в хронике.
// Играет демо-сборку (npm run build:demo) или адрес из --url: анкета ЦИК, пролог вступления, дела первыми вариантами,
// бюджет, пресс-конференции, звонки и разговоры; обращения откладывает. Пишет кадры ходов 1–3 и сводку в --out.
//
//   node scripts/playtest-chronicle.mjs [--decisions=24] [--out=playtest/chronicle] [--url=https://…]
//
// Код выхода 1 — ошибки в консоли, хроника не открылась или застряла, заголовок дела под шапкой,
// страница шире экрана или первое решение дольше 90 секунд (#298).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const DECISIONS = Number(arg("decisions", "24"));
const OUT = resolve(arg("out", "playtest/chronicle"));
const URL_ARG = arg("url", "");
const SHOT_DECISIONS = [1, 2, 3];
const FIRST_DECISION_LIMIT_MS = 90_000;

mkdirSync(OUT, { recursive: true });
const shot = name => join(OUT, `${name}.png`);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function openGame(page) {
  if (URL_ARG) return page.goto(URL_ARG, { waitUntil: "domcontentloaded" });
  const demo = readFileSync(resolve("demo/dist/sovereign.html"), "utf8");
  const file = join(OUT, "game.html");
  writeFileSync(file, demo);
  return page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
// Пролог вступления показываем и в безголовом браузере: он часть пути игрока.
await page.addInitScript(() => { window.__FORCE_CUTSCENE__ = true; });
await openGame(page);
await wait(900);

const startedAt = Date.now();
await page.getByRole("button", { name: /начать игру/i }).first().tap();
const chronicle = page.locator("text=Хроника срока").first();
let opened = true;
try { await chronicle.waitFor({ timeout: 10_000 }); } catch { opened = false; }
// До анкеты пролога нет: вступление в должность — после выборов.
const prologueBeforeForm = await page.getByRole("dialog").count() > 0;
await wait(800);
await page.screenshot({ path: shot("0-form") });

const timeline = [];
const problems = [];
let prologueAfterElection = false, firstDecisionMs = null, stuck = false, memoir = false;
const geometry = { checks: 0, underHeader: 0, wide: 0 };

async function measure() {
  await wait(1100);
  const g = await page.evaluate(() => {
    const section = document.querySelector("section[aria-label]:not([hidden])");
    const header = document.querySelector("header");
    return { top: section ? section.getBoundingClientRect().top : 9999, bottom: header?.getBoundingClientRect().bottom ?? 0,
      wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  geometry.checks++;
  if (g.top < g.bottom - 1) geometry.underHeader++;
  if (g.wide) geometry.wide++;
}

if (opened) {
  await page.getByRole("button", { name: "Сразу" }).tap();
  for (const name of ["Дальше", "Дальше", "Дальше", "Подать документы в ЦИК"]) await page.getByRole("button", { name }).tap();
  const prologue = page.getByRole("dialog");
  try {
    await prologue.waitFor({ timeout: 5000 });
    prologueAfterElection = true;
    await wait(1200); // пролог появляется плавно: кадр — после появления текста
    await page.screenshot({ path: shot("0-inauguration") });
    await page.keyboard.press("Enter");
    await prologue.waitFor({ state: "hidden", timeout: 3000 });
  } catch { /* пролога нет — отмечено в сводке */ }

  let decisions = 0;
  for (let step = 0; step < DECISIONS * 4 && decisions < DECISIONS; step++) {
    const desk = page.locator('section[aria-label="Дело на столе"]:not([hidden])');
    const letter = page.locator('section[aria-label="Ждёт ответа"]');
    const end = page.locator("text=Мемуары");
    try {
      await Promise.any([desk.waitFor({ timeout: 20_000 }), letter.waitFor({ timeout: 20_000 }), end.waitFor({ timeout: 20_000 })]);
    } catch { stuck = true; break; }
    if (await end.count()) { memoir = true; break; }
    await measure();
    if (await letter.count()) {
      timeline.push(`остановка · ${(await letter.locator(":scope > div").first().innerText()).slice(0, 60)}`);
      const later = letter.locator(":scope > div:last-child button").last();
      await later.scrollIntoViewIfNeeded();
      await later.tap();
      continue;
    }
    const text = await desk.innerText();
    const title = (await desk.locator("h2").first().innerText()).slice(0, 50);
    decisions++;
    if (SHOT_DECISIONS.includes(decisions)) await page.screenshot({ path: shot(`decision-${decisions}`), fullPage: true });
    if (/УТВЕРДИТЬ БЮДЖЕТ/.test(text)) {
      timeline.push(`${decisions} · бюджет · ${title}`);
      await desk.getByRole("button", { name: /УТВЕРДИТЬ БЮДЖЕТ/ }).tap();
    } else if (/ВЫЙТИ К ЖУРНАЛИСТАМ/.test(text)) {
      timeline.push(`${decisions} · пресс-конференция · ${title}`);
      await desk.getByRole("button", { name: /ВЫЙТИ К ЖУРНАЛИСТАМ/ }).tap();
      for (let q = 0; q < 6; q++) {
        await wait(300);
        const answer = desk.locator(".sv-paper button").filter({ hasText: /«/ });
        if (!(await answer.count())) break;
        await answer.first().tap();
      }
      await desk.getByRole("button", { name: /ЗАКОНЧИТЬ/ }).tap();
    } else if (await desk.locator("[data-negotiation-choice]").count()) {
      timeline.push(`${decisions} · разговор · ${title}`);
      await desk.locator("[data-negotiation-choice]").first().tap();
      await desk.getByRole("button", { name: "Подтвердить решение" }).tap();
    } else if (await desk.locator("button").filter({ hasText: /^\s*\d\./ }).count()) {
      // Звонок раньше обычного дела: у его кнопок тоже id="opt-…".
      timeline.push(`${decisions} · звонок · ${title}`);
      for (let k = 0; k < 3; k++) {
        const option = desk.locator("button").filter({ hasText: /^\s*\d\./ });
        if (!(await option.count())) break;
        await option.first().tap();
        await wait(600);
      }
    } else if (await desk.locator('[id^="opt-"]').count()) {
      timeline.push(`${decisions} · дело · ${title}`);
      await desk.locator('[id^="opt-"]').first().tap();
      await desk.getByRole("button", { name: /^Подписать/ }).tap();
    } else { stuck = true; timeline.push(`${decisions} · непонятное дело · ${title}`); break; }
    if (decisions === 1) firstDecisionMs = Date.now() - startedAt;
  }
}
await wait(1500);
await page.screenshot({ path: shot("end"), fullPage: true });
const save = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem("sovereign.save") ?? "null"); } catch { return null; } });
await browser.close();

problems.push(
  ...errors.map(e => `ошибка в консоли: ${e}`),
  ...(!opened ? ["«Начать игру» не открыло хронику"] : []),
  ...(prologueBeforeForm ? ["пролог вступления показан до анкеты кандидата"] : []),
  ...(opened && !prologueAfterElection ? ["нет пролога вступления после выборов"] : []),
  ...(stuck ? ["хроника застряла"] : []),
  ...(geometry.underHeader ? [`заголовок дела под шапкой: ${geometry.underHeader} из ${geometry.checks}`] : []),
  ...(geometry.wide ? [`страница шире экрана: ${geometry.wide} из ${geometry.checks}`] : []),
  ...(firstDecisionMs !== null && firstDecisionMs > FIRST_DECISION_LIMIT_MS ? [`первое решение через ${Math.round(firstDecisionMs / 1000)} с`] : []),
  ...(opened && save?.screen !== "chronicle" && save?.screen !== "ending" ? ["партия хроники не попала в общее сохранение"] : []),
);
const summary = { decisions: timeline.filter(line => /^\d/.test(line)).length, memoir, firstDecisionMs, prologueAfterElection, geometry,
  saved: save?.screen ?? null, problems, timeline };
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(problems.length ? 1 : 0);
