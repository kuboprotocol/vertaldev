// Toques do Vertal Clock: gravações reais (public/sounds/clock, créditos em CREDITS.md)
// e os sons que o usuário enviou do aparelho (tocados de um arquivo no IndexedDB).
//
// Navegadores só liberam som depois de um gesto do usuário na página. Por isso
// `unlockAudio` fica ligado ao primeiro toque/clique; se o alarme disparar antes
// disso, ele aparece na tela (e na notificação) mesmo sem som.
import { getSoundFile } from './soundFiles';
import { customSoundId, isBuiltinSound, type AlarmSound, type BuiltinSound } from './store';

let ctx: AudioContext | null = null;
let loop: ReturnType<typeof setInterval> | null = null;
let stopAt: ReturnType<typeof setTimeout> | null = null;
/** Saída do toque atual: desligá-la cala na hora as notas já agendadas. */
let out: GainNode | null = null;
let media: HTMLAudioElement | null = null;
let mediaUrl = '';
/** Muda a cada tocar/parar: um arquivo que termina de carregar depois disso não toca. */
let turn = 0;
let alarmActive = false;

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

const sink = (c: AudioContext): AudioNode => out ?? c.destination;

/** Nota percussiva: ataque rápido e queda até o silêncio. `to` desliza a altura. */
function beep(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, peak: number, to?: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(sink(c));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Pausa entre repetições de cada gravação, em ms: o galo canta, respira e canta de novo. */
const GAP_MS: Record<BuiltinSound, number> = {
  classic: 600, vintage: 600, ring: 500, digital: 300, rooster: 1500, rooster2: 1500, birds: 0, cuckoo: 0,
  bell: 0, phone: 800, bugle: 1500, gentle: 0, chime: 0, musicbox: 800, harp: 1200, sea: 0,
};

/** Endereço das gravações. Um site que embute o relógio pode apontar para outra origem. */
function soundBase(): string {
  const custom = (globalThis as { VERTAL_CLOCK_SOUND_BASE?: unknown }).VERTAL_CLOCK_SOUND_BASE;
  return typeof custom === 'string' && custom ? custom.replace(/\/?$/, '/') : '/sounds/clock/';
}

export const builtinSoundUrl = (sound: BuiltinSound): string => `${soundBase()}${sound}.mp3`;

/** Plano B, sem rede: dois bipes sintetizados, para o alarme nunca ficar mudo. */
function fallbackBeep(c: AudioContext): number {
  const t = c.currentTime + 0.02;
  beep(c, t, 880, 0.18, 'triangle', 0.3);
  beep(c, t + 0.25, 880, 0.18, 'triangle', 0.3);
  return 1000;
}

function silence(): void {
  turn++;
  if (loop) clearInterval(loop);
  if (stopAt) clearTimeout(stopAt);
  loop = null;
  stopAt = null;
  if (out) {
    try {
      out.disconnect();
    } catch {
      /* já desligada */
    }
    out = null;
  }
  if (media) {
    media.pause();
    media.removeAttribute('src');
    media = null;
  }
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = '';
}

function playFallback(repeat: boolean, mine: number): void {
  const c = audio();
  if (!c || mine !== turn) return;
  unlockAudio();
  out = c.createGain();
  out.connect(c.destination);
  const every = fallbackBeep(c);
  if (repeat) {
    loop = setInterval(() => {
      if (c.state === 'running') fallbackBeep(c);
    }, every);
  }
}

const buffers = new Map<string, Promise<AudioBuffer>>();
/** Músicas enviadas podem ser grandes: guarda só as últimas decodificadas. */
const MAX_CUSTOM_BUFFERS = 3;

function remember(key: string, pending: Promise<AudioBuffer>): Promise<AudioBuffer> {
  pending.catch(() => buffers.delete(key)); // tenta de novo na próxima vez
  buffers.set(key, pending);
  const customs = [...buffers.keys()].filter((k) => k.startsWith('custom:'));
  if (customs.length > MAX_CUSTOM_BUFFERS) buffers.delete(customs[0]);
  return pending;
}

/** Baixa e decodifica a gravação uma vez; as próximas vezes saem da memória (e do cache do service worker). */
function loadBuiltin(c: AudioContext, sound: BuiltinSound): Promise<AudioBuffer> {
  return buffers.get(sound) ?? remember(sound, fetch(builtinSoundUrl(sound))
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => c.decodeAudioData(data)));
}

/** Lê o arquivo enviado do IndexedDB e decodifica (MP3, M4A, WAV, OGG... o que o navegador souber abrir). */
function loadCustom(c: AudioContext, id: string): Promise<AudioBuffer> {
  const key = `custom:${id}`;
  return buffers.get(key) ?? remember(key, getSoundFile(id).then(async (blob) => {
    if (!blob) throw new Error('som apagado');
    return c.decodeAudioData(await blob.arrayBuffer());
  }));
}

/** Deixa a gravação pronta antes do alarme tocar (chamar ao escolher o toque ou agendar um alarme). */
export function preloadAlarmSound(sound: AlarmSound): void {
  const c = audio();
  if (!c) return;
  const custom = customSoundId(sound);
  if (custom) void loadCustom(c, custom).catch(() => undefined);
  else if (isBuiltinSound(sound)) void loadBuiltin(c, sound).catch(() => undefined);
}

/** Duração de cada "toque" do alarme, em segundos. Cada toque embutido ocupa exatamente este tempo. */
export const CLIP_SECONDS = 15;

