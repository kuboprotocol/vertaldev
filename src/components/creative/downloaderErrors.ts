// Mensagens para os códigos de erro da função creative-download (ver _shared/cobalt.ts).
export const DOWNLOADER_ERRORS: Record<string, string> = {
  downloader_not_configured: "A importação por link está temporariamente indisponível. Envie o arquivo do vídeo.",
  downloader_unavailable: "O serviço de importação não respondeu. Tente de novo em instantes.",
  downloader_auth_failed: "A importação por link está temporariamente indisponível. Envie o arquivo do vídeo.",
  unsupported_link: "Esse link não é suportado. Use um link público do YouTube, Instagram, TikTok, X ou Vimeo.",
  video_unavailable: "O vídeo é privado, removido ou restrito por região.",
  video_too_long: "Esse vídeo é longo demais para importar por link. Envie o arquivo.",
  platform_blocked: "A plataforma bloqueou a importação deste vídeo. Baixe e envie o arquivo.",
  download_failed: "Não foi possível obter o link de download. Tente de novo ou envie o arquivo.",
};

export function downloaderErrorMessage(code: string | null | undefined): string {
  if (code && DOWNLOADER_ERRORS[code]) return DOWNLOADER_ERRORS[code];
  if (code?.startsWith("rate_limit")) return "Muitas solicitações. Aguarde um minuto.";
  if (code === "deduction_failed" || code === "insufficient_credits") return "Créditos insuficientes.";
  return DOWNLOADER_ERRORS.download_failed;
}
