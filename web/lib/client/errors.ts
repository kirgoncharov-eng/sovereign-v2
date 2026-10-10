// Ошибки у игроков уходят на сервер, чтобы сбой был виден в цифрах (/api/stats), а не только в отзывах.
// Одна и та же ошибка за сессию отправляется один раз, всего не больше десяти; в демо и на тестовом устройстве — ничего.
import { webUid } from "./daily.ts";
import { isTester } from "./analytics.ts";
import { APP_VERSION } from "../game/data.ts";

type Kind = "js" | "promise" | "render";
const seen = new Set<string>();
let installed = false;

const enabled = () => typeof window !== "undefined" && process.env.NEXT_PUBLIC_ANALYTICS !== "off" && !isTester();

export function reportError(kind: Kind, error: unknown) {
  if (!enabled()) return;
  const msg = (error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "")).slice(0, 300);
  const key = `${kind}|${msg}`;
  if (!msg || seen.has(key) || seen.size >= 10) return;
  seen.add(key);
  const pid = webUid();
  if (!pid) return;
  const body = JSON.stringify({ pid, errors: [{ kind, msg, v: APP_VERSION }] });
  try {
    if (!navigator.sendBeacon?.("/api/error", new Blob([body], { type: "text/plain" })))
      fetch("/api/error", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* отчёт об ошибке не должен сам ронять игру */ }
}

export function installErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  addEventListener("error", e => reportError("js", e.error ?? e.message));
  addEventListener("unhandledrejection", e => reportError("promise", e.reason));
}
