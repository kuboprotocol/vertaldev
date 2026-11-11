// Toques do Vertal Clock: 21 embutidos, sintetizados com Web Audio (sem arquivos),
// mais os sons que o usuário enviou do aparelho (tocados de um arquivo no IndexedDB).
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

/** Nota sustentada (sopro, sirene, campainha): mantém o volume até o fim. */
function hold(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, peak: number, to?: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.linearRampToValueAtTime(to, at + dur);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.025);
  gain.gain.setValueAtTime(peak, at + Math.max(0.03, dur - 0.04));
  gain.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(gain).connect(sink(c));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Sequência de notas iguais: [instante, frequência]. */
function seq(c: AudioContext, t: number, notes: [number, number][], dur: number, type: OscillatorType, peak: number): void {
  for (const [at, freq] of notes) beep(c, t + at, freq, dur, type, peak);
}

/** Canto do galo: "co-co-ri-cóóó", uma voz serrilhada passando por um filtro nasal. */
function rooster(c: AudioContext, t: number): void {
  const osc = c.createOscillator();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  const vibrato = c.createOscillator();
  const depth = c.createGain();
  osc.type = 'sawtooth';
  filter.type = 'bandpass';
  filter.frequency.value = 1500;
  filter.Q.value = 1.4;
  vibrato.frequency.value = 11;
  depth.gain.value = 18;
  vibrato.connect(depth).connect(osc.frequency);
  // [início, fim, altura inicial, altura final] de cada sílaba.
  const syllables: [number, number, number, number][] = [
    [0, 0.17, 430, 640], [0.24, 0.38, 620, 700], [0.45, 0.62, 680, 860], [0.7, 1.75, 820, 470],
  ];
  const f = osc.frequency;
  const g = gain.gain;
  g.setValueAtTime(0, t);
  for (const [a, b, from, to] of syllables) {
    f.setValueAtTime(from, t + a);
    if (b - a > 0.5) {
      // A sílaba longa sobe, segura no alto e cai no fim.
      f.linearRampToValueAtTime(1010, t + a + 0.22);
      f.setValueAtTime(980, t + b - 0.45);
    }
    f.linearRampToValueAtTime(to, t + b);
    g.setValueAtTime(0, t + a);
    g.linearRampToValueAtTime(0.5, t + a + 0.03);
    g.setValueAtTime(0.5, t + b - 0.05);
    g.linearRampToValueAtTime(0, t + b);
  }
  osc.connect(filter).connect(gain).connect(sink(c));
  osc.start(t);
  vibrato.start(t);
  osc.stop(t + 1.8);
  vibrato.stop(t + 1.8);
}

