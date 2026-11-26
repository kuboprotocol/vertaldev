// VERTAL Code AI · Sentidos no navegador (Vertal Visão / Ouvir / Novela).
// Privacidade: câmera e microfone só abrem quando a pessoa toca no botão (o navegador pede a permissão dele a
// cada uso), mostram indicador enquanto estão ligados e são DESLIGADOS assim que a captura termina, a tela fecha
// ou a aba vai para o fundo. Nada é gravado em segundo plano nem guardado no servidor: a foto/o áudio vão uma vez
// para a análise e só a resposta volta.

import { errorText, functionUrl, postAction } from './client';

export type SensesFeatures = { decide: boolean; vision: boolean; hear: boolean; novela: boolean };

export const MAX_RECORD_SECONDS = 30;
export const MAX_IMAGE_SIDE = 1024;
export const VIDEO_FRAMES = 12;

/** Desliga todas as trilhas (câmera/microfone). Seguro chamar várias vezes ou com null. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      /* já parada */
    }
  });
}

/** Instantes (s) espaçados para amostrar n quadros de um vídeo, evitando o 1º/último quadro. */
export function pickFrameTimes(duration: number, n: number = VIDEO_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || n <= 0) return [];
  const k = Math.max(1, Math.min(n, Math.floor(duration * 4) || 1));
  const step = duration / (k + 1);
  return Array.from({ length: k }, (_, i) => Math.round(step * (i + 1) * 100) / 100);
}

/** Reamostra (média simples) para a taxa alvo. */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += input[j];
    out[i] = b > a ? s / (b - a) : 0;
  }
  return out;
}

/** PCM float mono → WAV 16-bit (ArrayBuffer). */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Gravação do MediaRecorder (webm/ogg/mp4) → data URL WAV 16 kHz mono (lido por todos os modelos). */
export async function recordingToWavDataUrl(blob: Blob): Promise<string> {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = audio.numberOfChannels > 1
      ? (() => {
          const a = audio.getChannelData(0);
          const b = audio.getChannelData(1);
          const m = new Float32Array(a.length);
          for (let i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) / 2;
          return m;
        })()
      : audio.getChannelData(0);
    const pcm = downsample(mono, audio.sampleRate, 16_000).slice(0, 16_000 * MAX_RECORD_SECONDS);
    return `data:audio/wav;base64,${arrayBufferToBase64(encodeWav(pcm, 16_000))}`;
  } finally {
    void ctx.close();
  }
}

/** Desenha (reduzido) um vídeo ou imagem num canvas → JPEG data URL. */
export function drawToJpeg(src: HTMLVideoElement | HTMLImageElement, maxSide = MAX_IMAGE_SIDE, quality = 0.85): string {
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
  const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
  const k = Math.min(1, maxSide / Math.max(w || 1, h || 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export async function fileToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return drawToJpeg(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Amostra quadros de um arquivo de vídeo LOCAL (no navegador; o vídeo não sobe inteiro). */
export async function sampleVideoFrames(file: File, n = VIDEO_FRAMES): Promise<Array<{ t: number; image: string }>> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    await new Promise<void>((ok, fail) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => fail(new Error('video_decode_failed'));
    });
    const out: Array<{ t: number; image: string }> = [];
    for (const t of pickFrameTimes(v.duration, n)) {
      await new Promise<void>((ok) => {
        v.onseeked = () => ok();
        v.currentTime = t;
      });
      out.push({ t, image: drawToJpeg(v, 640, 0.8) });
    }
    return out;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

export function callSenses<T>(token: string, body: Record<string, unknown>): Promise<T> {
  return postAction<T>(token, { action: 'senses', ...body });
}

export function callNovela<T>(token: string, body: Record<string, unknown>): Promise<T> {
  return postAction<T>(token, { action: 'novela', ...body });
}

/** Ação que devolve bytes (vídeo da novela, voz da resposta) → object URL. */
export async function fetchBinaryAction(token: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<string> {
  const r = await fetchImpl(functionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error((d as { error?: string })?.error ?? `http_${r.status}`);
  }
  return URL.createObjectURL(await r.blob());
}

export const NOVELA_STAGE_TEXT: Record<string, string> = {
  queued: 'Na fila…',
  decide: 'Conferindo o pedido…',
  script: 'Escrevendo o roteiro…',
  images: 'Desenhando as cenas e gravando a voz…',
  render: 'Montando o vídeo com legendas…',
  done: 'Pronto!',
};

export const ROUTE_TEXT: Record<string, string> = {
  unsafe: 'Essa imagem não pode ser anunciada.',
  not_product: 'Não parece a foto de um produto. Tente de novo mostrando o item.',
  photo_unusable: 'A foto está escura ou tremida. Tire outra com mais luz.',
};

export const SENSES_ERROR_TEXT: Record<string, string> = {
  vertal_senses_disabled: 'Esse recurso ainda não foi liberado na sua conta.',
  vertal_novela_disabled: 'A Vertal Novela ainda não foi liberada na sua conta.',
  vca_senses_failed: 'Não consegui analisar agora. Tente de novo em alguns instantes.',
  vca_novela_failed: 'Não consegui começar a novela agora. Tente de novo em alguns minutos.',
  invalid_image: 'Essa imagem não é suportada. Use JPG, PNG ou WebP.',
  invalid_audio: 'Não consegui ler esse áudio. Grave de novo.',
  empty_premise: 'Escreva a ideia da novela (pelo menos uma frase).',
  video_decode_failed: 'Não consegui abrir esse vídeo neste navegador.',
};

export function sensesErrorText(code: string): string {
  return SENSES_ERROR_TEXT[code] ?? errorText(code);
}
