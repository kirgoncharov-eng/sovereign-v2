// Звук и тактильный отклик. Звуки синтезируются WebAudio — никаких файлов.
// Играют только после действия игрока, выключаются одной настройкой.
import { haptic } from "./telegram.ts";

const KEY = "sovereign.sound";
let memorySound = true;
let ctx: AudioContext | null = null;

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
    stopCabinetAmbient();
  } else {
    startCabinetAmbient();
  }
}

function audio(): AudioContext | null {
  if (!soundOn() || typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noise(a: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  return src;
}

// Фоновый акустический воздух кабинета 1978 года (0 байт, процедурный синтез WebAudio):
// 1. Мягкий низкий гул сетевого трансформатора и лампы (~52 Гц с узким режекторным фильтром).
// 2. Еле уловимый шорох/потрескивание ленты (розовый шум с фильтром высоких частот).
// Громкость очень деликатная (фоновые 0.015), не мешает чтению и включается плавно после первого действия.
interface AmbientNodes {
  ctx: AudioContext;
  masterGain: GainNode;
  humOsc: OscillatorNode;
  humSub: OscillatorNode;
  tapeSrc: AudioBufferSourceNode;
}
let ambientNodes: AmbientNodes | null = null;

function createTapeLoopBuffer(a: AudioContext): AudioBuffer {
  const seconds = 4.0;
  const length = Math.ceil(a.sampleRate * seconds);
  const buf = a.createBuffer(1, length, a.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // Мягкий 3-полюсный розовый шум (pink noise)
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    const pink = b0 + b1 + b2 + white * 0.5362;
    // Редкие микро-всплески (треск магнитной ленты)
    const crackle = Math.random() < 0.0008 ? (Math.random() - 0.5) * 1.8 : 0;
    data[i] = (pink * 0.05 + crackle);
  }
  return buf;
}

export function startCabinetAmbient() {
  if (ambientNodes || !soundOn() || typeof window === "undefined") return;
  const a = audio();
  if (!a) return;

  try {
    const masterGain = a.createGain();
    const t = a.currentTime;
    // Плавный fade-in за 1.8 секунды, чтобы не пугать при клике
    masterGain.gain.setValueAtTime(0.0001, t);
    masterGain.gain.exponentialRampToValueAtTime(0.018, t + 1.8);
    masterGain.connect(a.destination);

    // 1. Сетевой гул кабинета: 52 Гц + 104 Гц гармоника
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
    humGain.gain.setValueAtTime(0.7, t);

    humOsc.connect(humFilter);
    humSub.connect(humFilter);
    humFilter.connect(humGain).connect(masterGain);

    humOsc.start(t);
    humSub.start(t);

    // 2. Воздух магнитной ленты / эфира
    const tapeBuf = createTapeLoopBuffer(a);
    const tapeSrc = a.createBufferSource();
    tapeSrc.buffer = tapeBuf;
    tapeSrc.loop = true;

    const tapeFilter = a.createBiquadFilter();
    tapeFilter.type = "bandpass";
    tapeFilter.frequency.setValueAtTime(1100, t);
    tapeFilter.Q.setValueAtTime(0.8, t);

    const tapeGain = a.createGain();
    tapeGain.gain.setValueAtTime(0.4, t);

    tapeSrc.connect(tapeFilter).connect(tapeGain).connect(masterGain);
    tapeSrc.start(t);

    ambientNodes = { ctx: a, masterGain, humOsc, humSub, tapeSrc };
  } catch {
    /* WebAudio не разрешён или отключен */
  }
}

export function stopCabinetAmbient() {
  if (!ambientNodes) return;
  try {
    const { ctx: a, masterGain, humOsc, humSub, tapeSrc } = ambientNodes;
    ambientNodes = null;
    const t = a.currentTime;
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    setTimeout(() => {
      try {
        humOsc.stop();
        humSub.stop();
        tapeSrc.stop();
        masterGain.disconnect();
      } catch {
        /* уже остановлен */
      }
    }, 700);
  } catch {
    ambientNodes = null;
  }
}

// Удар печати: глухой низкий толчок и короткий шорох бумаги.
export function stampFx() {
  haptic("heavy");
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  osc.connect(g).connect(a.destination);
  osc.start(t); osc.stop(t + 0.17);
  const n = noise(a, 0.07);
  const f = a.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 1800;
  const ng = a.createGain(); ng.gain.value = 0.25;
  n.connect(f).connect(ng).connect(a.destination);
  n.start(t);
}

// Перелистывание: лёгкий шорох при переходе к следующему документу.
export function pageFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  const n = noise(a, 0.22);
  const f = a.createBiquadFilter();
  f.type = "highpass"; f.frequency.value = 2500;
  const g = a.createGain(); g.gain.value = 0.12;
  n.connect(f).connect(g).connect(a.destination);
  n.start();
}

export function outcomeFx(success: boolean) {
  haptic(success ? "success" : "error");
}

// Короткий механический звонок; только при поднятии трубки самим игроком.
export function telephoneFx() {
  const context = audio();
  if (!context) return;
  for (const offset of [0, 0.16]) {
    const start = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 920;
    gain.gain.setValueAtTime(0.035, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start); oscillator.stop(start + 0.13);
  }
}

// Далёкий раскат грома: низкочастотный рокот для атмосферы грозы за окном.
export function thunderFx() {
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime;
    const duration = 2.4;
    const n = noise(a, duration);
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(130, t);
    f.frequency.linearRampToValueAtTime(55, t + duration);
    const g = a.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    n.connect(f).connect(g).connect(a.destination);
    n.start(t);
  } catch {}
}

// Тактильный щелчок советского переключателя/тумблера.
export function clickFx() {
  haptic("light");
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(750, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.035);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {}
}

