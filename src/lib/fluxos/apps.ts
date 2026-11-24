// Cliente dos apps do Vertal Fluxos (creative-router, tool "fluxos_apps").
// Conectar/desconectar por usuário e rodar ações/buscas. Credenciais e client
// secrets ficam no servidor; aqui só passam os campos que o próprio usuário digita.
import { supabase } from '@/integrations/supabase/client'
import { FLUXOS_SHARED_APPS } from '@/lib/fluxosConnectors'

export interface FluxosField {
  key: string
  label?: string
  type?: string
  required?: boolean
  description?: string
  placeholder?: string
  value?: unknown
  options?: Array<{ label?: string; value?: unknown }>
}

export interface FluxosDescribe {
  ok: true
  app: { key: string; name: string; oauth: boolean; supportsConnections: boolean }
  platformClient: boolean | null
  fields: FluxosField[]
  actions: Array<{ key: string; name: string; description?: string }>
  searches: Array<{ key: string; name: string; description?: string }>
  agentText: string
  connection: { status: 'pending' | 'connected' | 'error'; screen_name: string | null; updated_at: string } | null
}

export interface FluxosCallResult<T = Record<string, unknown>> {
  ok: boolean
  code?: string
  message: string
  data?: T
  fields?: string[]
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'Muitos pedidos ao Vertal Fluxos em pouco tempo. Aguarde um minuto.',
  fluxos_not_configured: 'O Vertal Fluxos não está disponível agora.',
  app_not_found: 'Este app não está disponível no Vertal Fluxos.',
  not_connected: 'Este app não está conectado. Conecte em Conectores.',
  no_pending_connection: 'O login expirou ou já foi usado. Comece a conexão de novo.',
  missing_fields: 'Preencha os campos obrigatórios.',
  insufficient_credits: 'Créditos insuficientes.',
  invalid_input: 'Pedido inválido.',
}

export const PENDING_APP_KEY = 'vertal:fluxos:pendingApp'

export async function callFluxosApps<T = Record<string, unknown>>(op: Record<string, unknown>): Promise<FluxosCallResult<T>> {
  const { data, error } = await supabase.functions.invoke('creative-router', { body: { tool: 'fluxos_apps', fluxos: op } })
  if (error) {
    let body: { error?: string; message?: string; fields?: string[] } | null = null
    const ctx = (error as { context?: unknown }).context
    if (ctx && typeof (ctx as Response).json === 'function') body = await (ctx as Response).clone().json().catch(() => null)
    const code = body?.error ?? 'fluxos_error'
    const key = code.startsWith('rate_limit') ? 'rate_limited' : code
    return {
      ok: false,
      code: key,
      message: body?.message || MESSAGES[key] || 'Não foi possível falar com o Vertal Fluxos agora.',
      ...(Array.isArray(body?.fields) ? { fields: body!.fields } : {}),
    }
  }
  return { ok: true, message: 'ok', data: data as T }
}

/** Parâmetros que o provedor devolveu no retorno do OAuth (query + hash). */
export function oauthReturnParams(search: string, hash: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ''))) out[k] = v
  for (const [k, v] of new URLSearchParams(search)) out[k] = v
  return out
}

/** Página do conector depois do retorno do OAuth. */
export function connectorPathFor(app: string): string {
  return FLUXOS_SHARED_APPS[app] ? `/connectors/${app}` : `/connectors/fluxos-${app}/setup`
}
