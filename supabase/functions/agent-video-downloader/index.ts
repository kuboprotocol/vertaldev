// Video Downloader — valida URL e retorna metadados oEmbed quando disponível.
// MVP: não armazena binário; entrega metadados + link de stream público.
import { runAgent } from "../_shared/agentRuntime.ts";
import { validatePublicUrl } from "../_shared/security.ts";
import { z } from "npm:zod@3";

const InputSchema = z.object({
  url: z.string().url().max(2048),
});

function detectPlatform(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "unknown";
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is("youtube.com") || is("youtu.be") || is("youtube-nocookie.com")) return "youtube";
  if (is("vimeo.com")) return "vimeo";
  if (is("tiktok.com")) return "tiktok";
  if (is("instagram.com")) return "instagram";
  if (is("facebook.com") || is("fb.watch")) return "facebook";
  if (is("twitter.com") || is("x.com")) return "twitter";
  if (is("twitch.tv")) return "twitch";
  if (is("dailymotion.com") || is("dai.ly")) return "dailymotion";
  return "unknown";
}

Deno.serve((req) =>
  runAgent("video-downloader", req, async ({ input }) => {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`invalid_input: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
    }
    const { url: rawUrl } = parsed.data;
    if (!rawUrl) throw new Error("missing_url");
    const url = validatePublicUrl(rawUrl).toString();
    const platform = detectPlatform(url);

    let metadata: Record<string, unknown> = { url, platform };
    try {
      if (platform === "youtube") {
        const o = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (o.ok) metadata = { ...metadata, ...(await o.json()) };
      } else if (platform === "vimeo") {
        const o = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
        if (o.ok) metadata = { ...metadata, ...(await o.json()) };
      }
    } catch { /* ignore */ }

    return {
      output: {
        platform,
        metadata,
        note: "MVP: retornamos metadados oEmbed. Download binário requer worker dedicado.",
      },
    };
  })
);
