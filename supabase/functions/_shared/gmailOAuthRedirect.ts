// redirect_uri do conector Gmail nativo.
//
// A tela de consentimento do Google mostra o domínio do redirect_uri. Antes era
// `${SUPABASE_URL}/functions/v1/gmail-oauth-callback` (aparecia
// sccizjlpwezsgaxkclot.supabase.co); agora o padrão é
// https://vertal.dev/oauth/gmail/callback, uma rota do Worker do vertal.dev
// (worker/gmailOAuthCallback.ts) que repassa code/state para a edge function
// gmail-oauth-callback com `via=vertal`.
//
// A troca do code exige o MESMO redirect_uri usado no início do fluxo:
// - chegou pelo Worker (via=vertal) → usa o redirect configurado;
// - chegou direto na edge function (fluxos iniciados antes da troca) → usa o
//   URI antigo do Supabase, que continua cadastrado no cliente do Google.
// GMAIL_OAUTH_REDIRECT_URI permite trocar (ou voltar ao URI antigo) sem deploy.

export const DEFAULT_GMAIL_OAUTH_REDIRECT_URI = 'https://vertal.dev/oauth/gmail/callback'

type GetEnv = (key: string) => string | undefined

export function legacyGmailRedirectUri(getEnv: GetEnv): string {
  return `${getEnv('SUPABASE_URL') ?? ''}/functions/v1/gmail-oauth-callback`
}

/** redirect_uri enviado ao Google no início do fluxo (gmail-oauth-start). */
export function gmailRedirectUri(getEnv: GetEnv): string {
  const configured = (getEnv('GMAIL_OAUTH_REDIRECT_URI') ?? '').trim()
  return configured || DEFAULT_GMAIL_OAUTH_REDIRECT_URI
}

/** redirect_uri para a troca do code (gmail-oauth-callback). */
export function gmailRedirectUriForCallback(getEnv: GetEnv, via: string | null): string {
  return via === 'vertal' ? gmailRedirectUri(getEnv) : legacyGmailRedirectUri(getEnv)
}
