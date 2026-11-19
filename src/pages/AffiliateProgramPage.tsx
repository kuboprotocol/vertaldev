import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Gift, Zap, BarChart3, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import AffiliateInstallsManager from '@/components/affiliate/AffiliateInstallsManager'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  AFFILIATE_RATE,
  REFERRAL_PAYOUT_ROUTE,
  formatCommissionTotals,
  summarizeCommissions,
  type CommissionRow,
  type CommissionTotals,
} from '@/lib/referral'

export default function AffiliateProgramPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [commissions, setCommissions] = useState<CommissionTotals[]>([])

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('affiliate_commissions' as never)
        .select('commission_cents, status, currency, commission_currency')
        .eq('affiliate_id', user!.id)

      if (error) throw error

      setCommissions(summarizeCommissions((data ?? []) as unknown as CommissionRow[]))
    } catch (e: any) {
      toast.error(`Erro ao carregar comissões: ${e.message}`)
    } finally {
      setLoading(false)
    }
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
            <h1 className="text-xl font-bold text-foreground font-display">Programa de Afiliados</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          {/* Comissões → Vertal Vibe Pay */}
          <div
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-5"
            data-testid="affiliate-vibe-pay"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Comissões caem no seu Vertal Vibe Pay</p>
                <p className="text-sm text-muted-foreground">
                  {AFFILIATE_RATE * 100}% de cada compra paga por quem você indicou, em reais, liberados após 30 dias
                  (prazo de estorno). Sem conta aberta, o valor fica guardado e cai assim que você abrir.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate(REFERRAL_PAYOUT_ROUTE)} className="gap-2">
              Abrir Vibe Pay <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

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
                    <CardTitle className="text-sm font-medium">Comissões Pendentes</CardTitle>
                    <Gift className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <p className="text-2xl font-display font-bold text-foreground">
                        {formatCommissionTotals(commissions, 'pending')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {AFFILIATE_RATE * 100}% das vendas de quem você indicou
                      </p>
                    </>
                  )}
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
                    <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
                    <Zap className="h-4 w-4 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <p className="text-2xl font-display font-bold text-foreground">
                        {formatCommissionTotals(commissions, 'paid')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Já transferidas para seu Vertal Vibe Pay
                      </p>
                    </>
                  )}
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
                    <CardTitle className="text-sm font-medium">Total de Comissões</CardTitle>
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <p className="text-2xl font-display font-bold text-foreground">
                        {formatCommissionTotals(commissions, 'total')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        De todas as vendas do programa
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="rounded-2xl border border-primary/20 bg-primary/5 p-6"
          >
            <h3 className="font-semibold text-foreground mb-2">💡 Como funciona</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Você pode monetizar o Vertal de duas formas:
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Badge className="mt-1">Referral</Badge>
                <p>Indique amigos com seu link pessoal: +50 créditos para você por cada cadastro + 5% de tudo que eles pagarem. Quem entra pelo seu link ganha 5 créditos por dia, a cada 24 horas.</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge className="mt-1">Embed</Badge>
                <p>Instale nosso widget em seu blog/site: cada clique é rastreado e você ganha 5% das vendas</p>
              </div>
            </div>
          </motion.div>

          {/* Embeds para sites */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="glass glass-border">
              <CardHeader>
                <CardTitle>Instale em seus sites</CardTitle>
                <CardDescription>
                  Crie códigos únicos para rastrear conversões em cada site/blog que você gerencia
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AffiliateInstallsManager />
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
