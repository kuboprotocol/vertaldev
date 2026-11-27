import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Gift, Zap, BarChart3, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import AffiliateInstallsManager from '@/components/affiliate/AffiliateInstallsManager'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { AFFILIATE_RATE, formatCents } from '@/lib/referral'

interface CommissionSummary {
  pending: number
  paid: number
  total: number
}

export default function AffiliateProgramPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [commissions, setCommissions] = useState<CommissionSummary>({
    pending: 0,
    paid: 0,
    total: 0,
  })

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('affiliate_commissions' as never)
        .select('commission_cents, status')
        .eq('affiliate_id', user!.id)

      if (error) throw error

      const stats = (data as Array<{ commission_cents: number; status: string }>).reduce(
        (acc, c) => {
          acc.total += c.commission_cents
          if (c.status === 'paid') acc.paid += c.commission_cents
          else if (c.status === 'pending' || c.status === 'approved')
            acc.pending += c.commission_cents
          return acc
        },
        { pending: 0, paid: 0, total: 0 }
      )

      setCommissions(stats)
    } catch (e: any) {
      toast.error(`We could not load your commissions: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell topBar={<AppTopBar back={{ to: '/profile', label: 'Profile' }} />}>
      <PanelHeader
        title="Affiliate program"
        description={`Earn ${AFFILIATE_RATE * 100}% of what the people you refer pay.`}
      />
      <div>
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
              <Card className="rounded-2xl border-white/[0.06] bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Pending commissions</CardTitle>
                    <Gift className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <p className="text-3xl font-semibold tracking-[-0.02em] text-foreground">
                        {formatCents(commissions.pending)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {AFFILIATE_RATE * 100}% of sales from people you referred
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
              <Card className="rounded-2xl border-white/[0.06] bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Paid commissions</CardTitle>
                    <Zap className="h-4 w-4 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <p className="text-3xl font-semibold tracking-[-0.02em] text-foreground">
                        {formatCents(commissions.paid)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Already sent to your account
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
              <Card className="rounded-2xl border-white/[0.06] bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Total commissions</CardTitle>
                    <BarChart3 className="h-4 w-4 text-purple-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <p className="text-3xl font-semibold tracking-[-0.02em] text-foreground">
                        {formatCents(commissions.total)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        From all your program sales
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
            className="rounded-2xl border border-white/[0.06] bg-card/50 p-6"
          >
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground mb-2">How it works</h2>
            <p className="text-sm text-muted-foreground mb-4">
              You can earn with Vertal in two ways:
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Badge className="mt-1">Referral</Badge>
                <p>Invite friends with your personal link. You get 50 credits for each sign-up plus 5% of everything they pay. People who join with your link get 5 credits per day, every 24 hours.</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge className="mt-1">Embed</Badge>
                <p>Add our widget to your blog or website. We track each click, and you earn 5% of the sales.</p>
              </div>
            </div>
          </motion.div>

          {/* Embeds for websites */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="rounded-2xl border-white/[0.06] bg-card/50">
              <CardHeader>
                <CardTitle>Add it to your websites</CardTitle>
                <CardDescription>
                  Create a unique code for each website or blog you manage, so we can track its sign-ups and sales.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AffiliateInstallsManager />
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </AppShell>
  )
}
