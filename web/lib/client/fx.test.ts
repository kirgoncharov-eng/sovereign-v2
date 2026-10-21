import { test } from "node:test";
import assert from "node:assert/strict";
import { soundOn, setSound, thunderFx, clickFx, stampFx } from "./fx.ts";

test("звуковые эффекты: переключение звука и вызов функций без падения вне браузера", () => {
  setSound(true);
  assert.equal(soundOn(), true);
  
  // В среде Node без window и AudioContext вызовы должны быть безопасными
  assert.doesNotThrow(() => {
    thunderFx();
    clickFx();
    stampFx();
  });

  setSound(false);
  assert.equal(soundOn(), false);
  
  assert.doesNotThrow(() => {
    thunderFx();
    clickFx();
  });
});
