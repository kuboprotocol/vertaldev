import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Github, Zap, Loader2, Check, AlertCircle, Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Integration {
  id: string
  provider: 'github' | 'vercel' | 'railway'
  provider_account_id: string
  status: 'connected' | 'disconnected' | 'error' | 'expired'
  last_sync?: string
  created_at: string
  metadata?: {
    login?: string
    avatar_url?: string
    profile_url?: string
  }
}

interface IntegrationsManagerProps {
  appId: string
  appName?: string
}

const PROVIDERS = [
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    description: 'Sincronize seu repositório e configure CI/CD',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    icon: Zap,
    description: 'Deploy automático para Vercel',
    color: 'text-black',
    bgColor: 'bg-black',
  },
  {
    id: 'railway',
    name: 'Railway',
    icon: Zap,
    description: 'Deploy de backend na Railway',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
]

export default function IntegrationsManager({ appId, appName = 'Seu App' }: IntegrationsManagerProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)

  useEffect(() => {
    fetchIntegrations()
  }, [appId])

  const fetchIntegrations = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/integrations?action=list&app_id=${appId}`,
        {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      )

      if (!response.ok) throw new Error('Failed to fetch integrations')

      const result = await response.json()
      setIntegrations(result.integrations || [])
    } catch (err) {
      console.error('Error fetching integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async (provider: string) => {
    try {
      setConnectingProvider(provider)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada')
        return
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/integrations?action=oauth-url`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider, app_id: appId }),
        }
      )

      if (!response.ok) throw new Error('Failed to get auth URL')

      const result = await response.json()
      if (result.authUrl) {
        window.location.href = result.authUrl
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar integração')
      setConnectingProvider(null)
    }
  }

  const handleDisconnect = async (integrationId: string) => {
    if (!confirm('Desconectar esta integração?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/integrations?action=disconnect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ integration_id: integrationId }),
        }
      )

      if (!response.ok) throw new Error('Failed to disconnect')

      setIntegrations(integrations.filter(i => i.id !== integrationId))
      toast.success('Integração desconectada')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao desconectar')
    }
  }

  const getConnectedIntegration = (providerId: string) => {
    return integrations.find(i => i.provider === providerId && i.status === 'connected')
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
            <Link2 className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-display">Integrações</h3>
            <p className="text-sm text-muted-foreground">
              Conecte ferramentas e plataformas com seu app
            </p>
          </div>
        </div>
      </motion.div>

      {/* Integrations Grid */}
      {loading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {PROVIDERS.map((provider, idx) => {
            const connected = getConnectedIntegration(provider.id)

            return (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />

                <div className={`relative bg-card/50 backdrop-blur border rounded-xl p-6 space-y-4 transition-all ${
                  connected ? 'border-green-500/30' : 'border-primary/20'
                }`}>
                  {/* Provider Icon */}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${provider.bgColor}`}>
                    <provider.icon className={`h-6 w-6 ${provider.color}`} />
                  </div>

                  {/* Provider Info */}
                  <div>
                    <h4 className="font-bold text-lg mb-1">{provider.name}</h4>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                  </div>

                  {/* Status */}
                  {connected ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                        <Check className="h-4 w-4 text-green-600" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-green-600">Conectado</p>
                          <p className="text-xs text-muted-foreground">
                            {connected.metadata?.login || connected.provider_account_id}
                          </p>
                        </div>
                      </div>

                      {connected.last_sync && (
                        <p className="text-xs text-muted-foreground">
                          Sincronizado: {new Date(connected.last_sync).toLocaleDateString('pt-BR')}
                        </p>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 text-xs h-7"
                          onClick={() => handleDisconnect(connected.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Desconectar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleConnect(provider.id)}
                      disabled={connectingProvider === provider.id}
                      className="w-full gap-2"
                    >
                      {connectingProvider === provider.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4" />
                          Conectar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Connected Integrations Summary */}
      {integrations.filter(i => i.status === 'connected').length > 0 && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-3">✅ Integrações Ativas</h4>
          <div className="grid sm:grid-cols-2 gap-2">
            {integrations
              .filter(i => i.status === 'connected')
              .map(integration => (
                <div
                  key={integration.id}
                  className="flex items-center gap-2 p-2 bg-green-500/10 rounded border border-green-500/20"
                >
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium capitalize">{integration.provider}</p>
                    <p className="text-xs text-muted-foreground">
                      {integration.metadata?.login || integration.provider_account_id}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border">
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">🚀 Deploy Automático</h4>
          <p className="text-xs text-muted-foreground">
            Faça deploy automático quando você mergear código no GitHub
          </p>
        </div>

        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">📊 Sincronização em Tempo Real</h4>
          <p className="text-xs text-muted-foreground">
            Mantenha seu app sincronizado com as plataformas
          </p>
        </div>
      </div>
    </div>
  )
}
