/**
 * Vertal Vibe Pay promo (the Vertal Dev digital account).
 *
 * - variant="hero":    large banner (public home and dashboard).
 * - variant="compact": smaller card (Creative panel, Profile).
 *
 * `to` sets the destination: `/pay` in the logged-in app; on the public home
 * it is the `/vibe-pay` landing (which leads to sign-in with `redirect=/pay`).
 *
 * Compliance (docs/VERTAL_BANK.md §10/§12.4): never call it a bank.
 * Accounts and payments are provided by Stripe and ASAAS.
 */
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChevronRight, QrCode, Globe2, CreditCard, Link2 } from 'lucide-react'
import { VIBE_PAY } from '@/config/vibePay'
import { cn } from '@/lib/utils'
import { focusRing } from '@/components/site/siteUi'

export interface VibePayPromoProps {
  variant?: 'hero' | 'compact'
  to?: string
  className?: string
}

const FEATURES = [
  { icon: QrCode, label: 'Pix and boleto' },
  { icon: CreditCard, label: 'Cards' },
  { icon: Link2, label: 'Payment links' },
  { icon: Globe2, label: 'Global account in 16 currencies' },
] as const

export function VibePayPromo({ variant = 'hero', to = VIBE_PAY.appPath, className }: VibePayPromoProps) {
  const navigate = useNavigate()
  const go = () => navigate(to)
  const label = `Open ${VIBE_PAY.name}`

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
          'group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-white/[0.06] bg-card/50 p-4 text-left transition-colors hover:border-white/[0.14] hover:bg-card/70 sm:p-5',
          focusRing,
          className,
        )}
      >
        <img
          src={VIBE_PAY.iconSmall}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-xl bg-black object-contain"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-[15px] font-semibold" translate="no">{VIBE_PAY.name}</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">New</span>
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Your digital account in Vertal Dev. Receive with Pix, boleto, cards and payment links, and hold money in more than one currency.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
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
        'group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-card/50 p-6 transition-colors hover:border-white/[0.14] md:p-10',
        focusRing,
        className,
      )}
    >
      <div className="grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium text-primary" translate="no">Vertal Vibe Pay</span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">New</span>
          </div>
          <h2 className="mb-3 text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-4xl">
            Get paid from anywhere. See it all in one place.
          </h2>
          <p className="mb-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground md:text-[17px]">
            The Vertal Dev digital account: Pix, boleto, cards and payment links in Brazil, and a global account to
            receive from other countries and pay out in your country. One balance and one statement.
          </p>
          <ul className="mb-6 flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label: f }) => (
              <li key={f} className="flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1 text-[13px] text-foreground/85">
                <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {f}
              </li>
            ))}
          </ul>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
            Open my account <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
          <p className="mt-4 text-[12px] text-muted-foreground">
            Accounts and payments are provided by Stripe and ASAAS. Vertal is not a financial institution.
          </p>
        </div>
        <img
          src={VIBE_PAY.logo}
          alt={VIBE_PAY.name}
          width={VIBE_PAY.logoSize.width}
          height={VIBE_PAY.logoSize.height}
          loading="lazy"
          decoding="async"
          className="mx-auto w-full max-w-sm object-contain"
        />
      </div>
    </section>
  )
}

export default VibePayPromo
