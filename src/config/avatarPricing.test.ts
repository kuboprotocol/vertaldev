import { describe, expect, it } from "vitest";
import {
  AVATAR_CLONE_PREVIEW_TEXT,
  AVATAR_VIDEO_USD_PER_SECOND,
  AVATAR_VOICE_CATALOG,
  AVATAR_VOICE_CLONE_PREVIEW_USD_PER_1000_CHARS,
  AVATAR_VOICE_CLONE_USD,
  AVATAR_VOICES,
  avatarVideoCredits,
  avatarVoiceCloneCredits,
  avatarVoiceCredits,
  cloneVoiceRef,
  getLibraryVoice,
  isAvatarVoice,
  parseCloneVoiceRef,
  quoteAvatar,
  wavDurationSeconds,
} from "./avatarPricing";
import { encodeWav } from "@/lib/avatarVoiceAudio";
import { CREDIT_VALUE_BRL, MIN_MARGIN, USD_TO_BRL } from "./videoStudio";

const margin = (credits: number, costUsd: number) => {
  const revenue = credits * CREDIT_VALUE_BRL.min;
  return (revenue - costUsd * USD_TO_BRL) / revenue;
};

describe("avatar pricing", () => {
  it("keeps the voice above the margin floor", () => {
    for (const chars of [1, 250, 999, 1000]) {
      expect(margin(avatarVoiceCredits(chars), (chars / 1000) * 0.1)).toBeGreaterThanOrEqual(MIN_MARGIN);
    }
  });

  it("keeps the lip-sync video above the margin floor", () => {
    for (const seconds of [1, 10, 30, 67.4, 120]) {
      expect(margin(avatarVideoCredits(seconds), seconds * AVATAR_VIDEO_USD_PER_SECOND)).toBeGreaterThanOrEqual(MIN_MARGIN);
    }
  });

  it("charges the lip-sync video at 4 credits per second", () => {
    expect(avatarVideoCredits(15)).toBe(60);
    expect(avatarVideoCredits(30)).toBe(120);
    expect(avatarVideoCredits(67.4)).toBe(270);
    expect(avatarVideoCredits(0.5)).toBe(5);
  });

  it("charges only the voice without a photo", () => {
    const text = "Olá, bem-vindo ao futuro da criação de conteúdo.";
    expect(quoteAvatar(text, false).credits).toBe(avatarVoiceCredits(text.length));
    expect(quoteAvatar(text, true).credits).toBeGreaterThan(quoteAvatar(text, false).credits);
  });

  it("maps the panel voices: the 3 MiniMax presets plus the 3 Kokoro voices", () => {
    expect(Object.keys(AVATAR_VOICES)).toEqual(["Male", "Female", "Neutral"]);
    expect(AVATAR_VOICE_CATALOG.map((v) => v.id)).toEqual([
      "Male", "Female", "Neutral", "kokoro_pf_dora", "kokoro_pm_alex", "kokoro_pm_santa",
    ]);
    expect(AVATAR_VOICE_CATALOG.filter((v) => v.provider === "kokoro").map((v) => v.label)).toEqual([
      "Dora (Kokoro)", "Alex (Kokoro)", "Santa (Kokoro)",
    ]);
    for (const key of Object.keys(AVATAR_VOICES) as (keyof typeof AVATAR_VOICES)[]) {
      expect(getLibraryVoice(key)).toMatchObject({ provider: "minimax", providerVoiceId: AVATAR_VOICES[key] });
    }
    expect(getLibraryVoice("kokoro_pm_santa")).toMatchObject({ providerVoiceId: "pm_santa", language: "pt-BR", gender: "male" });
    expect(isAvatarVoice("Female")).toBe(true);
    expect(isAvatarVoice("kokoro_pf_dora")).toBe(true);
    expect(isAvatarVoice("pf_dora")).toBe(false);
    expect(isAvatarVoice("toString")).toBe(false);
  });

  it("only accepts clone:<uuid> as a cloned voice reference", () => {
    const id = "3f1c2b8e-9a4d-4c1e-8f2a-1b2c3d4e5f60";
    expect(parseCloneVoiceRef(cloneVoiceRef(id))).toBe(id);
    expect(parseCloneVoiceRef(`clone:${id.toUpperCase()}`)).toBe(id);
    expect(parseCloneVoiceRef("clone:Deep_Voice_Man")).toBeNull();
    expect(parseCloneVoiceRef(id)).toBeNull();
    expect(parseCloneVoiceRef(`clone:${id}; drop`)).toBeNull();
    expect(parseCloneVoiceRef(undefined)).toBeNull();
    expect(isAvatarVoice(cloneVoiceRef(id))).toBe(false);
  });

  it("prices a voice clone at 40 credits per USD and keeps it above the margin floor", () => {
    const credits = avatarVoiceCloneCredits();
    const usd = AVATAR_VOICE_CLONE_USD + (AVATAR_CLONE_PREVIEW_TEXT.length / 1000) * AVATAR_VOICE_CLONE_PREVIEW_USD_PER_1000_CHARS;
    expect(credits).toBe(61);
    expect(credits).toBeGreaterThanOrEqual(usd * 40);
    expect(margin(credits, usd)).toBeGreaterThanOrEqual(MIN_MARGIN);
  });

  it("reads the duration of a Kokoro WAV", () => {
    const wav = encodeWav(new Float32Array(24_000 * 3), 24_000);
    expect(wavDurationSeconds(wav)).toBeCloseTo(3, 5);
    expect(wavDurationSeconds(new Uint8Array(10))).toBeNull();
    expect(wavDurationSeconds(new TextEncoder().encode("ID3".padEnd(64, "x")))).toBeNull();
  });
});
