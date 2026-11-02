// Звуковой движок «Суверена» (AudioSystem 1978).
// Шинная архитектура WebAudio (SFX, AMBIENT, MUSIC), Round-Robin вариативность без усталости слуха,
// 4-слойный динамический воздух кабинета Резиденции и полная тактильная палитра «Хроники срока».
// Работает без внешних аудиофайлов (0 КБ трафика), строго после действия игрока, выключается одной настройкой.
import { haptic } from "./telegram.ts";

const KEY = "sovereign.sound";
let memorySound = true;
let ctx: AudioContext | null = null;

const soundListeners = new Set<() => void>();

export function subscribeSound(callback: () => void): () => void {
  soundListeners.add(callback);
  return () => {
    soundListeners.delete(callback);
  };
}

export function soundOn(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(KEY) !== "0";
    }
  } catch {}
  return memorySound;
}

export function setSound(on: boolean) {
  memorySound = on;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, on ? "1" : "0");
    }
  } catch {}
  if (!on) {
    if (buses) {
      try {
        const t = buses.ctx.currentTime;
        buses.master.gain.setValueAtTime(buses.master.gain.value, t);
        buses.master.gain.linearRampToValueAtTime(0.0001, t + 0.1);
        buses.master.gain.value = 0.0001;
      } catch {}
    }
    stopCabinetAmbient();
    stopTitleTheme();
  } else {
    if (buses && !isDocumentHidden()) {
      try {
        const t = buses.ctx.currentTime;
        buses.master.gain.setValueAtTime(buses.master.gain.value, t);
        buses.master.gain.linearRampToValueAtTime(0.92, t + 0.2);
        buses.master.gain.value = 0.92;
      } catch {}
    }
    startCabinetAmbient();
  }
  soundListeners.forEach(fn => {
    try { fn(); } catch {}
  });
}

export function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true;
}

export function handleVisibilityChange(hidden: boolean) {
  const g = ensureBuses();
  const t = g?.ctx.currentTime ?? 0;
  try {
    if (hidden) {
      if (g) {
        g.master.gain.setValueAtTime(g.master.gain.value, t);
        g.master.gain.linearRampToValueAtTime(0.0001, t + 0.2);
        g.master.gain.value = 0.0001;
      }
      if (ambientNodes) {
        ambientNodes.masterGain.gain.setValueAtTime(ambientNodes.masterGain.gain.value, t);
        ambientNodes.masterGain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
        ambientNodes.masterGain.gain.value = 0.0001;
      }
    } else {
      if (g?.ctx.state === "suspended") {
        void g.ctx.resume().catch(() => {});
      }
      if (soundOn()) {
        if (g) {
          g.master.gain.setValueAtTime(g.master.gain.value, t);
          g.master.gain.linearRampToValueAtTime(0.92, t + 0.3);
          g.master.gain.value = 0.92;
        }
        if (ambientNodes && !cabinetState.paused) {
          ambientNodes.masterGain.gain.setValueAtTime(ambientNodes.masterGain.gain.value, t);
          ambientNodes.masterGain.gain.linearRampToValueAtTime(0.022, t + 0.4);
          ambientNodes.masterGain.gain.value = 0.022;
        }
      }
    }
  } catch {}
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    handleVisibilityChange(isDocumentHidden());
  });
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", () => handleVisibilityChange(true));
  window.addEventListener("pageshow", () => handleVisibilityChange(isDocumentHidden()));
}

// ── Шинный микшер (Audio Bus Graph) ──────────────────────────────────────────

interface BusGraph {
  ctx: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode | null;
  sfx: GainNode;
  ambient: GainNode;
  ambientFilter: BiquadFilterNode;
  music: GainNode;
}

let buses: BusGraph | null = null;
let isCallActive = false;
let sheetMuffled = false;

