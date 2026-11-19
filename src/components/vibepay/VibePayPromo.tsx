/**
 * Peça de divulgação do Vertal Vibe Pay (conta digital do Vertal Dev).
 *
 * - variant="hero":    banner grande (home pública e dashboard).
 * - variant="compact": cartão menor (Painel Criativo, Perfil).
 *
 * `to` decide o destino: no app logado é `/pay`; na home pública é a landing
 * `/vibe-pay` (que leva ao login com `redirect=/pay`).
 *
 * Conformidade (docs/VERTAL_BANK.md §10/§12.4): nunca chamar de banco/bank.
 * Contas e pagamentos são do Stripe e do ASAAS.
 */
import { useNavigate } from 'react-router-dom'
import { ArrowRight, QrCode, Globe2, CreditCard, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VIBE_PAY } from '@/config/vibePay'
import { cn } from '@/lib/utils'

export interface VibePayPromoProps {
  variant?: 'hero' | 'compact'
  to?: string
  className?: string
}

const FEATURES = [
  { icon: QrCode, label: 'Pix e boleto' },
  { icon: CreditCard, label: 'Cartão' },
  { icon: Link2, label: 'Links de pagamento' },
  { icon: Globe2, label: 'Conta global em 16 moedas' },
] as const

export function VibePayPromo({ variant = 'hero', to = VIBE_PAY.appPath, className }: VibePayPromoProps) {
  const navigate = useNavigate()
  const go = () => navigate(to)
  const label = `Abrir o ${VIBE_PAY.name}`

  if (variant === 'compact') {
    return (
      <div
        role="link"
        tabIndex={0}
        aria-label={label}
        data-testid="vibe-pay-promo"
        onClick={go}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } }}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-violet-400/40 bg-gradient-to-r from-violet-600/20 via-card to-fuchsia-600/10 p-4 text-left transition hover:border-violet-300/70 sm:p-5',
          className,
        )}
      >
        <img
          src={VIBE_PAY.iconSmall}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-xl bg-black object-contain shadow-[0_0_24px_rgba(139,92,246,0.45)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-base font-bold">{VIBE_PAY.name}</span>
            <span className="rounded-md border border-violet-300/30 bg-violet-400/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">NOVO</span>
          </span>
          <span className="block text-sm text-muted-foreground">
            Sua conta digital no Vertal Dev: receba por Pix, boleto, cartão e links, e tenha uma conta global multimoeda.
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-violet-300 transition group-hover:translate-x-0.5" aria-hidden />
      </div>
    )
  }

  return (
    <section
      role="link"
      tabIndex={0}
      aria-label={label}
      data-testid="vibe-pay-promo"
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } }}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-3xl border border-violet-400/30 bg-black p-6 shadow-[0_0_60px_-15px_rgba(139,92,246,0.55)] transition hover:border-violet-300/60 md:p-10',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" aria-hidden />
      <div className="relative z-10 grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs tracking-[0.3em] text-violet-200/80">VERTAL VIBE PAY</span>
            <span className="rounded-md border border-violet-300/30 bg-violet-400/15 px-2 py-0.5 font-mono text-[10px] text-violet-200">NOVO</span>
          </div>
          <h2 className="mb-3 font-display text-3xl font-bold text-white md:text-4xl">
            Receba de qualquer lugar. <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">Em um só lugar.</span>
          </h2>
          <p className="mb-5 max-w-xl text-sm text-white/70 md:text-base">
            A conta digital do Vertal Dev: Pix, boleto, cartão e links de pagamento no Brasil, e uma conta global
            para receber do exterior e sacar no seu país. Saldo e extrato unificados.
          </p>
          <ul className="mb-6 flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label: f }) => (
              <li key={f} className="flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-400/10 px-2.5 py-1 text-xs text-violet-100">
                <Icon className="h-3.5 w-3.5" aria-hidden /> {f}
              </li>
            ))}
          </ul>
          <Button
            tabIndex={-1}
            className="gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 font-semibold text-white hover:opacity-90"
          >
            Abrir minha conta <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="mt-4 text-[11px] text-white/45">
            Contas e pagamentos fornecidos por Stripe e ASAAS. A Vertal não é instituição financeira.
          </p>
        </div>
        <img
          src={VIBE_PAY.logo}
          alt={VIBE_PAY.name}
          width={VIBE_PAY.logoSize.width}
          height={VIBE_PAY.logoSize.height}
          loading="lazy"
          decoding="async"
          className="mx-auto w-full max-w-md object-contain"
        />
      </div>
    </section>
  )
}

export default VibePayPromo
