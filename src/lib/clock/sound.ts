// Toques do Vertal Clock, sintetizados com Web Audio (sem arquivos de áudio).
//
// Navegadores só liberam som depois de um gesto do usuário na página. Por isso
// `unlockAudio` fica ligado ao primeiro toque/clique; se o alarme disparar antes
// disso, ele aparece na tela (e na notificação) mesmo sem som.
import type { AlarmSound } from './store';

let ctx: AudioContext | null = null;
let loop: ReturnType<typeof setInterval> | null = null;
let stopAt: ReturnType<typeof setTimeout> | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Chame em um gesto do usuário para o navegador liberar o som. */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

let unlockInstalled = false;

/** Libera o som no primeiro toque ou tecla em qualquer lugar da página. */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

function beep(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, peak: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Um ciclo do toque; devolve a duração do ciclo em ms. */
function pattern(c: AudioContext, sound: AlarmSound): number {
  const t = c.currentTime + 0.02;
  if (sound === 'digital') {
    for (let i = 0; i < 4; i++) beep(c, t + i * 0.12, 1760, 0.08, 'square', 0.12);
    return 1000;
  }
  if (sound === 'gentle') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(c, t + i * 0.28, f, 0.6, 'sine', 0.22));
    return 2000;
  }
  beep(c, t, 880, 0.18, 'triangle', 0.3);
  beep(c, t + 0.25, 880, 0.18, 'triangle', 0.3);
  return 1000;
}

export function stopAlarmSound(): void {
  if (loop) clearInterval(loop);
  if (stopAt) clearTimeout(stopAt);
  loop = null;
  stopAt = null;
}

/** Toca em repetição até `stopAlarmSound` (ou até `maxMs`). */
export function startAlarmSound(sound: AlarmSound, maxMs = 60_000): void {
  stopAlarmSound();
  const c = audio();
  if (!c) return;
  unlockAudio();
  const every = pattern(c, sound);
  loop = setInterval(() => {
    if (c.state === 'running') pattern(c, sound);
  }, every);
  stopAt = setTimeout(stopAlarmSound, maxMs);
}

/** Toca um ciclo só, para o usuário ouvir o toque que escolheu. */
export function previewAlarmSound(sound: AlarmSound): void {
  const c = audio();
  if (!c) return;
  unlockAudio();
  pattern(c, sound);
}

/** Solicita permissão de notificações ao navegador. */
export async function requestClockNotifications(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  return Notification.requestPermission();
}