function audio(): AudioContext | null {
  if (!soundOn() || typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    if (!ctx || (typeof AC === "function" && !(ctx instanceof AC))) {
      ctx = new AC();
      buses = null;
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function ensureBuses(): BusGraph | null {
  const a = audio();
  if (!a) return null;
  if (buses && buses.ctx === a) return buses;
  try {
    const master = a.createGain();
    const initMasterGain = soundOn() && !isDocumentHidden() ? 0.92 : 0.0001;
    master.gain.setValueAtTime(initMasterGain, a.currentTime);
    master.gain.value = initMasterGain;

    let compressor: DynamicsCompressorNode | null = null;
    if (typeof a.createDynamicsCompressor === "function") {
      compressor = a.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-18, a.currentTime);
      compressor.knee.setValueAtTime(12, a.currentTime);
      compressor.ratio.setValueAtTime(4, a.currentTime);
      compressor.attack.setValueAtTime(0.003, a.currentTime);
      compressor.release.setValueAtTime(0.15, a.currentTime);
      master.connect(compressor);
      compressor.connect(a.destination);
    } else {
      master.connect(a.destination);
    }

    const sfx = a.createGain();
    sfx.gain.setValueAtTime(0.95, a.currentTime);
    sfx.connect(master);

    const ambientFilter = a.createBiquadFilter();
    ambientFilter.type = "lowpass";
    const initFreq = sheetMuffled ? 680 : 3200;
    ambientFilter.frequency.setValueAtTime(initFreq, a.currentTime);
    ambientFilter.frequency.value = initFreq;

    const ambient = a.createGain();
    const initAmbientGain = isCallActive ? (sheetMuffled ? 0.32 : 0.38) : (sheetMuffled ? 0.52 : 0.88);
    ambient.gain.setValueAtTime(initAmbientGain, a.currentTime);
    ambient.gain.value = initAmbientGain;
    ambient.connect(ambientFilter).connect(master);

    const music = a.createGain();
    const initMusicGain = isCallActive ? 0.25 : 0.75;
    music.gain.setValueAtTime(initMusicGain, a.currentTime);
    music.gain.value = initMusicGain;
    music.connect(master);

    buses = { ctx: a, master, compressor, sfx, ambient, ambientFilter, music };
    return buses;
  } catch {
    return null;
  }
}

function sfxDestination(a: AudioContext): AudioNode {
  return ensureBuses()?.sfx ?? a.destination;
}

// ── Вариативность высоты и громкости (Zero Ear Fatigue) ──────────────────────

const rrCounters: Record<string, number> = {};
let lastProseAt = 0;

/** Возвращает микро-сдвиг частоты (например, 0.97..1.03) с чередованием Round-Robin */
function nextVariation(id: string, spread = 0.035): { ratio: number; step: number; gainMul: number } {
  const step = ((rrCounters[id] ?? -1) + 1) % 4;
  rrCounters[id] = step;
  const offsets = [-1, 0.45, -0.35, 1];
  const jitter = (Math.random() * 2 - 1) * 0.35;
  const ratio = 1 + (offsets[step] * 0.7 + jitter) * spread;
  const gainMul = 0.92 + ((step % 2) * 0.06) + Math.random() * 0.06;
  return { ratio, step, gainMul };
}

function noiseBuffer(a: AudioContext, seconds: number, decayPower = 1.8): AudioBufferSourceNode {
  const length = Math.max(1, Math.ceil(a.sampleRate * seconds));
  const buf = a.createBuffer(1, length, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const env = (1 - i / length) ** decayPower;
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

// ── Управление фокусом и приглушением (Ducking & Sheet Focus) ────────────────

function applyBusGains() {
  const g = ensureBuses();
  if (!g) return;
  try {
    const t = g.ctx.currentTime;
    const targetAmbient = isCallActive ? (sheetMuffled ? 0.32 : 0.38) : (sheetMuffled ? 0.52 : 0.88);
    const targetMusic = isCallActive ? 0.25 : 0.75;
    const targetFreq = sheetMuffled ? 680 : 3200;

    g.ambient.gain.setValueAtTime(g.ambient.gain.value, t);
    g.ambient.gain.linearRampToValueAtTime(targetAmbient, t + 0.35);
    g.ambient.gain.value = targetAmbient;

    g.ambientFilter.frequency.setValueAtTime(g.ambientFilter.frequency.value, t);
    g.ambientFilter.frequency.exponentialRampToValueAtTime(targetFreq, t + 0.28);
    g.ambientFilter.frequency.value = targetFreq;

    g.music.gain.setValueAtTime(g.music.gain.value, t);
    g.music.gain.linearRampToValueAtTime(targetMusic, t + 0.35);
    g.music.gain.value = targetMusic;
  } catch {}
}

/** При открытии модальной справки («Страна», «Люди», окно опоры) воздух кабинета мягко приглушается */
export function setAmbientFocus(muffled: boolean) {
  sheetMuffled = muffled;
  applyBusGains();
}

/** При звонке правительственной связи ЗАС фоновые шины плавно уходят на второй план */
export function duckForCall(active: boolean) {
  isCallActive = active;
  applyBusGains();
}

// ── 4-слойный акустический воздух кабинета 1978 года (Cabinet Soundscape) ─────
// 1. Комната и маятниковые часы (тик-так раз в секунду).
// 2. Погода за двойным окном (мягкий дождь / ветер).
// 3. Эхо площади Независимости (усиливается при волнениях).
// 4. Суб-тон напряжения власти (включается, когда любая опора падает ниже 25).

export interface CabinetAudioState {
  crisis?: boolean;
  unrest?: boolean;
  season?: "winter" | "spring" | "summer" | "autumn";
  paused?: boolean;
}

interface AmbientNodes {
  ctx: AudioContext;
  masterGain: GainNode;
  humOsc: OscillatorNode;
  humSub: OscillatorNode;
  tensionOsc: OscillatorNode;
  tensionGain: GainNode;
  weatherGain: GainNode;
  weatherFilter: BiquadFilterNode;
  squareGain: GainNode;
  tapeSrc: AudioBufferSourceNode;
  clockTimer: ReturnType<typeof setInterval> | null;
}

let ambientNodes: AmbientNodes | null = null;
let cabinetState: CabinetAudioState = { crisis: false, unrest: false, season: "autumn", paused: false };
let clockBeat = 0;

function createAtmosphereLoopBuffer(a: AudioContext): AudioBuffer {
  const seconds = 5.0;
  const length = Math.ceil(a.sampleRate * seconds);
  const buf = a.createBuffer(1, length, a.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    const pink = b0 + b1 + b2 + white * 0.5362;
    // Мягкие капли дождя по оконному стеклу / шорох ленты
    const droplet = Math.random() < 0.0012 ? (Math.random() - 0.5) * 1.4 : 0;
    // Плавная кроссфейд-огибающая на краях петли, чтобы не было шва
    const edge = i < 2000 ? i / 2000 : i > length - 2000 ? (length - i) / 2000 : 1;
    data[i] = (pink * 0.048 + droplet) * edge;
  }
  return buf;
}

function playPendulumTick(a: AudioContext, dest: AudioNode) {
  if (!soundOn() || cabinetState.paused || isDocumentHidden()) return;
  try {
    const t = a.currentTime;
    const isTick = clockBeat % 2 === 0;
    clockBeat = (clockBeat + 1) % 2;

    // Деревянный корпус настенных часов Резиденции: чередование «тик» (1180 Гц) и «так» (890 Гц)
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "triangle";
    const baseFreq = isTick ? 1180 : 890;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.42, t + 0.018);

    g.gain.setValueAtTime(isTick ? 0.014 : 0.01, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);

    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.025);
  } catch {}
}

export function startCabinetAmbient() {
  if (ambientNodes || !soundOn() || typeof window === "undefined") return;
  const a = audio();
  if (!a) return;
  const g = ensureBuses();
  const dest = g?.ambient ?? a.destination;

  try {
    const masterGain = a.createGain();
    const t = a.currentTime;
    const targetMaster = (cabinetState.paused || isDocumentHidden() || !soundOn()) ? 0.0001 : 0.022;
    masterGain.gain.setValueAtTime(0.0001, t);
    if (targetMaster > 0.0001) {
      masterGain.gain.exponentialRampToValueAtTime(targetMaster, t + 1.8);
      masterGain.gain.value = targetMaster;
    } else {
      masterGain.gain.value = 0.0001;
    }
    masterGain.connect(dest);

    // 1. Сетевой воздух кабинета (52 Гц + 104 Гц)
    const humOsc = a.createOscillator();
    humOsc.type = "sine";
    humOsc.frequency.setValueAtTime(52, t);

    const humSub = a.createOscillator();
    humSub.type = "sine";
    humSub.frequency.setValueAtTime(104, t);

    const humFilter = a.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.setValueAtTime(140, t);

    const humGain = a.createGain();
    humGain.gain.setValueAtTime(0.55, t);

    humOsc.connect(humFilter);
    humSub.connect(humFilter);
    humFilter.connect(humGain).connect(masterGain);
    humOsc.start(t);
    humSub.start(t);

    // 2. Слой тревоги у порога (55 Гц + 82.5 Гц квинта, по умолчанию убрана в 0.0001)
    const tensionOsc = a.createOscillator();
    tensionOsc.type = "triangle";
    tensionOsc.frequency.setValueAtTime(55, t);

    const tensionFilter = a.createBiquadFilter();
    tensionFilter.type = "lowpass";
    tensionFilter.frequency.setValueAtTime(115, t);

    const tensionGain = a.createGain();
    tensionGain.gain.setValueAtTime(cabinetState.crisis ? 0.45 : 0.0001, t);

    tensionOsc.connect(tensionFilter).connect(tensionGain).connect(masterGain);
    tensionOsc.start(t);

    // 3. Погода за окном и воздух комнаты
    const tapeBuf = createAtmosphereLoopBuffer(a);
    const tapeSrc = a.createBufferSource();
    tapeSrc.buffer = tapeBuf;
    tapeSrc.loop = true;

    const weatherFilter = a.createBiquadFilter();
    weatherFilter.type = "bandpass";
    weatherFilter.frequency.setValueAtTime(980, t);
    weatherFilter.Q.setValueAtTime(0.7, t);

    const weatherGain = a.createGain();
    weatherGain.gain.setValueAtTime(0.45, t);

    // 4. Эхо площади за двойной рамой (низкочастотный резонанс улицы)
    const squareFilter = a.createBiquadFilter();
    squareFilter.type = "bandpass";
    squareFilter.frequency.setValueAtTime(260, t);
    squareFilter.Q.setValueAtTime(1.4, t);

    const squareGain = a.createGain();
    squareGain.gain.setValueAtTime(cabinetState.unrest ? 0.55 : 0.12, t);

    tapeSrc.connect(weatherFilter).connect(weatherGain).connect(masterGain);
    tapeSrc.connect(squareFilter).connect(squareGain).connect(masterGain);
    tapeSrc.start(t);

    // Маятниковые часы Резиденции (1 удар в секунду)
    const clockTimer = setInterval(() => playPendulumTick(a, dest), 1000);

    ambientNodes = {
      ctx: a, masterGain, humOsc, humSub, tensionOsc, tensionGain,
      weatherGain, weatherFilter, squareGain, tapeSrc, clockTimer,
    };
  } catch {
    /* WebAudio не разрешён или не полностью поддерживается средой */
  }
}

/** Обновляет динамические слои воздуха кабинета по состоянию опор и сезону квартала */
export function updateCabinetState(next: CabinetAudioState) {
  cabinetState = { ...cabinetState, ...next };
  if (!ambientNodes) return;
  try {
    const { ctx: a, masterGain, tensionGain, squareGain, weatherFilter, weatherGain } = ambientNodes;
    const t = a.currentTime;

    const targetMaster = (cabinetState.paused || isDocumentHidden() || !soundOn()) ? 0.0001 : 0.022;
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(targetMaster, t + 0.25);
    masterGain.gain.value = targetMaster;

    tensionGain.gain.setValueAtTime(tensionGain.gain.value, t);
    tensionGain.gain.linearRampToValueAtTime(cabinetState.crisis ? 0.48 : 0.0001, t + 1.2);

    squareGain.gain.setValueAtTime(squareGain.gain.value, t);
    squareGain.gain.linearRampToValueAtTime(cabinetState.unrest ? 0.58 : 0.12, t + 1.2);

    const seasonFreq = cabinetState.season === "winter" ? 620
      : cabinetState.season === "autumn" ? 1150
      : cabinetState.season === "spring" ? 1050 : 880;
    const seasonGain = cabinetState.season === "autumn" || cabinetState.season === "winter" ? 0.52 : 0.36;
    weatherFilter.frequency.setValueAtTime(weatherFilter.frequency.value, t);
    weatherFilter.frequency.linearRampToValueAtTime(seasonFreq, t + 1.5);
    weatherGain.gain.setValueAtTime(weatherGain.gain.value, t);
    weatherGain.gain.linearRampToValueAtTime(seasonGain, t + 1.5);
  } catch {}
}

export function stopCabinetAmbient() {
  if (!ambientNodes) return;
  try {
    const { ctx: a, masterGain, humOsc, humSub, tensionOsc, tapeSrc, clockTimer } = ambientNodes;
    if (clockTimer) clearInterval(clockTimer);
    ambientNodes = null;
    const t = a.currentTime;
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    setTimeout(() => {
      try {
        humOsc.stop();
        humSub.stop();
        tensionOsc.stop();
        tapeSrc.stop();
        masterGain.disconnect();
      } catch {}
    }, 600);
  } catch {
    ambientNodes = null;
  }
}

// ── Камерная музыкальная тема Резиденции 1978 (Felt Piano & Analog Strings) ──

let titleTimer: ReturnType<typeof setInterval> | null = null;
let titleStep = 0;
// Меланхоличная восточноевропейская секвенция в ре-миноре (D2, A2, F3, E3, D3, C3, Bb2, A2)
const TITLE_NOTES = [73.42, 110.0, 174.61, 164.81, 146.83, 130.81, 116.54, 110.0];

function playFeltPianoNote(a: AudioContext, freq: number, dest: AudioNode) {
  try {
    const t = a.currentTime;
    const osc = a.createOscillator();
    const sub = a.createOscillator();
    const filter = a.createBiquadFilter();
    const g = a.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    sub.type = "sine";
    sub.frequency.setValueAtTime(freq * 2, t);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(160, t + 2.8);

    const subGain = a.createGain();
    subGain.gain.setValueAtTime(0.18, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.032, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

    osc.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(g).connect(dest);

    osc.start(t);
    sub.start(t);
    osc.stop(t + 3.3);
    sub.stop(t + 3.3);
  } catch {}
}

export function startTitleTheme() {
  if (titleTimer || !soundOn() || typeof window === "undefined" || isDocumentHidden()) return;
  const a = audio();
  if (!a) return;
  const dest = ensureBuses()?.music ?? a.destination;
  titleStep = 0;
  playFeltPianoNote(a, TITLE_NOTES[0], dest);
  titleTimer = setInterval(() => {
    if (!soundOn() || isDocumentHidden()) return;
    const ctxNow = audio();
    if (!ctxNow) return;
    titleStep = (titleStep + 1) % TITLE_NOTES.length;
    playFeltPianoNote(ctxNow, TITLE_NOTES[titleStep], ensureBuses()?.music ?? ctxNow.destination);
  }, 2600);
}

export function stopTitleTheme() {
  if (titleTimer) {
    clearInterval(titleTimer);
    titleTimer = null;
  }
}

// ── 1. Главный звук: трёхфазная гербовая печать президента (`stampFx`) ───────
// Фаза 1 (0–30 мс): нажатие латунной оснастки и пружины.
// Фаза 2 (30–145 мс): плотный глухой удар штампа в дубовый стол + хруст бумаги.
// Фаза 3 (145–290 мс): короткий росчерк пера и возврат пружины.

export function stampFx() {
  haptic("heavy");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("stamp", 0.04);
    const t = a.currentTime;

    // Фаза 1: металлический щелчок оснастки
    const spring = a.createOscillator();
    const springGain = a.createGain();
    spring.type = "triangle";
    spring.frequency.setValueAtTime(980 * ratio, t);
    spring.frequency.exponentialRampToValueAtTime(320 * ratio, t + 0.025);
    springGain.gain.setValueAtTime(0.14 * gainMul, t);
    springGain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
    spring.connect(springGain).connect(dest);
    spring.start(t);
    spring.stop(t + 0.03);

    // Фаза 2: глухой удар гербовой печати в дубовый стол
    const impactAt = t + 0.024;
    const bodyOsc = a.createOscillator();
    const bodyGain = a.createGain();
    bodyOsc.type = "sine";
    bodyOsc.frequency.setValueAtTime(148 * ratio, impactAt);
    bodyOsc.frequency.exponentialRampToValueAtTime(42 * ratio, impactAt + 0.13);
    bodyGain.gain.setValueAtTime(0.58 * gainMul, impactAt);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, impactAt + 0.17);
    bodyOsc.connect(bodyGain).connect(dest);
    bodyOsc.start(impactAt);
    bodyOsc.stop(impactAt + 0.18);

    // Фактура прижатой гербовой бумаги
    const crunch = noiseBuffer(a, 0.085, 2.2);
    const crunchFilter = a.createBiquadFilter();
    crunchFilter.type = "bandpass";
    crunchFilter.frequency.setValueAtTime(1650 * ratio, impactAt);
    crunchFilter.Q.setValueAtTime(1.1, impactAt);
    const crunchGain = a.createGain();
    crunchGain.gain.setValueAtTime(0.26 * gainMul, impactAt);
    crunch.connect(crunchFilter).connect(crunchGain).connect(dest);
    crunch.start(impactAt);

    // Фаза 3: короткий росчерк пера и отпускание оснастки
    const nibAt = t + 0.15;
    const nib = noiseBuffer(a, 0.09, 1.6);
    const nibFilter = a.createBiquadFilter();
    nibFilter.type = "bandpass";
    nibFilter.frequency.setValueAtTime(3400 * ratio, nibAt);
    nibFilter.Q.setValueAtTime(2.2, nibAt);
    const nibGain = a.createGain();
    nibGain.gain.setValueAtTime(0.09 * gainMul, nibAt);
    nib.connect(nibFilter).connect(nibGain).connect(dest);
    nib.start(nibAt);
  } catch {}
}

// ── 2. Росчерк перьевой ручки (`penScratchFx`) — анкета ЦИК, подпись ─────────

export function penScratchFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("pen", 0.05);
    const t = a.currentTime;

    for (const [offset, dur, freq] of [[0, 0.065, 3200], [0.075, 0.085, 3600]] as const) {
      const start = t + offset;
      const n = noiseBuffer(a, dur, 1.5);
      const f = a.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(freq * ratio, start);
      f.Q.setValueAtTime(2.5, start);
      const g = a.createGain();
      g.gain.setValueAtTime(0.11 * gainMul, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      n.connect(f).connect(g).connect(dest);
      n.start(start);
    }
  } catch {}
}

