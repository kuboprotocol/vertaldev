/**
 * Áudio da clonagem de voz do Vertal Avatar.
 *
 * O MediaRecorder grava em WebM/Opus (Chrome) ou MP4 (Safari), formatos que o clonador da MiniMax não
 * aceita. Por isso toda amostra (gravada ou enviada) é decodificada e regravada como WAV PCM 16-bit mono,
 * o que também dá a duração exata para exigir os 10 s mínimos.
 */

export const VOICE_SAMPLE_RATE = 24_000;

/** Mistura os canais em um só (média). */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const c of channels) sum += c[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/** WAV PCM 16-bit mono a partir de amostras em [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** Decodifica qualquer áudio que o navegador entenda e devolve um WAV mono de 24 kHz com a duração. */
export async function toWavSample(blob: Blob): Promise<{ wav: Blob; seconds: number }> {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Seu navegador não consegue processar áudio.");
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * VOICE_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, VOICE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const mono = mixToMono([rendered.getChannelData(0)]);
  return { wav: new Blob([encodeWav(mono, VOICE_SAMPLE_RATE)], { type: "audio/wav" }), seconds: decoded.duration };
}

/** Tipo de gravação suportado pelo MediaRecorder deste navegador (ou undefined para o padrão). */
export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
}
