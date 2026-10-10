import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Users, Zap, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

interface DashboardMetrics {
  views: number
  deploys: number
  creditsUsed: number
  uptime: number
  errors: number
  lastUpdated: string
}

interface AppDashboardProps {
  appId: string
  appName?: string
}

export default function AppDashboard({ appId, appName = 'Seu App' }: AppDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000) // Atualizar a cada 30s
    return () => clearInterval(interval)
  }, [appId, period])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Para agora, retorna dados mockados
      // Em produção, seria uma query no banco de dados
      // SELECT * FROM app_analytics WHERE app_id = appId AND date >= DATE_SUB(NOW(), INTERVAL 1 DAY)

      const mockMetrics: DashboardMetrics = {
        views: Math.floor(Math.random() * 10000) + 1000,
        deploys: Math.floor(Math.random() * 50) + 5,
        creditsUsed: Math.floor(Math.random() * 500) + 50,
        uptime: 99.9 + Math.random() * 0.1,
        errors: Math.floor(Math.random() * 5),
        lastUpdated: new Date().toISOString(),
      }

      setMetrics(mockMetrics)
    } catch (err) {
      console.error('Error fetching metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  const stats = [
    {
      icon: Users,
      label: 'Visualizações',
      value: metrics?.views.toLocaleString() || '0',
      change: '+12%',
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
    },
    {
      icon: TrendingUp,
      label: 'Deploys',
      value: metrics?.deploys.toString() || '0',
      change: '+2 hoje',
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
    },
    {
      icon: Zap,
      label: 'Créditos Usados',
      value: metrics?.creditsUsed.toString() || '0',
      change: 'Este mês',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-500/10',
    },
    {
      icon: Clock,
      label: 'Uptime',
      value: `${metrics?.uptime.toFixed(2) || '0'}%`,
      change: 'Últimos 30d',
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
              <BarChart3 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold font-display">Dashboard de {appName}</h3>
              <p className="text-sm text-muted-foreground">
                Analytics e performance do seu aplicativo
              </p>
            </div>
          </div>

          {/* Period Selector */}
          <div className="flex gap-2">
            {(['today', 'week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                {p === 'today' ? 'Hoje' : p === 'week' ? 'Esta Semana' : 'Este Mês'}
              </button>
            ))}
          </div>
        </div>

        {/* Last Updated */}
        <p className="text-xs text-muted-foreground">
          {loading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Atualizando...
            </span>
          ) : metrics ? (
            `Atualizado em ${new Date(metrics.lastUpdated).toLocaleTimeString('pt-BR')}`
          ) : (
            'Carregando...'
          )}
        </p>
      </motion.div>

      {/* Stats Grid */}
      {loading && !metrics ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />

              <div className="relative bg-card/50 backdrop-blur border border-primary/20 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase">
                    {stat.label}
                  </span>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>

                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Error Alert */}
      {metrics && metrics.errors > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-red-600">
              {metrics.errors} erro{metrics.errors > 1 ? 's' : ''} detectado{metrics.errors > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Verifique os logs para mais detalhes
            </p>
          </div>
        </motion.div>
      )}

      {/* Info Grid */}
      <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border">
        <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">📊 Uso de Créditos</h4>
          <p className="text-2xl font-bold text-blue-600">{metrics?.creditsUsed || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">créditos usados neste período</p>
        </div>

        <div className="bg-gradient-to-br from-green-500/5 to-green-500/10 border border-green-500/20 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-2">✅ Saúde da App</h4>
          <p className="text-2xl font-bold text-green-600">{metrics?.uptime.toFixed(2) || '0'}%</p>
          <p className="text-xs text-muted-foreground mt-1">uptime nos últimos 30 dias</p>
        </div>
      </div>
    </div>
  )
}
