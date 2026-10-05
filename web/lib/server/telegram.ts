// Telegram: проверка подписи initData мини-приложения и вызовы Bot API.
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.ts";

export interface TgUser { id: number; first_name?: string; username?: string; allows_write_to_pm?: boolean }

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 86400, now = Date.now()): TgUser | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest("hex");
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    return user && typeof user.id === "number" ? user : null;
  } catch {
    return null;
  }
}

export async function botApi(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export const appUrl = () => env("APP_URL");

// Кнопка, открывающая игру внутри Telegram.
export const playButton = (text = "Открыть кабинет") =>
  ({ inline_keyboard: [[{ text, web_app: { url: appUrl() } }]] });
