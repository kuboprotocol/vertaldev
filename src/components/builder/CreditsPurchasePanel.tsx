import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Loader2, CheckCircle, AlertCircle, TrendingUp, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Transaction {
  id: string
  amount_cents: number
  credits_purchased: number
  tier: string
  status: 'pending' | 'completed' | 'failed'
  created_at: string
  completed_at?: string
}

interface CreditsPurchasePanelProps {
  currentBalance?: number
  onPurchaseSuccess?: () => void
}

const TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 50,
    price: '$4.99',
    priceCents: 499,
    perCredit: '$0.10',
    popular: false,
    features: ['50 Créditos', 'Válido por 30 dias', 'Suporte básico'],
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 150,
    price: '$12.99',
    priceCents: 1299,
    perCredit: '$0.087',
    popular: true,
    features: ['150 Créditos', 'Válido por 60 dias', 'Suporte prioritário', 'Bônus: +5%'],
  },
  {
    id: 'premium',
    name: 'Premium',
    credits: 350,
    price: '$24.99',
    priceCents: 2499,
    perCredit: '$0.071',
    popular: false,
    features: ['350 Créditos', 'Válido por 90 dias', 'Suporte VIP', 'Bônus: +10%'],
  },
]

export default function CreditsPurchasePanel({
  currentBalance = 0,
  onPurchaseSuccess,
}: CreditsPurchasePanelProps) {
  const [selectedTier, setSelectedTier] = useState<string>('pro')
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchTransactions()
  }, [])

  const fetchTransactions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/stripe-payments?action=list-transactions`,
        {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      )

      if (!response.ok) throw new Error('Failed to fetch transactions')

      const result = await response.json()
      setTransactions(result.transactions || [])
    } catch (err) {
      console.error('Error fetching transactions:', err)
    }
  }

  const handlePurchase = async (tierId: string) => {
    try {
      setLoading(true)
      setProcessing(true)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.')
        return
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/stripe-payments?action=create-session`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tier: tierId }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout session')
      }

      const result = await response.json()

      if (result.checkoutUrl) {
        // Redirecionar para Stripe Checkout
        window.location.href = result.checkoutUrl
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar pagamento')
      console.error('Purchase error:', err)
    } finally {
      setLoading(false)
      setProcessing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'pending':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return null
    }
  }

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg">
            <CreditCard className="h-6 w-6 text-yellow-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold font-display">Comprar Créditos</h3>
            <p className="text-sm text-muted-foreground">
              Recarregue seus créditos para continuar criando aplicativos
            </p>
          </div>
        </div>

        {/* Current Balance */}
        <div className="flex items-center gap-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-4 border border-primary/20">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">Saldo Atual</p>
            <p className="text-3xl font-bold text-primary">{currentBalance} créditos</p>
          </div>
          <Zap className="h-12 w-12 text-yellow-500 opacity-50" />
        </div>
      </motion.div>

      {/* Pricing Tiers */}
      <div className="space-y-4">
        <h4 className="font-semibold text-sm">Escolha seu plano:</h4>
        <div className="grid md:grid-cols-3 gap-4">
          {TIERS.map((tier, idx) => (
            <motion.div
              key={tier.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`relative cursor-pointer transition-all ${
                selectedTier === tier.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedTier(tier.id)}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <Badge className="bg-primary text-primary-foreground">Popular</Badge>
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />

              <div className={`relative bg-card/50 backdrop-blur border rounded-xl p-6 space-y-4 transition-all ${
                selectedTier === tier.id ? 'border-primary' : 'border-primary/20'
              }`}>
                <div>
                  <h5 className="font-bold text-lg mb-2">{tier.name}</h5>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    <span className="text-xs text-muted-foreground">/ {tier.perCredit} por crédito</span>
                  </div>
                </div>

                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="text-2xl font-bold text-primary">{tier.credits}</p>
                  <p className="text-xs text-muted-foreground">créditos</p>
                </div>

                <ul className="space-y-2">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePurchase(tier.id)}
                  disabled={loading}
                  className={`w-full ${
                    selectedTier === tier.id
                      ? 'bg-primary hover:bg-primary/90'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {loading && selectedTier === tier.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processando...
                    </>
                  ) : (
                    'Comprar Agora'
                  )}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-foreground">Créditos Nunca Expiram</p>
              <p className="text-xs text-muted-foreground">
                Seus créditos são mantidos na conta indefinidamente
              </p>
            </div>
          </div>
        </div>

        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <TrendingUp className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-foreground">Ganhe Bônus</p>
              <p className="text-xs text-muted-foreground">
                Planos Pro e Premium incluem bônus de 5-10% em créditos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="space-y-3 border-t border-border pt-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-primary hover:underline flex items-center gap-2"
          >
            {showHistory ? '✕' : '📋'} {showHistory ? 'Fechar' : 'Ver'} Histórico ({transactions.length})
          </button>

          {showHistory && (
            <div className="space-y-2">
              {transactions.map(tx => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 bg-card/50 border border-border rounded-lg text-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(tx.status)}
                      <span className="font-medium capitalize">{tx.tier}</span>
                      <span className="text-muted-foreground">+{tx.credits_purchased} créditos</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="font-semibold">${(tx.amount_cents / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Security Note */}
      <div className="text-xs text-muted-foreground text-center p-4 bg-muted/30 rounded-lg border border-border">
        🔒 Pagamentos processados com segurança por{' '}
        <span className="font-semibold">Stripe</span>. Sua informação de cartão nunca é armazenada.
      </div>
    </div>
  )
}
