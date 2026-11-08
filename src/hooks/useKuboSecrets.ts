import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { PlanEntry, PlanStatus } from '../../supabase/functions/_shared/kuboSecretsCore'

// Painel secreto: o cliente nunca lê as tabelas. Tudo passa pela Edge Function
// `kubo-secrets` (segredos, prontidão e alertas).
// Valores só chegam ao navegador em `reveal`, e não são guardados em lugar nenhum.

const SECRETS_FN = 'kubo-secrets'
// O orquestrador mora na mesma função do cofre (o plano do Supabase limita o número de funções).
const ORCH_FN = 'kubo-secrets'

export type SecretRole = 'owner' | 'grant'

export interface SecretGrant {
  grantee_id: string
  email: string | null
  can_reveal: boolean
}

export interface VaultSecret {
  id: string
  owner_id: string
  name: string
  env_key: string
  group_name: string
  description: string | null
  bound_to: string | null
  masked_hint: string | null
  created_at: string
  updated_at: string
  rotated_at: string
  last_used_at: string | null
  role: SecretRole
  can_reveal: boolean
  grants: SecretGrant[]
}

export interface AuditEntry {
  id: number
  secret_id: string | null
  env_key: string | null
  action: 'create' | 'rotate' | 'update' | 'delete' | 'reveal' | 'grant' | 'revoke' | 'inject'
  actor_id: string | null
  meta: Record<string, unknown>
  created_at: string
}

export interface SecretFormInput {
  name: string
  env_key: string
  group_name?: string
  description?: string | null
  bound_to?: string | null
  value?: string
}

export interface OrchestrationTargetInfo {
  slug: string
  label: string
  description: string
  env_keys: string[]
  connector_slug: string | null
}

export interface TargetOverview {
  slug: string
  label: string
  description: string
  status: PlanStatus
  ready_count: number
  total: number
  warnings: string[]
  connector: { slug: string; connected: boolean } | null
}

export interface OverviewResponse {
  secrets_total: number
  owned: number
  shared_with_me: number
  targets: TargetOverview[]
  needs_attention: number
  checked_at: string
}

export interface PlanResponse {
  target: string | null
  label: string
  status: PlanStatus
  ready: boolean
  entries: PlanEntry[]
  connector: { slug: string; connected: boolean } | null
  warnings: string[]
}

/** Chama a função e devolve a mensagem de erro do servidor, quando houver. */
async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    let message = error.message || 'Falha ao falar com o servidor'
    try {
      const res = (error as { context?: Response }).context
      const json = await res?.json()
      if (json?.error) message = String(json.error)
    } catch {
      // resposta sem JSON: fica a mensagem genérica
    }
    throw new Error(message)
  }
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error)
  return data as T
}

export function useKuboSecrets() {
  const [secrets, setSecrets] = useState<VaultSecret[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await call<{ secrets: VaultSecret[] }>(SECRETS_FN, { action: 'list' })
      setSecrets(res.secrets)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o cofre')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(async (input: SecretFormInput) => {
    await call(SECRETS_FN, { action: 'create', ...input })
    await reload()
  }, [reload])

  const update = useCallback(async (id: string, fields: Partial<SecretFormInput>) => {
    await call(SECRETS_FN, { action: 'update', id, ...fields })
    await reload()
  }, [reload])

  const rotate = useCallback(async (id: string, value: string) => {
    await call(SECRETS_FN, { action: 'rotate', id, value })
    await reload()
  }, [reload])

  const remove = useCallback(async (id: string) => {
    await call(SECRETS_FN, { action: 'delete', id })
    await reload()
  }, [reload])

  /** Único ponto em que um valor entra no navegador. Quem chama deve descartá-lo logo depois. */
  const reveal = useCallback(async (id: string): Promise<string> => {
    const res = await call<{ value: string }>(SECRETS_FN, { action: 'reveal', id })
    return res.value
  }, [])

  const grant = useCallback(async (id: string, email: string, canReveal: boolean) => {
    await call(SECRETS_FN, { action: 'grant', id, email, can_reveal: canReveal })
    await reload()
  }, [reload])

  const revoke = useCallback(async (id: string, granteeId: string) => {
    await call(SECRETS_FN, { action: 'revoke', id, grantee_id: granteeId })
    await reload()
  }, [reload])

  const loadAudit = useCallback(async (secretId?: string): Promise<AuditEntry[]> => {
    const res = await call<{ entries: AuditEntry[] }>(SECRETS_FN, {
      action: 'audit',
      ...(secretId ? { id: secretId } : {}),
      limit: 150,
    })
    return res.entries
  }, [])

  return {
    secrets,
    loading,
    error,
    reload,
    create,
    update,
    rotate,
    remove,
    reveal,
    grant,
    revoke,
    loadAudit,
  }
}

export async function fetchTargets(): Promise<OrchestrationTargetInfo[]> {
  const res = await call<{ targets: OrchestrationTargetInfo[] }>(ORCH_FN, { action: 'targets' })
  return res.targets
}

export async function fetchOverview(): Promise<OverviewResponse> {
  return call<OverviewResponse>(ORCH_FN, { action: 'overview' })
}

export async function fetchPlan(target: string): Promise<PlanResponse> {
  return call<PlanResponse>(ORCH_FN, { action: 'plan', target })
}

/**
 * Guarda uma chave no cofre direto do chat do agente. O valor vai cifrado para o
 * servidor e não volta; a resposta só confirma a variável e a dica mascarada.
 */
export async function saveSecretValue(input: {
  name: string
  env_key: string
  value: string
  group_name?: string
  description?: string | null
}): Promise<{ env_key: string; masked_hint: string | null }> {
  const res = await call<{ secret: { env_key: string; masked_hint: string | null } }>(SECRETS_FN, {
    action: 'create',
    group_name: 'apis',
    ...input,
  })
  return { env_key: res.secret.env_key, masked_hint: res.secret.masked_hint }
}

/** Quais destas variáveis já estão no cofre (próprias ou compartilhadas). Nunca traz valores. */
export async function fetchPlanForKeys(envKeys: string[]): Promise<PlanResponse> {
  return call<PlanResponse>(ORCH_FN, { action: 'plan', env_keys: envKeys })
}
