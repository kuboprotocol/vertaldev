// Anti-telemetria dos logs (Worker e edge functions do Vertal Navigator).
//
// console.log/error do Cloudflare Worker e das edge functions vão para painéis de
// terceiros (Cloudflare Logs, Supabase Logs). Nada de texto de tarefa, senha, URL com
// token, cookie ou cabeçalho pode ir para lá. Toda mensagem de erro passa por
// redactForLog antes do console.
//
// Sem dependências de Deno/DOM: roda no Worker, na Edge Function e no Vitest.
import { redactCredentials } from "./navigatorCore.ts";

const MAX_LOG_CHARS = 300;

/** URL sem query nem fragmento (onde ficam tokens, códigos e e-mails): https://host/caminho?[…] */
function stripUrl(u: string): string {
  const m = /^(https?:\/\/[^/?#\s]+)([^?#\s]*)([?#]\S*)?$/i.exec(u);
  if (!m) return u;
  const path = m[2].length > 80 ? `${m[2].slice(0, 80)}…` : m[2];
  return `${m[1]}${path}${m[3] ? "?[…]" : ""}`;
}

/**
 * Texto seguro para log: credenciais trocadas, URLs sem query/fragmento, cabeçalhos
 * Authorization/Cookie/apikey mascarados, JWT, tokens longos (hex/base64) e e-mails
 * mascarados, tamanho limitado.
 */
export function redactForLog(value: unknown, max = MAX_LOG_CHARS): string {
  let s: string;
  if (value instanceof Error) s = `${value.name}: ${value.message}`;
  else if (typeof value === "string") s = value;
  else {
    try {
      s = JSON.stringify(value) ?? String(value);
    } catch {
      s = String(value);
    }
  }
  s = s
    // Cabeçalhos e pares chave=valor sensíveis.
    .replace(/\b(authorization|proxy-authorization)\s*[:=]\s*("?)(bearer|basic)?\s*[^\s",;]+/gi, (_a, k: string) => `${k}: [removido]`)
    .replace(/\b(set-cookie|cookie)\s*[:=]\s*[^\n]+/gi, (_a, k: string) => `${k}: [removido]`)
    .replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [removido]")
    .replace(
      /(["']?)\b(api[_-]?key|apikey|x-navigator-token|token|access_token|refresh_token|id_token|secret|client_secret|password|passwd|pwd|senha|code|otp|value|cookies?)\1\s*([:=])\s*("?)[^\s",;&}]+/gi,
      (_a, q: string, k: string, sep: string, q2: string) => `${q}${k}${q}${sep}${q2}[removido]`,
    )
    // URLs: só origem + caminho.
    .replace(/https?:\/\/[^\s"'<>)]+/gi, (u) => stripUrl(u))
    // JWT, tokens hex/base64 longos, chaves sk-…
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[jwt]")
    .replace(/\b(sk|pk|rk|sb|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_-]{12,}/g, "[chave]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[token]")
    .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[token]")
    // E-mails: só o domínio.
    .replace(/\b[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, "…@$1");
  s = redactCredentials(s);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Mensagem curta e segura de um erro qualquer (para console.error). */
export function safeErrorMessage(e: unknown, max = MAX_LOG_CHARS): string {
  return redactForLog(e instanceof Error ? e.message : e, max);
}
