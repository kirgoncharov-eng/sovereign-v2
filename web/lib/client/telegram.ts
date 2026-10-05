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
  setBottomBarColor?(color: string): void;
  MainButton?: TgButton & {
    setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
  };
  BackButton?: TgButton;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
  };
}
interface TgButton { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

const SDK = "https://telegram.org/js/telegram-web-app.js";
let app: TgWebApp | null = null;
const readyListeners = new Set<() => void>();

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
    app.setBottomBarColor?.(bg);
    app.disableVerticalSwipes?.(); // свайп вниз не закрывает игру посреди хода
    onReady?.();
    readyListeners.forEach(cb => cb());
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

// Родные кнопки Telegram: большая кнопка внизу экрана и «Назад» в шапке.
export const tgButtons = () => !!app?.MainButton;
// Подписка на готовность SDK: интерфейс переключается на родные кнопки, когда они появятся.
export function onTelegramReady(cb: () => void): () => void {
  readyListeners.add(cb);
  return () => { readyListeners.delete(cb); };
}

let mainHandler: (() => void) | null = null;
export function setMainButton(spec: { text: string; onClick: () => void; color?: string; textColor?: string } | null) {
  const mb = app?.MainButton;
  if (!mb) return;
  if (mainHandler) mb.offClick(mainHandler);
  mainHandler = null;
  if (!spec) { mb.hide(); return; }
  mainHandler = () => { haptic("light"); spec.onClick(); };
  mb.onClick(mainHandler);
  mb.setParams({ text: spec.text, color: spec.color ?? "#e2d9c2", text_color: spec.textColor ?? "#2a2622", is_active: true, is_visible: true });
}

let backHandler: (() => void) | null = null;
export function setBackButton(onClick: (() => void) | null) {
  const bb = app?.BackButton;
  if (!bb) return;
  if (backHandler) bb.offClick(backHandler);
  backHandler = onClick;
  if (onClick) { bb.onClick(onClick); bb.show(); } else bb.hide();
}

// Разрешение боту писать игроку: без него бот не может позвать того, кто открыл игру по ссылке
// и ни разу не нажал «Старт». true — разрешение есть (дали сейчас или раньше).
export function requestWriteAccess(): Promise<boolean> {
  const wa = app as (TgWebApp & { requestWriteAccess?(cb: (ok: boolean) => void): void; initDataUnsafe?: { user?: { allows_write_to_pm?: boolean } } }) | null;
  if (wa?.initDataUnsafe?.user?.allows_write_to_pm) return Promise.resolve(true);
  if (!wa?.requestWriteAccess) return Promise.resolve(false);
  return new Promise(resolve => {
    try { wa.requestWriteAccess!(ok => resolve(!!ok)); } catch { resolve(false); }
  });
}

// Истории Telegram: картинка по ссылке (https) и подпись. Ссылку-виджет Telegram даёт только Premium,
// поэтому адрес игры — в тексте подписи. false — если мы не в Telegram или клиент не умеет истории.
export function telegramStory(mediaUrl: string, text: string): boolean {
  const wa = app as (TgWebApp & { shareToStory?(url: string, params?: { text?: string }): void }) | null;
  if (!wa?.shareToStory) return false;
  try { wa.shareToStory(mediaUrl, { text: text.slice(0, 200) }); return true; } catch { return false; }
}
export const canTelegramStory = () => !!(app as { shareToStory?: unknown } | null)?.shareToStory;