/**
 * Onde começa cada repetição de uma gravação dentro de uma unidade de `unitSec` segundos.
 * Uma gravação que não cabe inteira no fim da unidade não entra (o galo não é cortado no meio
 * do canto); uma gravação maior que a unidade é cortada na própria unidade.
 */
export function clipOffsets(durSec: number, unitSec: number, gapSec: number): number[] {
  const offsets: number[] = [];
  if (!(durSec > 0) || !(unitSec > 0)) return offsets;
  for (let off = 0; off < unitSec - 0.01; off += durSec + gapSec) {
    if (off > 0 && off + durSec > unitSec) break;
    offsets.push(off);
  }
  return offsets;
}

/**
 * Agenda `times` unidades de `unitSec` segundos, uma depois da outra, com o áudio decodificado.
 * Toque embutido: cada unidade tem 15 s e a gravação repete dentro dela. Arquivo enviado:
 * a unidade é a própria música (gapSec = 0).
 */
function playBuffer(c: AudioContext, buffer: AudioBuffer, times: number, unitSec: number, gapSec: number): void {
  out = c.createGain();
  out.connect(c.destination);
  const gain = out;
  const start = c.currentTime + 0.02;
  const offsets = clipOffsets(buffer.duration, unitSec, gapSec);
  for (let n = 0; n < times; n++) {
    for (const off of offsets) {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(start + n * unitSec + off, 0, Math.min(buffer.duration, unitSec - off));
    }
  }
}

/**
 * Toca a gravação pelo Web Audio (o mesmo contexto liberado no primeiro toque, então
 * funciona quando o alarme dispara sozinho). Em repetição: toca, espera a pausa do toque e recomeça.
 */
async function playBuiltin(sound: BuiltinSound, times: number, mine: number): Promise<boolean> {
  const c = audio();
  if (!c) return false;
  unlockAudio();
  let buffer: AudioBuffer;
  try {
    buffer = await loadBuiltin(c, sound);
  } catch {
    return mine !== turn;
  }
  if (mine !== turn) return true;
  playBuffer(c, buffer, times, CLIP_SECONDS, GAP_MS[sound] / 1000);
  return true;
}

/**
 * Toca o arquivo enviado pelo usuário. Primeiro pelo Web Audio (funciona quando o alarme
 * dispara sozinho, sem toque na tela); se o navegador não decodificar o formato, tenta o
 * player de mídia. Devolve false se não deu (arquivo apagado, formato não suportado, som bloqueado).
 */
async function playFile(id: string, times: number, mine: number): Promise<boolean> {
  const c = audio();
  if (c) {
    unlockAudio();
    try {
      const buffer = await loadCustom(c, id);
      if (mine === turn) playBuffer(c, buffer, times, buffer.duration, 0);
      return true;
    } catch {
      if (mine !== turn) return true;
    }
  }
  const blob = await getSoundFile(id);
  if (!blob || mine !== turn) return mine !== turn;
  try {
    mediaUrl = URL.createObjectURL(blob);
    media = new Audio(mediaUrl);
    // Plano B sem Web Audio: toca de novo a cada fim, até completar `times` vezes.
    let left = times;
    media.onended = () => {
      left -= 1;
      if (left > 0 && mine === turn && media) {
        media.currentTime = 0;
        void media.play().catch(() => undefined);
      }
    };
    await media.play();
    return true;
  } catch {
    return mine !== turn;
  }
}

/** Esquece o áudio decodificado de um som enviado que foi removido. */
export function forgetCustomSound(id: string): void {
  buffers.delete(`custom:${id}`);
}

function play(sound: AlarmSound, times: number, maxMs: number, alarm: boolean): void {
  silence();
  const mine = turn;
  const custom = customSoundId(sound);
  // Se o arquivo não tocar (apagado, sem rede, formato), o alarme não fica mudo: cai no bipe.
  const started = custom ? playFile(custom, times, mine) : playBuiltin(isBuiltinSound(sound) ? sound : 'classic', times, mine);
  void started.then((ok) => {
    if (!ok && mine === turn) {
      if (media) {
        media.pause();
        media = null;
      }
      playFallback(alarm, mine);
    }
  });
  stopAt = setTimeout(() => {
    alarmActive = false;
    silence();
  }, maxMs);
}

export function stopAlarmSound(): void {
  alarmActive = false;
  silence();
}

/**
 * Toca o alarme `times` vezes (1, 2, 3, 4, 5 ou 10; cada vez é um toque de 15 s para toque embutido,
 * ou a música inteira para arquivo enviado). Depois disso fica em silêncio até `stopAlarmSound`.
 */
export function startAlarmSound(sound: AlarmSound, times = 1): void {
  alarmActive = true;
  const n = Math.max(1, Math.round(times));
  // Limite de segurança: o áudio agendado termina sozinho; isto só impede um arquivo travado de tocar para sempre.
  const cap = customSoundId(sound) ? n * 600_000 : n * CLIP_SECONDS * 1000 + 1000;
  play(sound, n, cap, true);
}

/** Toca uma amostra (um toque de 15 s) para o usuário ouvir o que escolheu. */
export function previewAlarmSound(sound: AlarmSound): void {
  if (alarmActive) return; // não cala um alarme que está tocando
  play(sound, 1, CLIP_SECONDS * 1000, false);
}

/** Para a amostra (ao fechar a folha, por exemplo). Não mexe em alarme tocando. */
export function stopSoundPreview(): void {
  if (!alarmActive) silence();
}
