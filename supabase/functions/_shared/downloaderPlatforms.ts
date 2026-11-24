// Downloader Universal: quais plataformas estão ligadas agora. TypeScript puro, sem APIs de Deno nem do navegador.
// A edge function creative-download recusa antes de cobrar; o painel mostra a mesma lista.
export const DOWNLOADER_PLATFORMS = [
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { key: "kwai", label: "Kwai", hosts: ["kwai.com"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  { key: "x", label: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
] as const;

/** Em breve: aparece no painel, mas o servidor ainda não aceita. */
export const DOWNLOADER_COMING_SOON = [{ key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] }] as const;

export type DownloaderCheck =
  | { ok: true; platform: string }
  | { ok: false; code: "coming_soon" | "unsupported_platform"; platform?: string; message: string };

const matchesHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Diz se o link é de uma plataforma ligada. Não faz requisição de rede. */
export function checkDownloaderHost(rawUrl: string): DownloaderCheck {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { ok: false, code: "unsupported_platform", message: "Link inválido. Cole o endereço completo do vídeo." };
  }
  for (const p of DOWNLOADER_PLATFORMS) {
    if (p.hosts.some((d) => matchesHost(host, d))) return { ok: true, platform: p.key };
  }
  for (const p of DOWNLOADER_COMING_SOON) {
    if (p.hosts.some((d) => matchesHost(host, d))) {
      return {
        ok: false,
        code: "coming_soon",
        platform: p.key,
        message: "O downloader do YouTube chega em breve. Por enquanto funciona com TikTok, Kwai, Instagram e X.",
      };
    }
  }
  return {
    ok: false,
    code: "unsupported_platform",
    message: "Por enquanto o downloader aceita TikTok, Kwai, Instagram e X.",
  };
}
