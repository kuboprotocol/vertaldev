import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { fetchCreditBalance } from '@/lib/creditBalance'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import TerraRewardsPanel from '@/components/shortlinks/TerraRewardsPanel'
import RewardedVideoPanel from '@/components/shortlinks/RewardedVideoPanel'
import VertalNodeCard from '@/components/shortlinks/VertalNodeCard'
import KuboMusicPanel from '@/components/shortlinks/KuboMusicPanel'
import DailyChecklistCard from '@/components/shortlinks/DailyChecklistCard'
import { fetchDailyChecklist, type DailyChecklist } from '@/lib/dailyRewards'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

/**
 * Painel de recompensas (/recompensas): checklist do dia, vídeo premiado, músicas do Kubo,
 * TERRA ADS, Vertal Node (bônus opcional) e saldo. As recompensas do dia só vão para o saldo
 * quando as 3 atividades obrigatórias (vídeo, 5 músicas, TERRA ADS) estão feitas.
 * O antigo sistema de shortlinks (vídeos curtos com crédito diário) foi desativado;
 * /shortlinks redireciona para cá.
 */
export default function RewardsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [userBalance, setUserBalance] = useState(0)
  const [userDebt, setUserDebt] = useState(0)
  const [checklist, setChecklist] = useState<DailyChecklist | null>(null)
  const completedRef = useRef<boolean | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [debtRes, balance] = await Promise.all([
        // user_credits é a carteira legada: só o débito ainda vem dela.
        supabase.from('user_credits').select('debt').eq('user_id', user.id).maybeSingle(),
        // Saldo = assinatura ativa (mesma fonte do cabeçalho e do extrato).
        fetchCreditBalance(user.id),
      ])
      setUserBalance(balance ?? 0)
      if (!debtRes.error && debtRes.data) {
        setUserDebt(debtRes.data.debt || 0)
      }
    } catch (e: any) {
      toast.error(`Erro ao carregar o saldo: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Checklist do dia: recebe o estado do servidor (status ou resposta de uma atividade).
  const applyChecklist = useCallback(
    (next: DailyChecklist | null | undefined) => {
      if (!next || typeof next.completed !== 'boolean') return
      setChecklist((prev) => ({ ...prev, ...next, music_min_seconds: next.music_min_seconds ?? prev?.music_min_seconds }))
      const wasCompleted = completedRef.current
      completedRef.current = next.completed
      if (next.just_completed || (wasCompleted === false && next.completed)) {
        toast.success('Recompensas liberadas!', {
          description: 'Você completou todas as atividades do dia. Os créditos foram para o seu saldo.',
        })
        loadData()
      }
    },
    [loadData],
  )

  const refreshChecklist = useCallback(async () => {
    if (!user) return
    try {
      applyChecklist(await fetchDailyChecklist())
    } catch {
      /* o checklist é recalculado na próxima atividade */
    }
  }, [user, applyChecklist])

  useEffect(() => {
    refreshChecklist()
  }, [refreshChecklist])

  const onActivity = useCallback(() => {
    loadData()
    refreshChecklist()
  }, [loadData, refreshChecklist])

  // TERRA ADS não carregou: o servidor registrou e devolveu o checklist (passo TERRA via vídeo extra).
  const onTerraUnavailable = useCallback(
    (next: DailyChecklist | undefined) => (next ? applyChecklist(next) : refreshChecklist()),
    [applyChecklist, refreshChecklist],
  )

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
            <h1 className="text-xl font-bold text-foreground font-display">Recompensas</h1>
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
          {/* Checklist do dia (obrigatório para liberar as recompensas) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <DailyChecklistCard checklist={checklist} />
          </motion.div>

          {/* Saldo */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="glass glass-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Saldo</CardTitle>
                  {userDebt > 0 ? (
                    <span className="text-destructive">⚠️</span>
                  ) : (
                    <Wallet className="h-4 w-4 text-primary" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-display font-bold text-foreground">
                  {userBalance.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
                {userDebt > 0 && (
                  <p className="text-xs text-destructive mt-1">
                    Débito: {userDebt} créditos
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Debt Warning */}
          {userDebt > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ⚠️ Você tem um débito de <span className="font-semibold">{userDebt} créditos</span>.
                  Os créditos ganhos com recompensas serão descontados automaticamente.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* 1. Vídeo premiado (AppLixir) e 2. Músicas do Kubo (Spotify) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid gap-4 md:grid-cols-2"
          >
            <RewardedVideoPanel onCredited={onActivity} />
            <KuboMusicPanel checklist={checklist} onProgress={applyChecklist} />
          </motion.div>

          {/* 3. Recompensa por anúncio TERRA ADS */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <TerraRewardsPanel
              onWithdrawn={loadData}
              onActivity={refreshChecklist}
              onUnavailable={onTerraUnavailable}
            />
          </motion.div>

          {/* Bônus opcional: Vertal Node (app desktop/Android), fora do checklist */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-2"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bônus opcional</p>
            <div className="grid gap-4 md:grid-cols-2">
              <VertalNodeCard />
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
