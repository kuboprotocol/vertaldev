import { useCallback, useEffect, useState } from 'react'
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
import { toast } from 'sonner'
import { motion } from 'framer-motion'

/**
 * Painel de recompensas (/recompensas): vídeo premiado, Vertal Node, TERRA ADS e saldo.
 * O antigo sistema de shortlinks (vídeos curtos com crédito diário) foi desativado;
 * /shortlinks redireciona para cá.
 */
export default function RewardsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [userBalance, setUserBalance] = useState(0)
  const [userDebt, setUserDebt] = useState(0)

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

          {/* Vídeo premiado (AppLixir) e Vertal Node (SDKs de banda) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid gap-4 md:grid-cols-2"
          >
            <RewardedVideoPanel onCredited={loadData} />
            <VertalNodeCard />
          </motion.div>

          {/* Recompensa por anúncio TERRA ADS */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <TerraRewardsPanel onWithdrawn={loadData} />
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
