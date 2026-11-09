import { describe, expect, it } from "vitest";
import { buildCobaltRequest, parseCobaltResponse, resolveCobaltConfig } from "../../supabase/functions/_shared/cobalt";
import { downloaderErrorMessage } from "@/components/creative/downloaderErrors";

describe("resolveCobaltConfig", () => {
  it("recusa ausência de URL e a instância pública (fechada para terceiros)", () => {
    expect(resolveCobaltConfig(undefined)).toBeNull();
    expect(resolveCobaltConfig("  ")).toBeNull();
    expect(resolveCobaltConfig("https://api.cobalt.tools/api/json")).toBeNull();
    expect(resolveCobaltConfig("ftp://x.com")).toBeNull();
  });
  it("aceita instância própria e converte a forma antiga /api/json", () => {
    expect(resolveCobaltConfig("https://cobalt.vertal.dev/api/json", " k ")).toEqual({ base: "https://cobalt.vertal.dev/", apiKey: "k" });
    expect(resolveCobaltConfig("https://x.up.railway.app")).toEqual({ base: "https://x.up.railway.app/", apiKey: undefined });
  });
});

describe("buildCobaltRequest", () => {
  it("usa o corpo v10 e a chave Api-Key", () => {
    const { url, init } = buildCobaltRequest({ base: "https://c.dev/", apiKey: "abc" }, "https://youtu.be/x", "mp4");
    expect(url).toBe("https://c.dev/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Api-Key abc");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ url: "https://youtu.be/x", downloadMode: "auto", videoQuality: "720", youtubeVideoCodec: "h264" });
    expect(body.isAudioOnly).toBeUndefined();
  });
  it("modo áudio para mp3 e sem Authorization quando não há chave", () => {
    const { init } = buildCobaltRequest({ base: "https://c.dev/" }, "u", "mp3");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string).downloadMode).toBe("audio");
  });
});

describe("parseCobaltResponse", () => {
  it("devolve a URL de tunnel/redirect", () => {
    expect(parseCobaltResponse(200, { status: "tunnel", url: "https://c.dev/tunnel?id=1", filename: "a.mp4" }))
      .toEqual({ ok: true, url: "https://c.dev/tunnel?id=1", filename: "a.mp4" });
    expect(parseCobaltResponse(200, { status: "redirect", url: "https://cdn/x.mp4" })).toMatchObject({ ok: true });
  });
  it("escolhe o primeiro vídeo do picker", () => {
    const r = parseCobaltResponse(200, { status: "picker", picker: [{ type: "photo", url: "p" }, { type: "video", url: "v" }] });
    expect(r).toEqual({ ok: true, url: "v" });
  });
  it("traduz erros do cobalt em códigos do app", () => {
    expect(parseCobaltResponse(401, { status: "error", error: { code: "error.api.auth.key.missing" } })).toMatchObject({ code: "downloader_auth_failed" });
    expect(parseCobaltResponse(400, { status: "error", error: { code: "error.api.link.invalid" } })).toMatchObject({ code: "unsupported_link" });
    expect(parseCobaltResponse(400, { status: "error", error: { code: "error.api.content.video.unavailable" } })).toMatchObject({ code: "video_unavailable" });
    expect(parseCobaltResponse(400, { status: "error", error: { code: "error.api.content.too_long" } })).toMatchObject({ code: "video_too_long" });
    expect(parseCobaltResponse(400, { status: "error", error: { code: "error.api.youtube.login" } })).toMatchObject({ code: "platform_blocked" });
    expect(parseCobaltResponse(429, { status: "error", error: { code: "error.api.rate_exceeded" } })).toMatchObject({ code: "rate_limit_downloader", status: 429 });
    expect(parseCobaltResponse(405, {})).toMatchObject({ code: "downloader_not_configured" });
    expect(parseCobaltResponse(500, null)).toMatchObject({ code: "download_failed" });
  });
  it("todo código tem mensagem amigável", () => {
    for (const c of ["downloader_not_configured", "unsupported_link", "rate_limit_downloader", "download_failed"]) {
      expect(downloaderErrorMessage(c)).not.toMatch(/_/);
    }
    expect(downloaderErrorMessage(null)).toContain("download");
  });
});
