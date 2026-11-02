import { test } from "node:test";
import assert from "node:assert/strict";
import {
  soundOn, setSound, subscribeSound,
  startCabinetAmbient, updateCabinetState, stopCabinetAmbient,
  startTitleTheme, stopTitleTheme,
  setAmbientFocus, duckForCall, handleVisibilityChange,
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

test("звуковой движок: шинный микшер, компрессор/лимитер, Round-Robin вариативность и 4-слойный эмбиент с WebAudio", () => {
  const oscFrequencies: number[] = [];
  const filterFrequencies: number[] = [];
  let createdGains = 0;
  let createdBuffers = 0;
  let createdCompressors = 0;

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

  class MockDynamicsCompressorNode extends MockNode {
    threshold = new MockParam();
    knee = new MockParam();
    ratio = new MockParam();
    attack = new MockParam();
    release = new MockParam();
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
    createDynamicsCompressor() {
      createdCompressors += 1;
      return new MockDynamicsCompressorNode();
    }
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

    // Мастер-шина включает DynamicsCompressorNode для защиты слуха
    assert.ok(createdCompressors >= 1, "ensureBuses должен создавать DynamicsCompressorNode");

    // Фокус справки приглушает фильтр эмбиента до 680 Гц и возвращает к 3200 Гц
    filterFrequencies.length = 0;
    setAmbientFocus(true);
    assert.ok(filterFrequencies.includes(680));
    setAmbientFocus(false);
    assert.ok(filterFrequencies.includes(3200));

    // Запуск и обновление состояния 4-слойного воздуха кабинета
    startCabinetAmbient();
    updateCabinetState({ crisis: true, unrest: true, season: "winter", paused: false });
    assert.ok(filterFrequencies.includes(620), "зимний сезон должен перестраивать фильтр погоды за окном");

    // Пауза должна мягко приглушать мастер-гейн эмбиента до 0.0001
    updateCabinetState({ paused: true });
    // Снятие с паузы возвращает эмбиент к 0.022
    updateCabinetState({ paused: false });

    // Сворачивание приложения (visibilitychange: hidden) приглушает мастер-шину и эмбиент
    handleVisibilityChange(true);
    handleVisibilityChange(false);

    // Звонок вертушки и ducking фоновых шин
    telephoneFx();
    setAmbientFocus(true);
    setAmbientFocus(false);
    duckForCall(false);

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

test("звуковой движок: отмена запланированных AudioParam-событий (AudioParam timeline cancellation)", () => {
  interface TimelineEvent {
    type: "setValue" | "linearRamp" | "exponentialRamp";
    value: number;
    time: number;
  }

  const sharedClock = { currentTime: 0 };
  const gains: MockGainNode[] = [];

  class MockTimelineParam {
    events: TimelineEvent[] = [];
    initialValue: number;

    constructor(initialValue = 1) {
      this.initialValue = initialValue;
      this.events.push({ type: "setValue", value: initialValue, time: 0 });
    }

    setValueAtTime(value: number, time: number) {
      this.events = this.events.filter(e => e.time !== time);
      this.events.push({ type: "setValue", value, time });
      this.events.sort((a, b) => a.time - b.time);
    }

    linearRampToValueAtTime(value: number, time: number) {
      this.events.push({ type: "linearRamp", value, time });
      this.events.sort((a, b) => a.time - b.time);
    }

    exponentialRampToValueAtTime(value: number, time: number) {
      this.events.push({ type: "exponentialRamp", value, time });
      this.events.sort((a, b) => a.time - b.time);
    }

    cancelScheduledValues(cancelTime: number) {
      this.events = this.events.filter(e => e.time < cancelTime);
    }

    cancelAndHoldAtTime(cancelTime: number) {
      const holdVal = this.getValueAtTime(cancelTime);
      this.events = this.events.filter(e => e.time < cancelTime);
      this.events.push({ type: "setValue", value: holdVal, time: cancelTime });
    }

    getValueAtTime(time: number): number {
      if (this.events.length === 0) return this.initialValue;
      let prevVal = this.initialValue;
      let prevTime = 0;

      for (let i = 0; i < this.events.length; i++) {
        const e = this.events[i];
        if (e.time > time) {
          if (e.type === "linearRamp") {
            const ratio = (time - prevTime) / Math.max(0.0001, e.time - prevTime);
            return prevVal + (e.value - prevVal) * Math.min(1, Math.max(0, ratio));
          } else if (e.type === "exponentialRamp") {
            const ratio = (time - prevTime) / Math.max(0.0001, e.time - prevTime);
            if (prevVal > 0 && e.value > 0) {
              return prevVal * Math.pow(e.value / prevVal, Math.min(1, Math.max(0, ratio)));
            }
            return prevVal + (e.value - prevVal) * ratio;
          } else {
            return prevVal;
          }
        }
        prevVal = e.value;
        prevTime = e.time;
      }
      return prevVal;
    }

    get value(): number {
      return this.getValueAtTime(sharedClock.currentTime);
    }

    set value(v: number) {
      this.setValueAtTime(v, sharedClock.currentTime);
    }
  }

  class MockNode {
    connect(target: MockNode) { return target; }
    disconnect() {}
  }

  class MockGainNode extends MockNode {
    gain: MockTimelineParam;
    constructor(init = 1) {
      super();
      this.gain = new MockTimelineParam(init);
      gains.push(this);
    }
  }

  class MockDynamicsCompressorNode extends MockNode {
    threshold = new MockTimelineParam(-18);
    knee = new MockTimelineParam(12);
    ratio = new MockTimelineParam(4);
    attack = new MockTimelineParam(0.003);
    release = new MockTimelineParam(0.15);
  }

  class MockBiquadFilterNode extends MockNode {
    type = "lowpass";
    frequency = new MockTimelineParam(1000);
    Q = new MockTimelineParam(1);
  }

  class MockOscillatorNode extends MockNode {
    type = "sine";
    frequency = new MockTimelineParam(440);
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
    get currentTime() { return sharedClock.currentTime; }
    sampleRate = 8000;
    destination = new MockNode();
    resume() { return Promise.resolve(); }
    createGain() { return new MockGainNode(); }
    createBiquadFilter() { return new MockBiquadFilterNode(); }
    createOscillator() { return new MockOscillatorNode(); }
    createBuffer(_ch: number, length: number) {
      const arr = new Float32Array(length);
      return { getChannelData: () => arr };
    }
    createBufferSource() { return new MockBufferSourceNode(); }
    createDynamicsCompressor() { return new MockDynamicsCompressorNode(); }
  }

  const prevWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = { AudioContext: MockAudioContext };

  try {
    // ── Сценарий 1: Запуск t=10; paused=true t=10.1 ─────────────────────────
    sharedClock.currentTime = 10.0;
    setSound(true);
    startCabinetAmbient();

    // gain[4] — это masterGain эмбиента (0=master, 1=sfx, 2=ambient, 3=music, 4=ambient.masterGain)
    const ambientMaster = gains[4];
    assert.ok(ambientMaster, "ambient masterGain должен быть создан");

    // Игрок ставит паузу через 100 мс после старта
    sharedClock.currentTime = 10.1;
    updateCabinetState({ paused: true });

    // В t=10.35 громкость должна опуститься до 0.0001
    assert.ok(ambientMaster.gain.getValueAtTime(10.35) <= 0.0002, "в t=10.35 эмбиент должен затихнуть");

    // В t=12.0 (после завершения старого startup-fade на 1.8 с) громкость НЕ должна вернуться к 0.022!
    assert.ok(
      ambientMaster.gain.getValueAtTime(12.0) <= 0.0002,
      `старая автоматизация старта не должна возвращать громкость: ${ambientMaster.gain.getValueAtTime(12.0)}`,
    );

    // Снятие с паузы корректно возвращает громкость
    sharedClock.currentTime = 12.1;
    updateCabinetState({ paused: false });
    assert.ok(ambientMaster.gain.getValueAtTime(12.6) >= 0.02, "снятие с паузы возвращает эмбиент к 0.022");

    // ── Сценарий 2: hidden t=14 → visible t=14.025 → hidden t=14.05 ──────────
    const masterBus = gains[0]; // Мастер-шина
    sharedClock.currentTime = 14.0;
    handleVisibilityChange(true);

    sharedClock.currentTime = 14.025;
    handleVisibilityChange(false);

    sharedClock.currentTime = 14.05;
    handleVisibilityChange(true);

    // В t=14.25 мастер затих
    assert.ok(masterBus.gain.getValueAtTime(14.25) <= 0.0002, "в t=14.25 мастер-шина должна быть приглушена");

    // В t=15.0 старый restore на t=14.325 НЕ должен возвращать 0.92, так как вкладка скрыта!
    assert.ok(
      masterBus.gain.getValueAtTime(15.0) <= 0.0002,
      `старый restore не должен возвращать громкость при скрытой вкладке: ${masterBus.gain.getValueAtTime(15.0)}`,
    );

    // Возврат на вкладку в t=15.1
    sharedClock.currentTime = 15.1;
    handleVisibilityChange(false);
    assert.ok(masterBus.gain.getValueAtTime(15.5) >= 0.9, "активная вкладка восстанавливает громкость мастер-шины");

    // ── Сценарий 3: setSound(true) t=20 → false t=20.01 ─────────────────────
    sharedClock.currentTime = 20.0;
    setSound(true);

    sharedClock.currentTime = 20.01;
    setSound(false);

    // В t=20.11 мастер затих
    assert.ok(masterBus.gain.getValueAtTime(20.11) <= 0.0002, "в t=20.11 выключенный звук должен затихнуть");

    // В t=20.3 старый enable fade НЕ должен возвращать 0.92 при soundOn()=false!
    assert.ok(
      masterBus.gain.getValueAtTime(20.3) <= 0.0002,
      `старый enable fade не должен включать звук после setSound(false): ${masterBus.gain.getValueAtTime(20.3)}`,
    );

    // ── Проверка ducking и справки ──────────────────────────────────────────
    setSound(true);
    sharedClock.currentTime = 25.0;
    const ambientBus = gains[2];
    const musicBus = gains[3];

    telephoneFx();
    assert.ok(ambientBus.gain.getValueAtTime(25.4) <= 0.39, "звонок ЗАС приглушает AMBIENT");
    assert.ok(musicBus.gain.getValueAtTime(25.4) <= 0.26, "звонок ЗАС приглушает MUSIC");

    sharedClock.currentTime = 26.0;
    setAmbientFocus(true);
    assert.ok(ambientBus.gain.getValueAtTime(26.4) <= 0.33, "справка во время звонка дополнительно удерживает фокус");

    sharedClock.currentTime = 27.0;
    setAmbientFocus(false);
    assert.ok(ambientBus.gain.getValueAtTime(27.4) <= 0.39, "закрытие справки возвращает к уровню звонка 0.38");

    sharedClock.currentTime = 28.0;
    duckForCall(false);
    assert.ok(ambientBus.gain.getValueAtTime(28.4) >= 0.85, "окончание разговора восстанавливает AMBIENT");
    assert.ok(musicBus.gain.getValueAtTime(28.4) >= 0.72, "окончание разговора восстанавливает MUSIC");

    stopCabinetAmbient();
  } finally {
    stopCabinetAmbient();
    stopTitleTheme();
    if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prevWindow;
  }
});
