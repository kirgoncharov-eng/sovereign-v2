// Звук и тактильный отклик. Звуки синтезируются WebAudio — никаких файлов.
// Играют только после действия игрока, выключаются одной настройкой.
import { haptic } from "./telegram.ts";

const KEY = "sovereign.sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}
export function setSound(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* недоступно */ }
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
