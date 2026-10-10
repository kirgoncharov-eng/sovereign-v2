import { tgStartParam } from "./telegram.ts";

const STORAGE_KEY = "sovereign.acquisition";
export const validChannel = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,23}$/.test(value);

export function parseAcquisitionSource(value: string): string | undefined {
  const channel = value.startsWith("src_") ? value.slice(4) : undefined;
  return validChannel(channel) ? channel : undefined;
}

export function sourceFromLocation(search: string, hash: string, startParam = ""): string | undefined {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const candidates = [startParam, query.get("tgWebAppStartParam"), fragment.get("tgWebAppStartParam"), query.get("startapp")];
  for (const candidate of candidates) {
    const channel = parseAcquisitionSource(candidate ?? "");
    if (channel) return channel;
  }
  return undefined;
}

// Первый известный канал устройства сохраняется; обычный возврат его не стирает.
export function acquisitionChannel(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const incoming = sourceFromLocation(window.location.search, window.location.hash, tgStartParam());
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (validChannel(saved)) return saved;
    if (incoming) localStorage.setItem(STORAGE_KEY, incoming);
  } catch { /* Заблокированное хранилище не мешает игре. */ }
  return incoming;
}