/** Um ciclo de cada toque; devolve a duração do ciclo em ms. */
const PATTERNS: Record<BuiltinSound, (c: AudioContext, t: number) => number> = {
  classic: (c, t) => {
    beep(c, t, 880, 0.18, 'triangle', 0.3);
    beep(c, t + 0.25, 880, 0.18, 'triangle', 0.3);
    return 1000;
  },
  rooster: (c, t) => {
    rooster(c, t);
    return 3000;
  },
  digital: (c, t) => {
    for (let i = 0; i < 4; i++) beep(c, t + i * 0.12, 1760, 0.08, 'square', 0.12);
    return 1000;
  },
  gentle: (c, t) => {
    seq(c, t, [[0, 523.25], [0.28, 659.25], [0.56, 783.99], [0.84, 1046.5]], 0.6, 'sine', 0.22);
    return 2000;
  },
  beep: (c, t) => {
    hold(c, t, 1000, 0.5, 'sine', 0.25);
    return 1000;
  },
  bell: (c, t) => {
    // Parciais desafinadas de sino, as agudas somem primeiro.
    [[1, 0.26, 1.9], [2, 0.14, 1.4], [2.4, 0.1, 1.1], [3, 0.07, 0.8], [4.2, 0.04, 0.5]]
      .forEach(([ratio, peak, dur]) => beep(c, t, 523.25 * ratio, dur, 'sine', peak));
    return 2000;
  },
  chime: (c, t) => {
    seq(c, t, [[0, 1318.5], [0.35, 1046.5], [0.7, 783.99], [1.05, 659.25]], 1, 'sine', 0.2);
    return 2400;
  },
  radar: (c, t) => {
    seq(c, t, [[0, 1568], [0.12, 1568], [0.24, 1568], [0.55, 1568], [0.67, 1568], [0.79, 1568]], 0.09, 'sine', 0.26);
    return 1300;
  },
  siren: (c, t) => {
    hold(c, t, 620, 0.5, 'triangle', 0.24, 1180);
    hold(c, t + 0.5, 1180, 0.5, 'triangle', 0.24, 620);
    return 1000;
  },
  birds: (c, t) => {
    [0, 0.11, 0.22].forEach((at) => beep(c, t + at, 2500, 0.08, 'sine', 0.18, 4100));
    [0.6, 0.74].forEach((at) => beep(c, t + at, 3600, 0.12, 'sine', 0.16, 2300));
    beep(c, t + 0.95, 2900, 0.07, 'sine', 0.16, 4300);
    return 1600;
  },
  harp: (c, t) => {
    [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(c, t + i * 0.11, f, 0.9, 'triangle', 0.2));
    return 2000;
  },
  marimba: (c, t) => {
    [392, 523.25, 659.25, 523.25, 783.99, 659.25].forEach((f, i) => {
      beep(c, t + i * 0.16, f, 0.26, 'sine', 0.3);
      beep(c, t + i * 0.16, f * 4, 0.07, 'sine', 0.07);
    });
    return 1400;
  },
  piano: (c, t) => {
    [659.25, 587.33, 523.25, 587.33, 659.25, 659.25, 659.25].forEach((f, i) => {
      beep(c, t + i * 0.28, f, 0.7, 'triangle', 0.24);
      beep(c, t + i * 0.28, f * 2, 0.3, 'sine', 0.05);
    });
    return 2600;
  },
  xylophone: (c, t) => {
    seq(c, t, [[0, 1046.5], [0.13, 1318.5], [0.26, 1568], [0.39, 2093], [0.65, 2093], [0.78, 1568], [0.91, 1318.5], [1.04, 1046.5]], 0.16, 'triangle', 0.24);
    return 1500;
  },
  buzzer: (c, t) => {
    hold(c, t, 150, 0.6, 'sawtooth', 0.14);
    return 1000;
  },
  phone: (c, t) => {
    // Dois toques de telefone antigo: trinado rápido de duas notas.
    for (const start of [0, 0.6]) {
      for (let i = 0; i < 8; i++) beep(c, t + start + i * 0.05, i % 2 ? 1318.5 : 1568, 0.05, 'square', 0.09);
    }
    return 2000;
  },
  cuckoo: (c, t) => {
    hold(c, t, 659.25, 0.24, 'sine', 0.28);
    hold(c, t + 0.3, 523.25, 0.42, 'sine', 0.28);
    return 1500;
  },
  sonar: (c, t) => {
    beep(c, t, 1200, 1.2, 'sine', 0.26);
    beep(c, t + 0.42, 1200, 0.9, 'sine', 0.07);
    return 2200;
  },
  flute: (c, t) => {
    [783.99, 880, 987.77, 1174.66, 987.77].forEach((f, i) => hold(c, t + i * 0.34, f, 0.32, 'sine', 0.2));
    return 2400;
  },
  musicbox: (c, t) => {
    [1318.5, 1568, 2093, 1568, 1318.5, 1046.5, 1318.5, 1568].forEach((f, i) => {
      beep(c, t + i * 0.2, f, 0.6, 'sine', 0.14);
      beep(c, t + i * 0.2, f * 2, 0.25, 'sine', 0.04);
    });
    return 2200;
  },
  bugle: (c, t) => {
    // Toque de alvorada no clarim.
    ([[0, 392, 0.12], [0.15, 523.25, 0.12], [0.3, 659.25, 0.26], [0.62, 523.25, 0.12], [0.77, 659.25, 0.12], [0.92, 783.99, 0.55]] as const)
      .forEach(([at, f, dur]) => hold(c, t + at, f, dur, 'sawtooth', 0.08));
    return 2000;
  },
};

const pattern = (c: AudioContext, sound: BuiltinSound): number => PATTERNS[sound](c, c.currentTime + 0.02);

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

function playBuiltin(sound: BuiltinSound, repeat: boolean): void {
  const c = audio();
  if (!c) return;
  unlockAudio();
  out = c.createGain();
  out.connect(c.destination);
  const every = pattern(c, sound);
  if (repeat) {
    loop = setInterval(() => {
      if (c.state === 'running') pattern(c, sound);
    }, every);
  }
}

/** Toca o arquivo enviado pelo usuário. Devolve false se não deu (arquivo apagado, formato não suportado, som bloqueado). */
async function playFile(id: string, repeat: boolean, mine: number): Promise<boolean> {
  const blob = await getSoundFile(id);
  if (!blob || mine !== turn) return mine !== turn;
  try {
    mediaUrl = URL.createObjectURL(blob);
    media = new Audio(mediaUrl);
    media.loop = repeat;
    await media.play();
    return true;
  } catch {
    return mine !== turn;
  }
}

function play(sound: AlarmSound, repeat: boolean, maxMs: number): void {
  silence();
  const mine = turn;
  const custom = customSoundId(sound);
  if (custom) {
    // Se o arquivo não tocar, o alarme não fica mudo: cai no toque clássico.
    void playFile(custom, repeat, mine).then((ok) => {
      if (!ok && mine === turn) playBuiltin('classic', repeat);
    });
  } else {
    playBuiltin(isBuiltinSound(sound) ? sound : 'classic', repeat);
  }
  stopAt = setTimeout(() => {
    alarmActive = false;
    silence();
  }, maxMs);
}

export function stopAlarmSound(): void {
  alarmActive = false;
  silence();
}

/** Toca em repetição até `stopAlarmSound` (ou até `maxMs`). */
export function startAlarmSound(sound: AlarmSound, maxMs = 60_000): void {
  alarmActive = true;
  play(sound, true, maxMs);
}

/** Toca uma amostra, para o usuário ouvir o toque que escolheu (arquivo enviado: até 15 s). */
export function previewAlarmSound(sound: AlarmSound): void {
  if (alarmActive) return; // não cala um alarme que está tocando
  play(sound, false, customSoundId(sound) ? 15_000 : 4000);
}

/** Para a amostra (ao fechar a folha, por exemplo). Não mexe em alarme tocando. */
export function stopSoundPreview(): void {
  if (!alarmActive) silence();
}
