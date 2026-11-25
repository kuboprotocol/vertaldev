import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { logConnectorEvent } from '@/hooks/useConnectorLogs'
import { getGitHubOAuthUrl, githubOAuthErrorMessage, GITHUB_TOKEN_SETUP_ROUTE } from '@/lib/github/oauth'

interface GitHubConnection {
  id: string
  github_username: string | null
  github_avatar_url: string | null
  scope: string | null
  connected_at: string
}

export function useGitHubConnection() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<GitHubConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  const fetchConnection = useCallback(async () => {
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('github_connections_safe')
      .select('id, github_username, github_avatar_url, scope, connected_at')
      .eq('user_id', user.id)
      .maybeSingle()
    setConnection(data)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchConnection() }, [fetchConnection])

  // Handle OAuth callback params on mount (token now persists on the server)
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      const who = params.get('username')
      toast.success(who ? `GitHub conectado: @${who}` : 'GitHub conectado!')
      fetchConnection()
      logConnectorEvent({
        connectorSlug: 'github',
        eventType: 'connected',
        message: who ? `GitHub conectado via OAuth (@${who})` : 'GitHub conectado via OAuth',
        status: 'success',
      })
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('error')) {
      toast.error(githubOAuthErrorMessage(params.get('error')))
      window.history.replaceState({}, '', window.location.pathname)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // "Entrar com GitHub": OAuth por usuário. O servidor gera a URL (state guardado
  // no banco) e o callback grava o token cifrado — nada de token no navegador.
  const connect = async () => {
    setConnecting(true)
    try {
      window.location.href = await getGitHubOAuthUrl()
    } catch {
      setConnecting(false)
      toast.error('Não foi possível abrir o login do GitHub. Tente de novo ou use um token em "Avançado".')
    }
  }

  // Avançado: conectar colando um token pessoal (PAT). Conexões por token continuam valendo.
  const connectWithToken = () => {
    window.location.href = GITHUB_TOKEN_SETUP_ROUTE
  }

  const disconnect = async () => {
    if (!user) return
    const [{ error }, _] = await Promise.all([
      supabase.from('github_connections').delete().eq('user_id', user.id),
      supabase.from('api_credentials').delete().eq('user_id', user.id).eq('connector_slug', 'github'),
    ])
    if (error) {
      toast.error('Erro ao desconectar o GitHub')
    } else {
      setConnection(null)
      toast.info('GitHub desconectado.')
      logConnectorEvent({
        connectorSlug: 'github',
        eventType: 'disconnected',
        message: 'GitHub disconnected',
        status: 'info',
      })
    }
  }

  return { connection, loading, connecting, connect, connectWithToken, disconnect, isConnected: !!connection, viaToken: connection?.scope === 'pat' }
}