// ── 3. Перелистывание и работа с документами (`pageFx`, `folderDropFx`) ──────

export function pageFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("page", 0.05);
    const t = a.currentTime;
    const n = noiseBuffer(a, 0.21, 1.9);
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(2200 * ratio, t);
    f.frequency.exponentialRampToValueAtTime(1400 * ratio, t + 0.2);
    f.Q.setValueAtTime(0.9, t);
    const g = a.createGain();
    g.gain.setValueAtTime(0.13 * gainMul, t);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
  } catch {}
}

/** Звук увесистой картонной папки с делом, которую положили на дубовый стол */
export function folderDropFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("folder", 0.04);
    const t = a.currentTime;

    // Мягкий глухой удар картона о сукно стола
    const thud = a.createOscillator();
    const thudGain = a.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(115 * ratio, t);
    thud.frequency.exponentialRampToValueAtTime(48 * ratio, t + 0.09);
    thudGain.gain.setValueAtTime(0.22 * gainMul, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    thud.connect(thudGain).connect(dest);
    thud.start(t);
    thud.stop(t + 0.12);

    // Скольжение листов внутри папки
    const slide = noiseBuffer(a, 0.15, 1.8);
    const slideFilter = a.createBiquadFilter();
    slideFilter.type = "bandpass";
    slideFilter.frequency.setValueAtTime(1500 * ratio, t + 0.02);
    const slideGain = a.createGain();
    slideGain.gain.setValueAtTime(0.11 * gainMul, t + 0.02);
    slide.connect(slideFilter).connect(slideGain).connect(dest);
    slide.start(t + 0.02);
  } catch {}
}

