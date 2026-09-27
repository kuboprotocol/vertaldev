import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Gift, Zap, BarChart3, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import AffiliateApiKeys from '@/components/affiliate/AffiliateApiKeys'
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
                        {formatCents(commissions.pending)}
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
                        {formatCents(commissions.paid)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Já transferidas para sua conta
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
                        {formatCents(commissions.total)}
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
                <p>Indique amigos com seu link pessoal: +100 créditos para você + 5% de tudo que eles pagarem</p>
              </div>
              <div className="flex items-start gap-3">
                <Badge className="mt-1">Embed</Badge>
                <p>Instale nosso widget em seu blog/site: cada clique é rastreado e você ganha 5% das vendas</p>
              </div>
            </div>
          </motion.div>

          {/* Tabs com as features */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Tabs defaultValue="embeds" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="embeds">Embeds para Sites</TabsTrigger>
                <TabsTrigger value="api-keys">API Keys (MCP)</TabsTrigger>
              </TabsList>

              <TabsContent value="embeds" className="space-y-6">
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
              </TabsContent>

              <TabsContent value="api-keys" className="space-y-6">
                <Card className="glass glass-border">
                  <CardHeader>
                    <CardTitle>Chaves API do MCP</CardTitle>
                    <CardDescription>
                      Crie e gerencie chaves para integrar o MCP em suas aplicações
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AffiliateApiKeys />
                  </CardContent>
                </Card>

                {/* Documentação */}
                <Card className="glass glass-border border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-base">Como usar a API MCP</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3 text-sm">
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">1. Gerar uma chave</h4>
                        <p className="text-muted-foreground">
                          Crie uma chave na aba acima. Você verá a chave apenas uma vez.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">2. Usar em requisições</h4>
                        <code className="block bg-muted p-2 rounded text-xs font-mono mt-1">
                          curl -X POST https://vertal.app/functions/v1/mcp \<br />
                          &nbsp;&nbsp;-H "Authorization: Bearer YOUR_KEY" \<br />
                          &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                          &nbsp;&nbsp;-d '{"{jsonrpc: \"2.0\", ...}"}'
                        </code>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">3. Documentação</h4>
                        <Button variant="outline" size="sm" asChild>
                          <a href="/docs/mcp" target="_blank" rel="noopener noreferrer">
                            Ver documentação completa →
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
