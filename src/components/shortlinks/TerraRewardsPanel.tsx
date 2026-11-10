import { useCallback, useEffect, useRef, useState } from 'react'
import { Coins, Loader2, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/integrations/supabase/client'
import { TERRA_ADS_NATIVE_BANNER_ID, TERRA_ADS_NATIVE_BANNER_SRC } from '@/lib/terraAds'

/** Segundos que o anúncio precisa ficar visível na tela antes de liberar o crédito. */
export const WATCH_SECONDS = 10

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

/**
 * Anúncio TERRA ADS embutido no próprio painel: aparece no layout da página, o usuário
 * assiste, e se quiser clicar ele leva ao anunciante na mesma aba do link do anúncio.
 * Conta o tempo só enquanto o anúncio está preenchido, visível na tela e a aba em primeiro plano.
 */
function WatchableAd({ onReady }: { onReady: (ready: boolean) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [filled, setFilled] = useState(false)
  const [watched, setWatched] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const script = document.createElement('script')
    script.async = true
    script.dataset.cfasync = 'false'
    script.src = TERRA_ADS_NATIVE_BANNER_SRC
    container.appendChild(script)

    const checkFilled = () => {
      const hasAd = Array.from(container.children).some((el) => el.tagName !== 'SCRIPT')
      if (hasAd) setFilled(true)
    }
    const fillObserver = new MutationObserver(checkFilled)
    fillObserver.observe(container, { childList: true, subtree: true })

    // Sem IntersectionObserver (navegador antigo ou ambiente de teste), considera visível: o
    // tempo ainda depende de o anúncio estar preenchido e da aba estar em primeiro plano.
    let visible = typeof IntersectionObserver === 'undefined'
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting && entry.intersectionRatio >= 0.5
            },
            { threshold: [0, 0.5, 1] },
          )
    io?.observe(container)

    const timer = setInterval(() => {
      if (visible && document.visibilityState === 'visible' && container.children.length > 0) {
        setWatched((s) => Math.min(WATCH_SECONDS, s + 1))
      }
    }, 1000)

    return () => {
      clearInterval(timer)
      fillObserver.disconnect()
      io?.disconnect()
      script.remove()
    }
  }, [])

  const ready = filled && watched >= WATCH_SECONDS
  useEffect(() => {
    onReady(ready)
  }, [ready, onReady])

  const left = Math.max(0, WATCH_SECONDS - watched)
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3" data-testid="terra-watch-ad">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Patrocinado</span>
        <span>{!filled ? 'Carregando anúncio…' : ready ? 'Pronto para receber' : `Assista ${left}s`}</span>
      </div>
      <div ref={containerRef} id={TERRA_ADS_NATIVE_BANNER_ID} className="w-full min-h-[90px]" />
      <Progress value={(watched / WATCH_SECONDS) * 100} className="h-1" />
    </div>
  )
}

export default function TerraRewardsPanel({ onWithdrawn }: { onWithdrawn?: () => void }) {
  const [status, setStatus] = useState<AdRewardStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<'click' | 'withdraw' | null>(null)
  const [adReady, setAdReady] = useState(false)
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

  const handleReceive = async () => {
    setBusy('click')
    try {
      const next = await callAdReward('ad-click')
      setStatus(next)
      setNow(Date.now())
      setAdReady(false)
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
          Assista ao anúncio por {WATCH_SECONDS} segundos e ganhe {credits(status.reward_per_click)} crédito. Um por
          hora. Retirada a partir de {status.min_withdraw} créditos.
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

        {status.can_click ? (
          <>
            <WatchableAd onReady={setAdReady} />
            <Button className="w-full" onClick={handleReceive} disabled={!adReady || busy !== null}>
              {busy === 'click' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {adReady ? `Receber ${credits(status.reward_per_click)} crédito` : 'Assista ao anúncio para receber'}
            </Button>
          </>
        ) : (
          <Button className="w-full gap-2" disabled>
            <Timer className="h-4 w-4" />
            {waiting ? `Próximo anúncio em ${countdown(waitMs)}` : 'Aguarde'}
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full"
          onClick={handleWithdraw}
          disabled={!status.can_withdraw || busy !== null}
        >
          {busy === 'withdraw' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {status.can_withdraw ? `Retirar ${status.withdrawable} créditos` : 'Retirar'}
        </Button>
      </CardContent>
    </Card>
  )
}