/** Выбор варианта резолюции (прикосновение к листу и сухой щелчок) */
export function optionArmFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("arm", 0.04);
    const t = a.currentTime;

    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520 * ratio, t);
    osc.frequency.exponentialRampToValueAtTime(180 * ratio, t + 0.032);
    g.gain.setValueAtTime(0.09 * gainMul, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.04);

    const tap = noiseBuffer(a, 0.045, 2.4);
    const tapFilter = a.createBiquadFilter();
    tapFilter.type = "bandpass";
    tapFilter.frequency.setValueAtTime(2100 * ratio, t);
    const tapGain = a.createGain();
    tapGain.gain.setValueAtTime(0.07 * gainMul, t);
    tap.connect(tapFilter).connect(tapGain).connect(dest);
    tap.start(t);
  } catch {}
}

// ── 4. Микро-акустика типов строк «Хроники срока» (`chronicleLineFx`) ────────

/** Разворот утреннего номера газеты и удар типографской литеры */
export function newspaperFx() {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("news", 0.04);
    const t = a.currentTime;

    // Широкий шорох газетного разворота
    const rustle = noiseBuffer(a, 0.24, 1.5);
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(2600 * ratio, t);
    f.frequency.linearRampToValueAtTime(1700 * ratio, t + 0.22);
    const g = a.createGain();
    g.gain.setValueAtTime(0.1 * gainMul, t);
    rustle.connect(f).connect(g).connect(dest);
    rustle.start(t);

    // Одиночный удар литеры печатной машинки
    const key = a.createOscillator();
    const kg = a.createGain();
    key.type = "triangle";
    key.frequency.setValueAtTime(1350 * ratio, t + 0.04);
    key.frequency.exponentialRampToValueAtTime(280 * ratio, t + 0.07);
    kg.gain.setValueAtTime(0.065 * gainMul, t + 0.04);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    key.connect(kg).connect(dest);
    key.start(t + 0.04);
    key.stop(t + 0.08);
  } catch {}
}

