import { describe, expect, it } from "vitest";
import { encodeWav, mixToMono } from "./avatarVoiceAudio";

describe("avatar voice audio", () => {
  it("writes a 16-bit mono PCM WAV header", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 24_000);
    const view = new DataView(wav.buffer);
    const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(wav.length).toBe(44 + 8);
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(28, true)).toBe(48_000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff); // clipped
  });

  it("mixes channels to mono", () => {
    expect(Array.from(mixToMono([new Float32Array([1, 0]), new Float32Array([0, 0])]))).toEqual([0.5, 0]);
    expect(mixToMono([]).length).toBe(0);
  });
});
