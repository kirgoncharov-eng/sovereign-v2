import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || new URL('../../playtest-map-artifacts', import.meta.url).pathname;
mkdirSync(ARTIFACT_DIR, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/ERR_CERT|net::|Failed to load resource/.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.addInitScript(() => {
    window.__FORCE_CUTSCENE__ = true;
  });

  await page.goto(new URL('../demo/dist/sovereign.html', import.meta.url).href, { waitUntil: 'domcontentloaded' });
  await wait(800);

  // Начать игру
  await page.getByRole('button', { name: /начать игру/i }).first().tap();
  const prologue = page.getByRole('dialog');
  await prologue.waitFor({ timeout: 8000 });
  await page.keyboard.press('Enter');
  await prologue.waitFor({ state: 'hidden', timeout: 3000 });
  await wait(400);

  // Открыть первое дело
  const opening = page.getByRole('button', { name: /Открыть первое дело/i });
  if (await opening.isVisible()) {
    await opening.tap();
    await wait(400);
  }

  // Играем 2 хода, чтобы открылся президентский стол (ход 3)
  for (let turn = 1; turn <= 2; turn++) {
    await page.locator('#opt-1').waitFor({ timeout: 8000 });
    await wait(300);
    // Делаем выбор 1
    await page.locator('#opt-1').scrollIntoViewIfNeeded();
    await page.locator('#opt-1').tap();
    await wait(300);

    const sign = page.locator('.sv-actionbar button', { hasText: /Подписать|Подготовить резолюцию/ });
    if (await sign.count() && await sign.isVisible()) {
      await sign.tap();
    } else {
      await page.locator('#opt-1').tap();
    }
    await wait(400);

    const finishQuarter = page.locator('[data-finish-quarter]');
    if (await finishQuarter.count()) {
      await page.locator('[data-quarter-resolution]').waitFor({ timeout: 8000 }).catch(() => {});
      await finishQuarter.tap();
    }
    await wait(1200);

    // Газета и кнопка "Следующий ход"
    const skip = page.locator('.sv-actionbar button', { hasText: 'Показать текст' });
    if (await skip.count()) await skip.tap().catch(() => {});
    const nextBtn = page.locator('button', { hasText: /Следующий ход/i }).filter({ visible: true }).last();
    await nextBtn.waitFor({ timeout: 25000 });
    await wait(400);
    await nextBtn.tap();
    await wait(1200);
  }

  // Сейчас ход 3: президентский стол открыт!
  console.log('Turn 3 reached! Opening side sheet...');
  await wait(500);

  // Открываем справочники/страну
  const refSummary = page.locator('summary').filter({ hasText: /Справочники/i }).first();
  if (await refSummary.count() && await refSummary.isVisible()) {
    await refSummary.tap();
    await wait(300);
  }

  const countryTab = page.locator('.sv-sheet-tab-country').first();
  if (await countryTab.count()) {
    await countryTab.scrollIntoViewIfNeeded();
    await countryTab.tap();
    await wait(600);
  }

  const mapWrap = page.locator('.sv-republic-map-wrap');
  const isMapVisible = await mapWrap.count() > 0 && await mapWrap.isVisible();
  console.log('RepublicMap rendered and visible:', isMapVisible);

  if (isMapVisible) {
    // Прокручиваем к карте
    await mapWrap.scrollIntoViewIfNeeded();
    await wait(300);

    // Скриншот 1: Общий вид карты на экране телефона (по умолчанию)
    await page.screenshot({ path: `${ARTIFACT_DIR}/playtest_map_mobile_01_minsk.png`, fullPage: false });

    // Проверяем горизонтальный скролл
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const wrap = document.querySelector('.sv-republic-map-wrap');
      const tabs = document.querySelector('.sv-republic-map-tabs');
      const dossier = document.querySelector('.sv-republic-dossier');
      return {
        windowWidth: window.innerWidth,
        docScrollWidth: doc.scrollWidth,
        hasHorizontalOverflow: doc.scrollWidth > window.innerWidth,
        wrapWidth: wrap?.clientWidth,
        wrapScrollWidth: wrap?.scrollWidth,
        tabsHeight: tabs?.clientHeight,
        dossierHeight: dossier?.clientHeight,
      };
    });
    console.log('Layout & overflow metrics:', metrics);

    // Проверяем тач-таргеты кнопок табов
    const buttonMetrics = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.sv-republic-map-tab-btn'));
      return btns.map(b => {
        const rect = b.getBoundingClientRect();
        return {
          region: b.innerText.split('\n')[0].trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          minTouchOk: rect.height >= 44 && rect.width >= 44
        };
      });
    });
    console.log('Button touch target metrics:', buttonMetrics);

    // Выбираем Гродно
    const tabBtns = page.locator('.sv-republic-map-tab-btn');
    const grodnoBtn = tabBtns.filter({ hasText: /Гродно/i }).first();
    if (await grodnoBtn.count()) {
      await grodnoBtn.tap();
      await wait(300);
      await page.screenshot({ path: `${ARTIFACT_DIR}/playtest_map_mobile_02_grodno.png`, fullPage: false });
    }

    // Выбираем Брест
    const brestBtn = tabBtns.filter({ hasText: /Брест/i }).first();
    if (await brestBtn.count()) {
      await brestBtn.tap();
      await wait(300);
      await page.screenshot({ path: `${ARTIFACT_DIR}/playtest_map_mobile_03_brest.png`, fullPage: false });
    }

    // Выбираем Полесье
    const polesieBtn = tabBtns.filter({ hasText: /Полесье/i }).first();
    if (await polesieBtn.count()) {
      await polesieBtn.tap();
      await wait(300);
      await page.screenshot({ path: `${ARTIFACT_DIR}/playtest_map_mobile_04_polesie.png`, fullPage: false });
    }
  }

  console.log('Console errors encountered:', errors);
  await context.close();
} finally {
  await browser.close();
}