/** Скольжение конверта или доклада по сукну стола */
export function envelopeFx() {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("env", 0.04);
    const t = a.currentTime;
    const n = noiseBuffer(a, 0.14, 1.7);
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(1950 * ratio, t);
    f.Q.setValueAtTime(1.4, t);
    const g = a.createGain();
    g.gain.setValueAtTime(0.085 * gainMul, t);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
  } catch {}
}

/** Деликатный двойной стук секретаря в деревянную дверь приёмной */
export function doorKnockFx() {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("door", 0.03);
    const t = a.currentTime;
    for (const [offset, pitch, amp] of [[0, 175, 0.14], [0.11, 198, 0.11]] as const) {
      const start = t + offset;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitch * ratio, start);
      osc.frequency.exponentialRampToValueAtTime(68 * ratio, start + 0.055);
      g.gain.setValueAtTime(amp * gainMul, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.065);
      osc.connect(g).connect(dest);
      osc.start(start);
      osc.stop(start + 0.07);
    }
  } catch {}
}

/** Глубокий приглушённый обертон памяти («Отклик прежних решений») */
export function echoChimeFx() {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("echo", 0.02);
    const t = a.currentTime;
    const osc = a.createOscillator();
    const filter = a.createBiquadFilter();
    const g = a.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220 * ratio, t);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(480, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.055 * gainMul, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.68);
  } catch {}
}

