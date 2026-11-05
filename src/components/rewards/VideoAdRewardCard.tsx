import { useCallback, useEffect, useState } from 'react'
import { Loader2, PlayCircle, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/integrations/supabase/client'
import { MIN_WITHDRAW_CREDITS, REWARD_PER_VIDEO } from '@/config/rewardsConfig'
import { formatCountdown, formatCredits } from '@/lib/rewards'
import VideoAdDialog from './VideoAdDialog'
import WithdrawCreditsDialog from './WithdrawCreditsDialog'

interface RewardStatus {
  balance: number
  can_claim: boolean
  next_available_at: string | null
  min_withdraw: number
  reward_per_video: number
}

const EMPTY_STATUS: RewardStatus = {
  balance: 0,
  can_claim: false,
  next_available_at: null,
  min_withdraw: MIN_WITHDRAW_CREDITS,
  reward_per_video: REWARD_PER_VIDEO,
}

/** Lê a mensagem de erro devolvida pela Edge Function, quando existir. */
async function readFunctionError(error: unknown): Promise<{ message: string; code?: string } | null> {
  try {
    const context = (error as { context?: Response })?.context
    if (!context?.json) return null
    const body = (await context.json()) as { error?: string; code?: string }
    return body?.error ? { message: body.error, code: body.code } : null
  } catch {
    return null
  }
}

export default function VideoAdRewardCard() {
  const [status, setStatus] = useState<RewardStatus>(EMPTY_STATUS)
  const [loading, setLoading] = useState(true)
  const [adOpen, setAdOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const loadStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('video-rewards?action=status', {
        method: 'POST',
        body: {},
      })
      if (error) throw error
      setStatus({ ...EMPTY_STATUS, ...(data as Partial<RewardStatus>) })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'tente novamente'
      toast.error(`Erro ao carregar recompensas: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Relógio da contagem regressiva. Ao zerar, consulta o servidor de novo.
  const nextAt = status.next_available_at ? new Date(status.next_available_at).getTime() : null
  const remainingMs = nextAt && !status.can_claim ? Math.max(0, nextAt - now) : 0

  useEffect(() => {
    if (!nextAt || status.can_claim) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= nextAt) {
        window.clearInterval(timer)
        loadStatus()
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [nextAt, status.can_claim, loadStatus])

  const handleClaim = async () => {
    setClaiming(true)
    try {
      const { data, error } = await supabase.functions.invoke('video-rewards?action=claim', {
        method: 'POST',
        body: {},
      })
      if (error) {
        const detail = await readFunctionError(error)
        if (detail?.code === 'cooldown') {
          toast.error('Você já assistiu um vídeo nesta hora. Volte mais tarde.')
        } else {
          toast.error(detail?.message ?? 'Não foi possível creditar a recompensa.')
        }
        await loadStatus()
        return
      }
      const result = data as { balance: number; next_available_at: string }
      setAdOpen(false)
      setStatus((prev) => ({
        ...prev,
        balance: result.balance,
        can_claim: false,
        next_available_at: result.next_available_at,
      }))
      toast.success(`+${formatCredits(REWARD_PER_VIDEO)} créditos adicionados`)
    } finally {
      setClaiming(false)
    }
  }

  const handleWithdraw = async (pixKey: string) => {
    setWithdrawing(true)
    try {
      const { data, error } = await supabase.functions.invoke('video-rewards?action=withdraw', {
        method: 'POST',
        body: { pix_key: pixKey },
      })
      if (error) {
        const detail = await readFunctionError(error)
        toast.error(detail?.message ?? 'Não foi possível solicitar o saque.')
        await loadStatus()
        return
      }
      const result = data as { amount: number; balance: number }
      setWithdrawOpen(false)
      setStatus((prev) => ({ ...prev, balance: result.balance }))
      toast.success(`Saque de ${formatCredits(result.amount)} créditos solicitado. Pagamento via PIX em análise.`)
    } finally {
      setWithdrawing(false)
    }
  }

  const canClaim = status.can_claim && !loading

  return (
    <Card className="glass glass-border overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-display">Assista e ganhe</CardTitle>
          <span className="text-xs text-muted-foreground">1 vídeo por hora</span>
        </div>
        <CardDescription>
          Cada vídeo assistido até o fim rende {formatCredits(REWARD_PER_VIDEO)} créditos.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col items-center gap-3 py-2">
          <Button
            size="lg"
            variant="hero"
            className="h-14 w-full max-w-xs rounded-2xl gap-2 text-base"
            disabled={!canClaim || claiming}
            onClick={() => setAdOpen(true)}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <PlayCircle className="h-5 w-5" />
            )}
            {loading
              ? 'Carregando...'
              : canClaim
                ? `Assistir vídeo (+${formatCredits(REWARD_PER_VIDEO)})`
                : 'Vídeo indisponível'}
          </Button>

          {!loading && !canClaim && remainingMs > 0 && (
            <p className="text-sm text-muted-foreground">
              Próximo vídeo em{' '}
              <span className="font-mono font-semibold text-foreground">{formatCountdown(remainingMs)}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carteira de recompensas</p>
              <p className="font-display text-xl font-bold text-foreground">
                {formatCredits(status.balance)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">créditos</span>
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={loading || status.balance < status.min_withdraw}
            onClick={() => setWithdrawOpen(true)}
          >
            {status.balance < status.min_withdraw
              ? `Saque a partir de ${formatCredits(status.min_withdraw)}`
              : 'Sacar via PIX'}
          </Button>
        </div>
      </CardContent>

      <VideoAdDialog
        open={adOpen}
        onOpenChange={(open) => {
          if (!claiming) setAdOpen(open)
        }}
        submitting={claiming}
        onComplete={handleClaim}
      />

      <WithdrawCreditsDialog
        open={withdrawOpen}
        onOpenChange={(open) => {
          if (!withdrawing) setWithdrawOpen(open)
        }}
        balance={status.balance}
        minWithdraw={status.min_withdraw}
        submitting={withdrawing}
        onSubmit={handleWithdraw}
      />
    </Card>
  )
}
