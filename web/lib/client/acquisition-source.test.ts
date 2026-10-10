import { test } from "node:test";
import assert from "node:assert/strict";
import { acquisitionChannel, parseAcquisitionSource, sourceFromLocation } from "./acquisition-source.ts";

test("канал разбирается из startapp, параметра Telegram и hash до загрузки SDK", () => {
  assert.equal(sourceFromLocation("?startapp=src_channel-1", ""), "channel-1");
  assert.equal(sourceFromLocation("", "#tgWebAppStartParam=src_review"), "review");
  assert.equal(sourceFromLocation("?tgWebAppStartParam=src_games", ""), "games");
  assert.equal(sourceFromLocation("", "", "src_sdk"), "sdk");
  for (const value of ["ref_tg123", "src_", "src_<script>", "src_" + "a".repeat(25), "src_TG", "src_a|b"])
    assert.equal(parseAcquisitionSource(value), undefined);
});

test("первый канал сохраняется при возврате и новой ссылке; заблокированное хранилище не мешает", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const location = { search: "?startapp=src_first", hash: "" };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    assert.equal(acquisitionChannel(), "first");
    location.search = "";
    assert.equal(acquisitionChannel(), "first");
    location.search = "?startapp=src_second";
    assert.equal(acquisitionChannel(), "first");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    assert.equal(acquisitionChannel(), "second");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
