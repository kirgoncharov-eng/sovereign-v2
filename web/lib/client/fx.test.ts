import { test } from "node:test";
import assert from "node:assert/strict";
import { soundOn, setSound, subscribeSound, thunderFx, clickFx, stampFx } from "./fx.ts";

test("звуковые эффекты: переключение звука и вызов функций без падения вне браузера", () => {
  let notified = 0;
  const unsubscribe = subscribeSound(() => {
    notified += 1;
  });

  setSound(true);
  assert.equal(soundOn(), true);
  assert.equal(notified, 1);
  
  // В среде Node без window и AudioContext вызовы должны быть безопасными
  assert.doesNotThrow(() => {
    thunderFx();
    clickFx();
    stampFx();
  });

  setSound(false);
  assert.equal(soundOn(), false);
  assert.equal(notified, 2);
  
  assert.doesNotThrow(() => {
    thunderFx();
    clickFx();
  });

  unsubscribe();
  setSound(true);
  assert.equal(notified, 2);
});
