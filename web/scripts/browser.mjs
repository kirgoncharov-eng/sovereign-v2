// Запуск Chromium для плейтестов (#418).
// Закреплённый Playwright ищет браузер своей сборки (`npm run playtest:install`). В облачной сессии агента её нет,
// но в образе стоит готовый Chromium: берём его, когда своей сборки не нашлось. Явный путь задаёт CHROMIUM_PATH.
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const PREINSTALLED = "/opt/pw-browsers/chromium";

export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  return existsSync(PREINSTALLED) ? PREINSTALLED : undefined;
}

export function launchChromium(options = {}) {
  const executablePath = chromiumPath();
  return chromium.launch(executablePath ? { ...options, executablePath } : options);
}
