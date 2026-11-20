import { describe, expect, it } from "vitest";
import { groupAvatarVoices, normalizeVoiceSelection, voiceErrorMessage, type AvatarUserVoice } from "./avatarVoices";

const mine: AvatarUserVoice = {
  id: "clone:3f1c2b8e-9a4d-4c1e-8f2a-1b2c3d4e5f60",
  voice_id: "3f1c2b8e-9a4d-4c1e-8f2a-1b2c3d4e5f60",
  name: "Minha voz",
  provider: "clone",
  preview_url: null,
  created_at: "2026-11-20T12:00:00Z",
};

describe("avatar voice picker", () => {
  it("groups the library and the user's cloned voices", () => {
    const groups = groupAvatarVoices([mine]);
    expect(groups.library.map((v) => v.label)).toEqual([
      "Masculina (MiniMax)", "Feminina (MiniMax)", "Neutra (MiniMax)", "Dora (Kokoro)", "Alex (Kokoro)", "Santa (Kokoro)",
    ]);
    expect(groups.library.every((v) => !("providerVoiceId" in v))).toBe(true);
    expect(groups.mine).toEqual([{ id: mine.id, label: "Minha voz", provider: "clone", gender: null, language: "pt-BR" }]);
  });

  it("falls back to the default voice when a clone is gone", () => {
    expect(normalizeVoiceSelection("kokoro_pm_alex", [])).toBe("kokoro_pm_alex");
    expect(normalizeVoiceSelection(mine.id, [mine])).toBe(mine.id);
    expect(normalizeVoiceSelection(mine.id, [])).toBe("Male");
    expect(normalizeVoiceSelection("Deep_Voice_Man", [])).toBe("Male");
    expect(normalizeVoiceSelection(undefined, [])).toBe("Male");
  });

  it("explains the clone errors in Portuguese", () => {
    expect(voiceErrorMessage("consent_required")).toMatch(/autorização/);
    expect(voiceErrorMessage("voice_limit_reached")).toMatch(/5 vozes/);
    expect(voiceErrorMessage("weird")).toContain("weird");
  });
});
