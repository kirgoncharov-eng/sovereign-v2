// Запуск как Telegram Mini App. SDK подгружается только внутри Telegram —
// в обычном браузере и в демо ничего не происходит.
interface TgWebApp {
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
  disableVerticalSwipes?(): void;
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

const SDK = "https://telegram.org/js/telegram-web-app.js";
let app: TgWebApp | null = null;

export const inTelegram = () =>
  typeof window !== "undefined" && /tgWebApp(Data|Platform|Version)=/.test(window.location.hash + window.location.search);

export function initTelegram(bg: string) {
  if (!inTelegram() || document.querySelector(`script[src="${SDK}"]`)) return;
  const s = document.createElement("script");
  s.src = SDK;
  s.onload = () => {
    app = window.Telegram?.WebApp ?? null;
    if (!app) return;
    app.ready();
    app.expand();
    app.setHeaderColor?.(bg);
    app.setBackgroundColor?.(bg);
    app.disableVerticalSwipes?.(); // свайп вниз не закрывает игру посреди хода
  };
  document.head.appendChild(s);
}

// Родное окно «Переслать» Telegram. false — если мы не в Telegram.
export function telegramShare(text: string, url: string): boolean {
  if (!app?.openTelegramLink) return false;
  app.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  return true;
}
