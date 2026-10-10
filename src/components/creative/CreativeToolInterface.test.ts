import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { TOOL_REQUESTS, summarizeResult } from "./CreativeToolInterface";

describe("TOOL_REQUESTS", () => {
  it.each([
    ["downloader", "creative-download"],
    ["clips", "creative-clips"],
    ["avatar", "creative-video"],
    ["shorts", "creative-video"],
    ["ebook", "creative-ebook"],
    ["emo", "emo-animate"],
    ["nano_banana", "creative-router"],
    ["chat", "creative-router"],
  ])("%s calls %s", (tool, fn) => {
    const req = TOOL_REQUESTS[tool as keyof typeof TOOL_REQUESTS]("https://x.test/v", {});
    expect(req.fn).toBe(fn);
  });

  it("downloader sends the URL and format, not the creative-router payload", () => {
    const req = TOOL_REQUESTS.downloader("  https://youtu.be/abc ", { format: "mp3" });
    expect(req.body).toEqual({ url: "https://youtu.be/abc", format: "mp3" });
  });

  it("ebook maps the prompt to topic and uses the chapter option", () => {
    expect(TOOL_REQUESTS.ebook("Marketing", { chapters: 7 }).body).toEqual({ topic: "Marketing", chapters: 7 });
  });

  it("nano_banana keeps the image action on creative-router", () => {
    expect(TOOL_REQUESTS.nano_banana("gato", {}).body).toMatchObject({ tool: "image", prompt: "gato" });
  });
});

describe("summarizeResult", () => {
  it("shows the download link, image, script and clips per tool", () => {
    expect(summarizeResult({ ok: true, download_url: "https://cdn/x.mp4" }).assetUrl).toBe("https://cdn/x.mp4");
    expect(summarizeResult({ ok: true, image_url: "https://cdn/i.png" }).assetUrl).toBe("https://cdn/i.png");
    expect(summarizeResult({ ok: true, script: "Olá" }).output_text).toBe("Olá");
    expect(summarizeResult({ ok: true, clips: [{ start: "00:01" }] }).output_text).toContain("00:01");
  });

  it("handles empty and plain-string responses", () => {
    expect(summarizeResult(null)).toEqual({});
    expect(summarizeResult("texto")).toEqual({ output_text: "texto" });
  });
});
