import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Video, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import ShortlinksUploader from '@/components/shortlinks/ShortlinksUploader'
import ShortlinksList from '@/components/shortlinks/ShortlinksList'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

interface Shortlink {
  id: string
  title: string
  description?: string
  video_url: string
  video_duration_seconds: number
  status: string
  view_count: number
  created_at: string
  updated_at: string
}

interface Limits {
  active_count: number
  max_allowed: number
  can_create_more: boolean
  daily_base_reward: number
  daily_bonus_reward: number
  total_daily_reward: number
}

export default function ShortlinksPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [shortlinks, setShortlinks] = useState<Shortlink[]>([])
  const [limits, setLimits] = useState<Limits | null>(null)
  const [userBalance, setUserBalance] = useState(0)
  const [userDebt, setUserDebt] = useState(0)

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    try {
      const [shortlinksRes, limitsRes, profileRes] = await Promise.all([
        supabase.functions.invoke('shortlinks?action=list', {
          method: 'POST',
          body: {},
        }),
        supabase.functions.invoke('shortlinks?action=get-limits', {
          method: 'POST',
          body: {},
        }),
        supabase.from('user_credits').select('balance, debt').eq('user_id', user!.id).single(),
      ])

      if (shortlinksRes.error) throw shortlinksRes.error
      if (limitsRes.error) throw limitsRes.error

      setShortlinks(shortlinksRes.data.shortlinks || [])
      setLimits(limitsRes.data)

      if (!profileRes.error && profileRes.data) {
        setUserBalance(profileRes.data.balance || 0)
        setUserDebt(profileRes.data.debt || 0)
      }
    } catch (e: any) {
      toast.error(`Erro ao carregar shortlinks: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      {/* Header */}
      <header className="glass glass-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} className="hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <AnimatedLogo size={15} />
            <h1 className="text-xl font-bold text-foreground font-display">Shortlinks</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="glass glass-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Shortlinks Ativos</CardTitle>
                    <Video className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-display font-bold text-foreground">
                    {limits?.active_count || 0}/10
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {limits?.can_create_more ? '✓ Pode criar mais' : '⚠️ Limite atingido'}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <Card className="glass glass-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Créditos Diários</CardTitle>
                    <Badge className="bg-primary/20 text-primary">Hoje</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-display font-bold text-foreground">
                    +{limits?.total_daily_reward || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base: {limits?.daily_base_reward || 5} + Bônus: {limits?.daily_bonus_reward || 0}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="glass glass-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Saldo</CardTitle>
                    <span className={userDebt > 0 ? 'text-destructive' : 'text-green-500'}>
                      {userDebt > 0 ? '⚠️' : '✓'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-display font-bold text-foreground">
                    {userBalance}
                  </p>
                  {userDebt > 0 && (
                    <p className="text-xs text-destructive mt-1">
                      Débito: {userDebt} créditos
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Debt Warning */}
          {userDebt > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
            >
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ⚠️ Você tem um débito de <span className="font-semibold">{userDebt} créditos</span>. 
                  Os créditos ganhos com shortlinks serão descontados automaticamente.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="rounded-2xl border border-primary/20 bg-primary/5 p-6"
          >
            <h3 className="font-semibold text-foreground mb-3">🎬 Como funciona</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Badge>1</Badge>
                <p>Faça upload de um vídeo curto (5-7 segundos)</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge>2</Badge>
                <p><span className="font-semibold text-foreground">5 créditos por dia</span> por cada shortlink ativo</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge>3</Badge>
                <p><span className="font-semibold text-foreground">Bônus: +5 créditos</span> para cada 10 shortlinks (ex: 10-19 = +5, 20-29 = +10)</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge>4</Badge>
                <p>Máximo <span className="font-semibold text-foreground">10 shortlinks</span> ativos por vez</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge>5</Badge>
                <p>Recompensas recalculadas <span className="font-semibold text-foreground">diariamente</span> (sem acumular)</p>
              </div>
            </div>
          </motion.div>

          {/* Upload Section */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <ShortlinksUploader
              onSuccess={loadData}
              canCreateMore={limits?.can_create_more || false}
              activeCount={limits?.active_count || 0}
            />
          </motion.div>

          {/* Shortlinks List */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <ShortlinksList
              shortlinks={shortlinks}
              onDelete={loadData}
              dailyReward={limits?.total_daily_reward || 5}
            />
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
