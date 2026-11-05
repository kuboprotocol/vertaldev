import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { McpAccessLevel, McpKeyRecord } from '@/lib/mcpClientConfig'
import { scopesForLevel } from '@/lib/mcpClientConfig'

const FUNCTION_NAME = 'mcp-access-keys'

/** Chama a Edge Function e devolve a mensagem de erro do servidor, quando houver. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body })
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

export interface CreatedMcpKey {
  key: string
  record: McpKeyRecord
}

export function useMcpAccessKeys() {
  const [keys, setKeys] = useState<McpKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await call<{ keys: McpKeyRecord[] }>({ action: 'list' })
      setKeys(res.keys)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as chaves')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(
    async (input: { name: string; level: McpAccessLevel; expiresInDays: number | null }) => {
      const res = await call<CreatedMcpKey>({
        action: 'create',
        name: input.name,
        scopes: scopesForLevel(input.level),
        expiresInDays: input.expiresInDays,
      })
      setKeys((prev) => [res.record, ...prev])
      return res
    },
    [],
  )

  const revoke = useCallback(async (id: string) => {
    await call<{ ok: true }>({ action: 'revoke', id })
    const now = new Date().toISOString()
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revoked_at: now } : k)))
  }, [])

  return { keys, loading, error, reload, create, revoke }
}
