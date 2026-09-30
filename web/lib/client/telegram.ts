// Запуск как Telegram Mini App. SDK подгружается только внутри Telegram —
// в обычном браузере и в демо ничего не происходит.
interface TgWebApp {
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
  disableVerticalSwipes?(): void;
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  CloudStorage?: {
    getItem(key: string, cb: (err: unknown, value?: string) => void): void;
    setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
  };
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

const SDK = "https://telegram.org/js/telegram-web-app.js";
let app: TgWebApp | null = null;

export const inTelegram = () =>
  typeof window !== "undefined" && /tgWebApp(Data|Platform|Version)=/.test(window.location.hash + window.location.search);

// onReady вызывается, когда SDK загружен и приложение готово (только внутри Telegram).
export function initTelegram(bg: string, onReady?: () => void) {
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
    onReady?.();
  };
  document.head.appendChild(s);
}

// Родное окно «Переслать» Telegram. false — если мы не в Telegram.
export function telegramShare(text: string, url: string): boolean {
  if (!app?.openTelegramLink) return false;
  app.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  return true;
}

// Тактильный отклик: в Telegram — родной, на Android-браузере — короткая вибрация.
export function haptic(kind: "light" | "heavy" | "success" | "error") {
  const h = app?.HapticFeedback;
  if (h) {
    if (kind === "success" || kind === "error") h.notificationOccurred(kind);
    else h.impactOccurred(kind);
    return;
  }
  if (kind === "heavy" && typeof navigator !== "undefined" && "vibrate" in navigator && matchMedia("(pointer:coarse)").matches) navigator.vibrate(18);
}

// Подписанные данные пользователя — сервер проверяет их токеном бота.
export const tgInitData = () => app?.initData || "";
export const tgStartParam = () => app?.initDataUnsafe?.start_param || "";

// Облачное хранилище Telegram: прогресс переживает смену телефона (до 4 КБ на ключ).
export function cloudGet(key: string): Promise<string | null> {
  const cs = app?.CloudStorage;
  if (!cs) return Promise.resolve(null);
  return new Promise(res => cs.getItem(key, (err, v) => res(err ? null : v || null)));
}
export function cloudSet(key: string, value: string) {
  if (value.length <= 4096) app?.CloudStorage?.setItem(key, value);
}
