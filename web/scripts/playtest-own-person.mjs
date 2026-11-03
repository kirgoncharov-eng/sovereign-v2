// Телефон: реальные кандидаты и обработчики подписи; опоры/нехватка сил заданы явно для пограничного сценария.
// После npm run build:demo: node scripts/playtest-own-person.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(root + "/package.json")("playwright");
const c = await import(root + "/lib/client/chronicle.ts");
const { CHRONICLE_GAME_KEY: key, encodeChronicle, parseChronicle } = await import(root + "/lib/client/chronicle-save.ts");
const { EMPTY_PERSONAL } = await import(root + "/lib/client/chronicle-personal.ts");
const { candidatePool, hireAdvisor, staffingBlocked } = await import(root + "/lib/game/staffing.ts");
const { openDeskWhenDue } = await import(root + "/lib/game/desk-timing.ts");
const { openStops } = await import(root + "/lib/client/chronicle-stops.ts");
const { APP_VERSION, SAVE_VERSION } = await import(root + "/lib/game/data.ts");
const { parseSave } = await import(root + "/lib/client/save.ts");
const { classicApi } = await import(root + "/lib/game/classic.ts");
const { startEvent, ownPersonCarries, successChance } = await import(root + "/lib/game/engine.ts");
const { choicePrice } = await import(root + "/lib/client/choice-price.ts");
const out = root + "/playtest/own-person";
mkdirSync(out, { recursive: true });
const summary = {
  checks: [],
  problems: [],
  controlledFixtures: "state resources set to 60, personal 24 for crisis; real generated candidates and documents; UI hire/council/sign handlers",
};
let browser;
async function fixture(game, start, { staff = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => summary.problems.push(String(error)));
  game = {
    ...game,
    analyticsRun: {
      id: "310".repeat(8),
      startedAt: Date.now(),
      version: APP_VERSION,
      source: "web",
      mode: "ordinary",
    },
  };
  const save = JSON.stringify({
    version: SAVE_VERSION,
    screen: "chronicle",
    state: game,
  });
  const stop = staff ? openStops(game).find((stop) => stop.kind === "staff") : null;
  assert.ok(!staff || stop);
  const snapshot = encodeChronicle({
    start,
    game,
    shown: [],
    queue: [],
    step: game.currentEvent ? c.firstStep(game) : null,
    picks: [],
    form: null,
    stop,
    stops: {},
    memory: EMPTY_PERSONAL,
    visibleResources: game.resources,
    page: null,
    rivals: null,
    over: false,
  });
  assert.ok(parseSave(save));
  assert.ok(parseChronicle(snapshot));
  await page.addInitScript(
    ({ save, snapshot, key }) => {
      localStorage.setItem("sovereign.save", save);
      localStorage.setItem(key, snapshot);
    },
    { save, snapshot, key },
  );
  await page.goto("file://" + root + "/demo/dist/sovereign.html", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /Продолжить сохранённую игру/ }).tap();
  await page.waitForTimeout(1500);
  return { page, context, game };
}
const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).snapshot.game, key);
async function shot(page, name, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await locator.evaluate((element) => {
    const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    let parent = element.parentElement;
    while (parent && !(/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight))
      parent = parent.parentElement;
    const scroller = parent ?? document.scrollingElement;
    scroller.scrollBy({
      top: element.getBoundingClientRect().top - header - 20,
      behavior: "instant",
    });
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal overflow");
  await page.screenshot({ path: out + "/" + name + ".png" });
}
try {
  browser = await chromium.launch();
  let start, game, candidate;
  for (let seed = 1; seed <= 150; seed++) {
    start = c.startFromSeed(seed, "debut");
    game = await c.newTerm(start);
    for (let turn = 0; turn < 6; turn++) {
      game = await c.nextCase(game);
      game = await c.signOption(game, c.firstStep(game).options[0].key);
    }
    game = {
      ...game,
      arc: null,
      resources: Object.fromEntries(Object.keys(game.resources).map((k) => [k, 60])),
    };
    candidate = candidatePool(game).find((x) => x.channel === "relative" && x.skill === 3 && x.seat === "economist" && !staffingBlocked(game, x));
    if (candidate) break;
  }
  assert.ok(candidate, "Harvard relative economist generated");
  game = await c.nextCase(openDeskWhenDue(game));
  const staff = await fixture(game, start, { staff: true }),
    page = staff.page;
  const card = page.locator(".sv-staff-candidate").filter({ has: page.getByText(candidate.name, { exact: true }) });
  await card.waitFor();
  assert.match(await card.innerText(), /Гарварда/);
  assert.match(await card.innerText(), /легитимность −6/);
  assert.match(await card.innerText(), /Гражданское движение −6/);
  assert.match(await card.locator("[data-own-person-card]").innerText(), /не саботирует/);
  await shot(page, "candidate", card.locator("[data-own-person-card]"));
  await card.getByRole("button", { name: "Назначить", exact: true }).tap();
  await card.getByRole("button", { name: "Подписать указ", exact: true }).tap();
  await page.waitForFunction(({ key, name }) => JSON.parse(localStorage.getItem(key)).snapshot.game.advisors.some((a) => a.name === name), {
    key,
    name: candidate.name,
  });
  const hired = await saved(page),
    expected = hireAdvisor(staff.game, candidate.id);
  assert.deepEqual(hired.resources, expected.resources);
  assert.equal(hired.advisors.find((a) => a.id === candidate.seat).origin, "relative");
  summary.checks.push({
    name: "phone hire",
    seed: start.seed,
    candidate,
    resources: hired.resources,
  });
  await page.getByRole("button", { name: "Люди", exact: true }).tap();
  const people = page.getByRole("complementary", { name: "Люди" });
  await people
    .locator("details.sv-who-row")
    .filter({ has: page.getByText(candidate.name, { exact: true }) })
    .locator("summary")
    .tap();
  const memberCard = people.getByRole("group", {
    name: "Карточка: " + candidate.name,
  });
  await memberCard.waitFor();
  assert.match(await memberCard.innerText(), /Свой человек/);
  await shot(page, "advisor", memberCard.locator("[data-own-person-card]"));
  await staff.context.close();
  // Реальный заводской документ + актуальный назначенный автор; личный ресурс задаёт пограничный сценарий.
  let crisis = {
    ...hired,
    resources: { ...hired.resources, personalResource: 24 },
  };
  crisis = startEvent(crisis, await classicApi.event({ ...crisis, turn: 0, arc: null }));
  const council = await fixture(crisis, start),
    p = council.page;
  await p.getByRole("button", { name: "Обсудить подпись", exact: true }).tap();
  await p.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).snapshot.game.currentEvent.council?.length > 0, key);
  const discussed = await saved(p),
    choice = discussed.currentEvent.choices[0];
  assert.equal(ownPersonCarries(discussed, choice), true);
  const row = p.locator("button.sv-choice-row").filter({ has: p.getByText(choice.text, { exact: true }) });
  await row.waitFor();
  assert.match(await row.locator("[data-own-person-crisis]").innerText(), /\+5 п.п./);
  await shot(p, "support-before-sign", row.locator("[data-own-person-crisis]"));
  await row.tap();
  const price = p.getByRole("group", {
    name: "Последствия выбранного решения",
  });
  await price.waitFor();
  const expectedRisk = choicePrice(discussed, choice).failurePercent;
  assert.ok((await price.innerText()).includes("Риск срыва исполнения: " + expectedRisk + "%."));
  await shot(p, "price", price);
  const before = await saved(p);
  assert.deepEqual(before.resources, discussed.resources);
  await p.getByRole("button", { name: /^Подписать/ }).tap();
  await p.waitForFunction(({ key, turn }) => JSON.parse(localStorage.getItem(key)).snapshot.game.turn > turn, { key, turn: discussed.turn });
  const after = await saved(p),
    expectedAfter = await c.signChoice(discussed, choice.id);
  assert.deepEqual(after.resources, expectedAfter.resources);
  summary.checks.push({
    name: "current council bonus and signed price",
    risk: expectedRisk,
    chance: successChance(discussed, choice),
    turn: after.turn,
  });
  await council.context.close();
  assert.deepEqual(summary.problems, []);
} catch (error) {
  summary.problems.push(String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  writeFileSync(out + "/summary.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