/** Сводка квартала (костяшки счётов + тревожный камертон при опасном пороге) */
export function ledgerFx(danger = false) {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("ledger", 0.03);
    const t = a.currentTime;

    // Двойной сухой щелчок деревянных счётов / перекидного календаря
    for (const [offset, freq] of [[0, 1420], [0.055, 1680]] as const) {
      const start = t + offset;
      const bead = a.createOscillator();
      const bg = a.createGain();
      bead.type = "triangle";
      bead.frequency.setValueAtTime(freq * ratio, start);
      bead.frequency.exponentialRampToValueAtTime(380 * ratio, start + 0.025);
      bg.gain.setValueAtTime(0.075 * gainMul, start);
      bg.gain.exponentialRampToValueAtTime(0.001, start + 0.028);
      bead.connect(bg).connect(dest);
      bead.start(start);
      bead.stop(start + 0.03);
    }

    if (danger) {
      haptic("error");
      const warn = a.createOscillator();
      const wg = a.createGain();
      warn.type = "sine";
      warn.frequency.setValueAtTime(110, t + 0.08);
      warn.frequency.exponentialRampToValueAtTime(82.4, t + 0.55);
      wg.gain.setValueAtTime(0.11, t + 0.08);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
      warn.connect(wg).connect(dest);
      warn.start(t + 0.08);
      warn.stop(t + 0.6);
    }
  } catch {}
}

