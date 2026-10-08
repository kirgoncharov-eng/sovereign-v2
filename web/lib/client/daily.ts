// Клиент таблицы «Дела дня». Без сервера (демо, офлайн) функции тихо возвращают null.
import { dailyCase } from "../game/daily.ts";
import type { GameState } from "../game/types.ts";
import { tgInitData, tgStartParam } from "./telegram.ts";

// Таблица «Дела дня» сортируется по годам у власти (ходам), при равенстве — по очкам.
export interface BoardRow { name: string; title: string; score: number; turns: number; me: boolean }
export interface Board { uid: string; total: number; me: { rank: number; score: number; turns: number } | null; top: BoardRow[]; friends: BoardRow[] }

const UID_KEY = "sovereign.uid";
const REF_KEY = "sovereign.ref";

export function webUid(): string {
  try {
    let id = localStorage.getItem(UID_KEY);
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join(""); localStorage.setItem(UID_KEY, id); }
    return id;
  } catch { return ""; }
}

// Кто пригласил: ?ref= в адресе сайта или startapp=ref_… в Telegram.
export function rememberRef() {
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref) localStorage.setItem(REF_KEY, ref);
  } catch { /* недоступно */ }
}
function ref(): string {
  const sp = tgStartParam();
  if (sp.startsWith("ref_")) return sp.slice(4);
  try { return localStorage.getItem(REF_KEY) || ""; } catch { return ""; }
}

async function call(payload: Record<string, unknown>): Promise<Board | null> {
  try {
    const r = await fetch("/api/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, uid: webUid(), initData: tgInitData(), ref: ref() }),
    });
    return r.ok ? await r.json() as Board : null;
  } catch {
    return null;
  }
}

export const submitDaily = (gs: GameState) => call(gs.dailyMoves?.length === gs.turn ? {
  action: "submit", date: gs.daily, moves: gs.dailyMoves,
} : { action: "board", date: gs.daily }); // старая партия остаётся доступна, но без проверяемого результата
export const fetchBoard = (date = dailyCase().date) => call({ action: "board", date });

// Ссылка-приглашение: друг, пришедший по ней, появится в таблице друзей.
export function inviteUrl(uid: string, shareBase: string) {
  if (/^https:\/\/t\.me\//.test(shareBase)) return `${shareBase}${shareBase.includes("?") ? "&" : "?"}startapp=ref_${uid}`;
  const base = shareBase || (typeof location !== "undefined" ? location.origin + location.pathname : "");
  return `${base}${base.includes("?") ? "&" : "?"}ref=${uid}`;
}
