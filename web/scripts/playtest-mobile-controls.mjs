// Реальная навигация хроники. Telegram проверяется через документированные CSS-параметры viewport,
// а не выдаётся за физический WebView. Вызывается из обязательного playtest-chronicle.mjs.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

export async function openChronicleControls(page) {
  const button = page.getByRole('button', { name: 'Управление хроникой', exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.tap();
}

export async function exerciseMobileControls(page, shot) {
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sovereign.save')).state);
  const before = await saved(), results = [];
  const panel = page.getByRole('complementary', { name: 'Управление хроникой', exact: true });
  const close = () => panel.getByRole('button', { name: 'Закрыть управление и вернуться к ленте' }).tap();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 640 });
    // WebView может показывать лишь часть layout viewport; снизу ещё системный отступ.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '480px');
      document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', '24px');
    });
    await page.getByRole('button', { name: 'Вернуться к текущему решению' }).tap();
    await page.waitForTimeout(800);
    const header = await page.locator('header').boundingBox();
    assert.ok(header.height <= 112, `шапка ${width}: ${header.height}px`);
    for (const box of await page.locator('header button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height };
    }))) assert.ok(box.height >= 44, 'достаточная высота целей касания');
    assert.equal(await page.locator('header [data-res]').count(), 6, 'все шесть опор остаются на виду');
    await page.screenshot({ path: shot(`mobile-${width}-case`) });
    const scrollBefore = await page.evaluate(() => scrollY);
    await openChronicleControls(page);
    const opened = await panel.boundingBox();
    assert.ok(opened.y + opened.height <= 481, 'панель помещается в видимую часть Telegram');
    assert.equal((await page.locator('header').boundingBox()).height, header.height, 'панель не растит шапку');
    await page.screenshot({ path: shot(`mobile-${width}-controls`) });
    const waiting = panel.getByRole('button', { name: /Ждут ответа ·/ });
    if (await waiting.count()) {
      await page.locator('header [aria-label^="Ждут ответа:"]').waitFor();
      await waiting.tap();
      await panel.getByRole('list').waitFor();
      await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const closeBox = await panel.getByRole('button', { name: 'Закрыть управление и вернуться к ленте' }).boundingBox();
      assert.ok(closeBox.y >= header.height && closeBox.y + closeBox.height <= 480, 'закрытие длинного списка доступно');
      await page.screenshot({ path: shot(`mobile-${width}-waiting`) });
    }
    await close();
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 1, 'закрытие сохраняет место чтения');
    await openChronicleControls(page);
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0, 'Escape закрывает панель');
    assert.equal(await page.getByRole('button', { name: 'Управление хроникой', exact: true }).evaluate(el => el === document.activeElement), true);
    await openChronicleControls(page);
    await panel.getByRole('button', { name: 'Страна', exact: true }).tap();
    const country = page.getByRole('complementary', { name: 'Страна', exact: true });
    await country.waitFor();
    await country.getByRole('button', { name: 'Закрыть справку и вернуться к ленте' }).tap();
    await page.locator('header [data-res="economy"]').tap();
    const resource = page.locator('.sv-resource-info');
    const resourceBox = await resource.boundingBox();
    await page.screenshot({ path: shot(`mobile-${width}-pillar`) });
    assert.ok(resourceBox.y + resourceBox.height <= 480 - 24, `справка опоры также помещается в Telegram: ${JSON.stringify(resourceBox)}`);
    await resource.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await resource.locator('.sv-resource-info-heading button').tap();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.getByRole('button', { name: 'Вернуться к текущему решению' }).tap();
    await page.waitForTimeout(800);
    const section = await page.locator('section[aria-label="Дело на столе"]:not([hidden])').boundingBox();
    assert.ok(section.y >= header.height - 1 && section.y <= header.height + 30, 'возврат приводит к заголовку дела');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'нет горизонтальной прокрутки');
    results.push({ width, layoutHeight: 640, telegramStableHeight: 480, headerHeight: header.height, panelBottom: opened.y + opened.height });
  }
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--tg-viewport-stable-height');
    document.documentElement.style.removeProperty('--tg-safe-area-inset-bottom');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openChronicleControls(page);
  await panel.getByRole('button', { name: 'Люди', exact: true }).tap();
  await page.getByRole('complementary', { name: 'Люди', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Закрыть справку и вернуться к ленте' }).tap();
  await page.screenshot({ path: shot('mobile-desktop-control') });
  assert.deepEqual(await saved(), before, 'навигация не подписывает решение и не меняет состояние партии');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Вернуться к текущему решению' }).tap();
  await page.waitForTimeout(800);
  writeFileSync(shot('mobile-controls').replace(/\.png$/, '.json'), JSON.stringify({ results, problems: [] }, null, 2));
}

export async function checkNavigationTimer(page) {
  const timer = page.locator('.sv-timer');
  await timer.waitFor();
  await openChronicleControls(page);
  assert.equal(await timer.evaluate(element => getComputedStyle(element).animationPlayState), 'paused', 'панель ставит таймер вопроса на паузу');
  const width = await timer.evaluate(element => element.getBoundingClientRect().width);
  await page.waitForTimeout(300);
  assert.equal(await timer.evaluate(element => element.getBoundingClientRect().width), width, 'время вопроса не уходит в меню');
  await page.getByRole('button', { name: 'Закрыть управление и вернуться к ленте' }).tap();
  assert.equal(await timer.evaluate(element => getComputedStyle(element).animationPlayState), 'running', 'после закрытия вопрос продолжается');
}
