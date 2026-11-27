import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { fetchCreditBalance } from '@/lib/creditBalance'
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import RewardedVideoPanel from '@/components/shortlinks/RewardedVideoPanel'
import VertalNodeCard from '@/components/shortlinks/VertalNodeCard'
import KuboMusicPanel from '@/components/shortlinks/KuboMusicPanel'
import DailyChecklistCard from '@/components/shortlinks/DailyChecklistCard'
import { fetchDailyChecklist, reportTerraUnavailable, type DailyChecklist } from '@/lib/dailyRewards'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

/**
 * Painel de recompensas (/recompensas): checklist do dia, vídeo premiado, músicas do Kubo,
 * Vertal Node (bônus opcional) e saldo. As recompensas do dia só vão para o saldo quando as
 * 3 atividades obrigatórias (vídeo, 5 músicas, vídeo extra) estão feitas.
 * O anúncio TERRA ADS (Adsterra) foi removido do site (política do Google Ads).
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
  const extraVideoStepRef = useRef(false)

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
      toast.error(`We could not load your balance: ${e.message}`)
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
        toast.success('Rewards released', {
          description: 'You finished all of today\'s activities. The credits are in your balance.',
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

  // Sem anúncio TERRA no site: o passo legado "TERRA" do servidor fecha com 1 vídeo premiado extra.
  // Registra isso uma vez por visita, só quando o dia ainda não tem o registro (idempotente no servidor).
  useEffect(() => {
    if (!user || !checklist || extraVideoStepRef.current) return
    if (checklist.terra_done || checklist.terra_unavailable) return
    extraVideoStepRef.current = true
    reportTerraUnavailable('panel_error')
      .then((res) => {
        if (res?.ok && res.checklist) applyChecklist(res.checklist)
      })
      .catch(() => {
        /* tenta de novo na próxima visita */
      })
  }, [user, checklist, applyChecklist])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <AppShell topBar={<AppTopBar back={{ to: '/profile', label: 'Profile' }} />}>
      <PanelHeader
        title="Rewards"
        description="Earn extra credits with optional activities. Finish today's activities to release the credits."
      />
      <div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          {/* Today's checklist (needed to release the rewards) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <DailyChecklistCard checklist={checklist} />
          </motion.div>

          {/* Balance */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="rounded-2xl border-white/[0.06] bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Balance</CardTitle>
                  {userDebt > 0 ? (
                    <AlertCircle className="h-4 w-4 text-destructive" aria-label="Debt" />
                  ) : (
                    <Wallet className="h-4 w-4 text-primary" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-[-0.02em] text-foreground">
                  {userBalance.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">credits available</p>
                {userDebt > 0 && (
                  <p className="text-xs text-destructive mt-1">
                    Debt: {userDebt} credits
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
                  You have a debt of <span className="font-semibold">{userDebt} credits</span>.
                  Credits you earn from rewards pay it off first.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* 1 and 3. Reward video (AppLixir; the 2nd of the day is the extra one) and 2. Kubo music (Spotify) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid gap-4 md:grid-cols-2"
          >
            <RewardedVideoPanel onCredited={onActivity} />
            <KuboMusicPanel checklist={checklist} onProgress={applyChecklist} />
          </motion.div>

          {/* Optional bonus: Vertal Node (desktop/Android app), not part of the checklist */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-2"
          >
            <p className="text-sm font-medium text-muted-foreground">Optional bonus</p>
            <div className="grid gap-4 md:grid-cols-2">
              <VertalNodeCard />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </AppShell>
  )
}
