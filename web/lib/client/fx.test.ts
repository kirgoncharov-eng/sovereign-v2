import { test } from "node:test";
import assert from "node:assert/strict";
import {
  soundOn, setSound, subscribeSound,
  startCabinetAmbient, updateCabinetState, stopCabinetAmbient,
  startTitleTheme, stopTitleTheme,
  setAmbientFocus, duckForCall,
  stampFx, penScratchFx, pageFx, folderDropFx, optionArmFx,
  newspaperFx, envelopeFx, doorKnockFx, echoChimeFx, ledgerFx, powerFallFx, proseWhisperFx,
  chronicleLineFx, telephoneFx, handsetFx, councilBellFx, pressFlashFx, mapUnfoldFx,
  thunderFx, clickFx, outcomeFx,
} from "./fx.ts";

test("звуковой движок: переключение звука и безопасный вызов всех 18 эффектов вне браузера", () => {
  let notified = 0;
  const unsubscribe = subscribeSound(() => {
    notified += 1;
  });

  setSound(true);
  assert.equal(soundOn(), true);
  assert.equal(notified, 1);

  assert.doesNotThrow(() => {
    startCabinetAmbient();
    updateCabinetState({ crisis: true, unrest: true, season: "winter" });
    setAmbientFocus(true);
    duckForCall(true);
    startTitleTheme();
    stampFx();
    penScratchFx();
    pageFx();
    folderDropFx();
    optionArmFx();
    newspaperFx();
    envelopeFx();
    doorKnockFx();
    echoChimeFx();
    ledgerFx(true);
    powerFallFx();
    proseWhisperFx();
    for (const kind of ["paper", "press", "letter", "report", "secretary", "echo", "ledger", "fall", "signed", "speech", "scene"]) {
      chronicleLineFx(kind, kind === "ledger" ? "Казна −4. Опасно мало: Силовики." : "Текст строки");
    }
    telephoneFx();
    handsetFx(true);
    handsetFx(false);
    councilBellFx();
    pressFlashFx();
    mapUnfoldFx(true);
    mapUnfoldFx(false);
    thunderFx();
    clickFx();
    outcomeFx(true);
    stopTitleTheme();
    stopCabinetAmbient();
  });

  setSound(false);
  assert.equal(soundOn(), false);
  assert.equal(notified, 2);

  assert.doesNotThrow(() => {
    thunderFx();
    clickFx();
    stampFx();
  });

  unsubscribe();
  setSound(true);
  assert.equal(notified, 2);
});

test("звуковой движок: шинный микшер, Round-Robin вариативность и 4-слойный эмбиент с WebAudio", () => {
  const oscFrequencies: number[] = [];
  const filterFrequencies: number[] = [];
  let createdGains = 0;
  let createdBuffers = 0;

  class MockParam {
    value = 1;
    setValueAtTime(v: number) { this.value = v; }
    linearRampToValueAtTime(v: number) { this.value = v; }
    exponentialRampToValueAtTime(v: number) { this.value = v; }
  }

  class MockNode {
    connect(target: MockNode) { return target; }
    disconnect() {}
  }

  class MockGainNode extends MockNode {
    gain = new MockParam();
  }

  class MockBiquadFilterNode extends MockNode {
    type = "lowpass";
    frequency = {
      value: 1000,
      setValueAtTime: (v: number) => { this.frequency.value = v; filterFrequencies.push(v); },
      linearRampToValueAtTime: (v: number) => { this.frequency.value = v; filterFrequencies.push(v); },
      exponentialRampToValueAtTime: (v: number) => { this.frequency.value = v; filterFrequencies.push(v); },
    };
    Q = new MockParam();
  }

  class MockOscillatorNode extends MockNode {
    type = "sine";
    frequency = {
      value: 440,
      setValueAtTime: (v: number) => { this.frequency.value = v; oscFrequencies.push(v); },
      exponentialRampToValueAtTime: (v: number) => { this.frequency.value = v; },
    };
    start() {}
    stop() {}
  }

  class MockBufferSourceNode extends MockNode {
    buffer: unknown = null;
    loop = false;
    start() {}
    stop() {}
  }

  class MockAudioContext {
    state = "running";
    currentTime = 1.0;
    sampleRate = 8000;
    destination = new MockNode();
    resume() { return Promise.resolve(); }
    createGain() { createdGains += 1; return new MockGainNode(); }
    createBiquadFilter() { return new MockBiquadFilterNode(); }
    createOscillator() { return new MockOscillatorNode(); }
    createBuffer(_ch: number, length: number) {
      createdBuffers += 1;
      const arr = new Float32Array(length);
      return { getChannelData: () => arr };
    }
    createBufferSource() { return new MockBufferSourceNode(); }
  }

  const prevWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = { AudioContext: MockAudioContext };

  try {
    setSound(true);
    // Четыре подряд нажатия переключателя должны давать разную высоту тона (Round-Robin)
    oscFrequencies.length = 0;
    clickFx();
    clickFx();
    clickFx();
    clickFx();
    assert.equal(oscFrequencies.length, 4);
    assert.ok(new Set(oscFrequencies.map(f => Math.round(f))).size >= 3, "Round-Robin должен варьировать частоту кликов");

    // Трёхфазная печать создаёт осцилляторы оснастки/удара и шумовые буферы бумаги/пера
    const buffersBefore = createdBuffers;
    stampFx();
    assert.ok(createdBuffers >= buffersBefore + 2, "stampFx должен синтезировать фазы бумаги и росчерка пера");

    // Фокус справки приглушает фильтр эмбиента до 680 Гц и возвращает к 3200 Гц
    filterFrequencies.length = 0;
    setAmbientFocus(true);
    assert.ok(filterFrequencies.includes(680));
    setAmbientFocus(false);
    assert.ok(filterFrequencies.includes(3200));

    // Запуск и обновление состояния 4-слойного воздуха кабинета
    startCabinetAmbient();
    updateCabinetState({ crisis: true, unrest: true, season: "winter", paused: true });
    assert.ok(filterFrequencies.includes(620), "зимний сезон должен перестраивать фильтр погоды за окном");
    stopCabinetAmbient();
    stopTitleTheme();
    assert.ok(createdGains >= 8);
  } finally {
    stopCabinetAmbient();
    stopTitleTheme();
    if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prevWindow;
  }
});
