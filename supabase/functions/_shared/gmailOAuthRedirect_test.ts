import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  DEFAULT_GMAIL_OAUTH_REDIRECT_URI,
  gmailRedirectUri,
  gmailRedirectUriForCallback,
} from './gmailOAuthRedirect.ts'

const env = (vals: Record<string, string>) => (k: string) => vals[k]
const SUPA = 'https://sccizjlpwezsgaxkclot.supabase.co'

Deno.test('padrão é o callback do vertal.dev', () => {
  assertEquals(gmailRedirectUri(env({ SUPABASE_URL: SUPA })), DEFAULT_GMAIL_OAUTH_REDIRECT_URI)
})

Deno.test('GMAIL_OAUTH_REDIRECT_URI sobrescreve o padrão', () => {
  const legacy = `${SUPA}/functions/v1/gmail-oauth-callback`
  assertEquals(gmailRedirectUri(env({ SUPABASE_URL: SUPA, GMAIL_OAUTH_REDIRECT_URI: legacy })), legacy)
})

Deno.test('callback via Worker usa o mesmo redirect do início', () => {
  assertEquals(gmailRedirectUriForCallback(env({ SUPABASE_URL: SUPA }), 'vertal'), DEFAULT_GMAIL_OAUTH_REDIRECT_URI)
})

Deno.test('callback direto (fluxo antigo) usa o URI do Supabase', () => {
  assertEquals(gmailRedirectUriForCallback(env({ SUPABASE_URL: SUPA }), null), `${SUPA}/functions/v1/gmail-oauth-callback`)
})