/** Падение власти — глухой удар остановившихся часов */
export function powerFallFx() {
  haptic("error");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const t = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(98, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.85);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.92);
  } catch {}
}

/** Едва слышный бархатный шелест строки при чтении прозы (не чаще раза в 180 мс) */
export function proseWhisperFx() {
  const now = Date.now();
  if (now - lastProseAt < 180) return;
  lastProseAt = now;
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("prose", 0.05);
    const t = a.currentTime;
    const n = noiseBuffer(a, 0.055, 2.2);
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(1450 * ratio, t);
    f.Q.setValueAtTime(1.2, t);
    const g = a.createGain();
    g.gain.setValueAtTime(0.032 * gainMul, t);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
  } catch {}
}

/** Умный диспетчер звука для строки «Хроники срока» по её типу (`line.kind`) */
export function chronicleLineFx(kind: string, text = "") {
  switch (kind) {
    case "paper":
    case "press":
      newspaperFx();
      break;
    case "letter":
    case "report":
      envelopeFx();
      break;
    case "secretary":
      doorKnockFx();
      break;
    case "echo":
      echoChimeFx();
      break;
    case "ledger":
      ledgerFx(text.includes("Опасно мало:"));
      break;
    case "fall":
      powerFallFx();
      break;
    case "signed":
      penScratchFx();
      break;
    case "speech":
    case "voice":
      proseWhisperFx();
      break;
    default:
      proseWhisperFx();
      break;
  }
}

