import { useState } from 'react'
import { ArrowRight, Check, Coins, Wifi, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BANDWIDTH_SHARING_FLAGS } from '@/config/features'
import { useBandwidthConsent } from '@/hooks/useBandwidthConsent'
import { dismissPromo, isPromoDismissed } from '@/lib/bandwidthSharing'
import { cn } from '@/lib/utils'
import { BandwidthConsentDialog } from './BandwidthConsentDialog'
import { useBandwidthTexts } from './useBandwidthTexts'

/**
 * Banner próprio (não é anúncio) convidando ao compartilhamento de banda.
 * O botão só ABRE a tela de consentimento; nada é ligado por aqui.
 * Some quando o usuário dispensa (lembrado no navegador) ou quando já ativou.
 *
 * - variant="hero":    entrada (landing pública).
 * - variant="compact": painel principal (dashboard).
 */
export function BandwidthPromoBanner({
  variant = 'hero',
  className,
}: {
  variant?: 'hero' | 'compact'
  className?: string
}) {
  const { t } = useBandwidthTexts()
  const { consent } = useBandwidthConsent()
  const [dismissed, setDismissed] = useState(isPromoDismissed)
  const [open, setOpen] = useState(false)

  if (!BANDWIDTH_SHARING_FLAGS.ui || dismissed || consent.optedIn) {
    // O diálogo pode continuar aberto logo depois de o usuário ativar.
    return open ? <BandwidthConsentDialog open={open} onOpenChange={setOpen} /> : null
  }

  const onDismiss = () => {
    dismissPromo()
    setDismissed(true)
  }

  const hero = variant === 'hero'

  return (
    <>
      <section
        aria-label={t.promoTitle}
        data-testid="bandwidth-promo"
        data-variant={variant}
        className={cn(
          'relative isolate overflow-hidden rounded-3xl border border-violet-400/30 bg-[#0b0814] text-left shadow-[0_0_60px_-20px_rgba(139,92,246,0.55)]',
          hero ? 'p-6 sm:p-10' : 'p-5 sm:p-6',
          className,
        )}
      >
        {/* Fundo: brilhos roxos e grade sutil */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-0 -z-10 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:32px_32px]"
        />

        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.promoDismiss}
          title={t.promoDismiss}
          data-testid="bandwidth-promo-dismiss"
          className="absolute right-3 top-3 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className={cn('flex flex-col gap-6', hero ? 'md:flex-row md:items-center' : 'sm:flex-row sm:items-center')}>
          {/* Ícone: ondas de conexão virando créditos */}
          <div className="relative shrink-0 self-start sm:self-center" aria-hidden>
            <div
              className={cn(
                'relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-[0_0_40px_rgba(168,85,247,0.55)]',
                hero ? 'h-24 w-24' : 'h-14 w-14',
              )}
            >
              <span className="absolute inset-0 animate-ping rounded-2xl bg-violet-400/20 [animation-duration:2.6s]" />
              <Wifi className={cn('text-white', hero ? 'h-11 w-11' : 'h-7 w-7')} />
            </div>
            <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/40 bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg">
              <Coins className="h-4 w-4 text-amber-950" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full border border-violet-300/30 bg-violet-400/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-violet-200">
              {t.promoEyebrow}
            </span>
            <h2
              className={cn(
                'mt-3 font-display font-bold leading-tight text-white',
                hero ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl',
              )}
            >
              <span className="bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent">
                {t.promoTitle}
              </span>
            </h2>
            <p className={cn('mt-2 text-violet-100/75', hero ? 'text-base sm:text-lg' : 'text-sm')}>{t.promoSubtitle}</p>

            {hero && (
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
                {t.promoPoints.map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-violet-300" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button
            type="button"
            size={hero ? 'lg' : 'default'}
            onClick={() => setOpen(true)}
            data-testid="bandwidth-promo-cta"
            className="group shrink-0 gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-semibold text-white shadow-[0_8px_30px_-8px_rgba(168,85,247,0.8)] hover:from-violet-500 hover:to-fuchsia-500"
          >
            {t.promoCta}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </Button>
        </div>
      </section>
      <BandwidthConsentDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export default BandwidthPromoBanner
