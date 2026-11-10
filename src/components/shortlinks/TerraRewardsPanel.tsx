import { useCallback, useEffect, useState } from 'react'
import { Coins, ExternalLink, Loader2, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/integrations/supabase/client'
import { openTerraSmartlink } from '@/lib/terraAds'

/** Resposta da função `shortlinks` (ações ad-status, ad-click e ad-withdraw). */
interface AdRewardStatus {
  reward_per_click: number
  min_withdraw: number
  pending: number
  next_click_at: string | null
  can_click: boolean
  withdrawable: number
  can_withdraw: boolean
  /** Presente quando a ação foi aceita. */
  success?: boolean
  credits_withdrawn?: number
}

const credits = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function callAdReward(action: 'ad-status' | 'ad-click' | 'ad-withdraw'): Promise<AdRewardStatus> {
  const { data, error } = await supabase.functions.invoke(`shortlinks?action=${action}`, { method: 'POST', body: {} })
  if (error) {
    // Recusas de regra (espera, saldo mínimo) vêm com o estado atual no corpo da resposta.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    if (body && typeof body.pending === 'number') return body as AdRewardStatus
    throw error
  }
  return data as AdRewardStatus
}

export default function TerraRewardsPanel({ onWithdrawn }: { onWithdrawn?: () => void }) {
  const [status, setStatus] = useState<AdRewardStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<'click' | 'withdraw' | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    try {
      setStatus(await callAdReward('ad-status'))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const nextClickMs = status?.next_click_at ? Date.parse(status.next_click_at) : null
  const waitMs = nextClickMs === null ? 0 : nextClickMs - now

  useEffect(() => {
    if (nextClickMs === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [nextClickMs])

  const handleClick = async () => {
    // Abrir o anúncio vem primeiro e no mesmo gesto do clique, senão o navegador bloqueia a aba.
    openTerraSmartlink()
    setBusy('click')
    try {
      const next = await callAdReward('ad-click')
      setStatus(next)
      setNow(Date.now())
      if (next.success) {
        toast.success(`+${credits(next.reward_per_click)} crédito`)
      } else {
        toast.info('Ainda não deu 1 hora desde o último anúncio.')
      }
    } catch {
      toast.error('Não foi possível registrar o anúncio. Tente de novo.')
    } finally {
      setBusy(null)
    }
  }

  const handleWithdraw = async () => {
    setBusy('withdraw')
    try {
      const next = await callAdReward('ad-withdraw')
      setStatus(next)
      if (next.success) {
        toast.success(`${next.credits_withdrawn} créditos adicionados ao seu saldo`)
        onWithdrawn?.()
      } else {
        toast.info(`A retirada libera a partir de ${next.min_withdraw} créditos.`)
      }
    } catch {
      toast.error('Não foi possível retirar agora. Seu saldo pendente continua guardado.')
    } finally {
      setBusy(null)
    }
  }

  if (failed && !status) {
    return (
      <Card className="glass glass-border">
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <p className="text-sm text-muted-foreground">Não foi possível carregar as recompensas por anúncio.</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card className="glass glass-border">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Carregando recompensas" />
        </CardContent>
      </Card>
    )
  }

  const waiting = !status.can_click && waitMs > 0
  const progress = Math.min(100, (status.pending / status.min_withdraw) * 100)

  return (
    <Card className="glass glass-border" data-testid="terra-rewards-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            Recompensa por anúncio
          </CardTitle>
          <span className="text-xs text-muted-foreground">TERRA ADS</span>
        </div>
        <CardDescription>
          Abra um anúncio e ganhe {credits(status.reward_per_click)} crédito. Um anúncio por hora. Retirada a partir de{' '}
          {status.min_withdraw} créditos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-display font-bold text-foreground" data-testid="terra-rewards-pending">
              {credits(status.pending)}
            </p>
            <p className="text-xs text-muted-foreground">de {status.min_withdraw} para retirar</p>
          </div>
          <Progress value={progress} className="mt-2 h-2" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1 gap-2" onClick={handleClick} disabled={waiting || busy !== null}>
            {busy === 'click' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : waiting ? (
              <Timer className="h-4 w-4" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {waiting ? `Próximo anúncio em ${countdown(waitMs)}` : 'Abrir anúncio'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleWithdraw}
            disabled={!status.can_withdraw || busy !== null}
          >
            {busy === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {status.can_withdraw ? `Retirar ${status.withdrawable} créditos` : 'Retirar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