// ── 5. Спецрежимы: правительственная «Вертушка» ЗАС, Совет, Пресса, Карта ────

export function outcomeFx(success: boolean) {
  haptic(success ? "success" : "error");
}

/** Двойной электромеханический звонок правительственного аппарата ЗАС */
export function telephoneFx() {
  haptic("light");
  duckForCall(true);
  const context = audio();
  if (!context) return;
  try {
    const dest = sfxDestination(context);
    const { ratio } = nextVariation("phone", 0.02);
    for (const offset of [0, 0.16]) {
      const start = context.currentTime + offset;
      const osc1 = context.createOscillator();
      const osc2 = context.createOscillator();
      const gain = context.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(920 * ratio, start);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1380 * ratio, start);
      gain.gain.setValueAtTime(0.042, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.125);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(dest);
      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + 0.13);
      osc2.stop(start + 0.13);
    }
  } catch {}
}

/** Снятие/опускание тяжёлой эбонитовой трубки телефона */
export function handsetFx(lift = true) {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const t = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(lift ? 240 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(lift ? 420 : 65, t + 0.06);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.075);
    duckForCall(lift);
  } catch {}
}

/** Созыв Совета при президенте — мягкий селекторный зуммер и шорох бумаг */
export function councilBellFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const t = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.setValueAtTime(440.0, t + 0.09); // A4
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch {}
}

/** Щелчок репортёрского фотоаппарата и заряд вспышки на пресс-конференции */
export function pressFlashFx() {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const t = a.currentTime;
    // Затвор зеркальной камеры
    const shutter = noiseBuffer(a, 0.045, 2.5);
    const sf = a.createBiquadFilter();
    sf.type = "bandpass";
    sf.frequency.setValueAtTime(2800, t);
    const sg = a.createGain();
    sg.gain.setValueAtTime(0.14, t);
    shutter.connect(sf).connect(sg).connect(dest);
    shutter.start(t);

    // Высокочастотный писк заряда конденсатора вспышки
    const whine = a.createOscillator();
    const wg = a.createGain();
    whine.type = "sine";
    whine.frequency.setValueAtTime(2400, t + 0.05);
    whine.frequency.exponentialRampToValueAtTime(5200, t + 0.38);
    wg.gain.setValueAtTime(0.018, t + 0.05);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    whine.connect(wg).connect(dest);
    whine.start(t + 0.05);
    whine.stop(t + 0.42);
  } catch {}
}

/** Раскрытие карты республики или справочного досье («Страна», «Люди») */
export function mapUnfoldFx(open = true) {
  haptic("light");
  setAmbientFocus(open);
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("map", 0.04);
    const t = a.currentTime;
    const n = noiseBuffer(a, 0.18, 1.6);
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime((open ? 1600 : 2100) * ratio, t);
    f.frequency.exponentialRampToValueAtTime((open ? 2300 : 1300) * ratio, t + 0.16);
    const g = a.createGain();
    g.gain.setValueAtTime(0.1 * gainMul, t);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
  } catch {}
}

// ── 6. Атмосфера грозы на титуле и советские тумблеры (`thunderFx`, `clickFx`)

export function thunderFx() {
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("thunder", 0.08);
    const t = a.currentTime;
    const duration = 2.6;
    const n = noiseBuffer(a, duration, 1.6);
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(140 * ratio, t);
    f.frequency.linearRampToValueAtTime(48 * ratio, t + duration);
    const g = a.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.24 * gainMul, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    n.connect(f).connect(g).connect(dest);
    n.start(t);
  } catch {}
}

export function clickFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const dest = sfxDestination(a);
    const { ratio, gainMul } = nextVariation("click", 0.045);
    const t = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(760 * ratio, t);
    osc.frequency.exponentialRampToValueAtTime(145 * ratio, t + 0.035);
    g.gain.setValueAtTime(0.1 * gainMul, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {}
}
