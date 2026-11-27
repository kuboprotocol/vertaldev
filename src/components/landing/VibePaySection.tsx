/**
 * Landing-only, English summary of Vertal Vibe Pay. The shared `VibePayPromo`
 * (dashboard, profile, creative panel) is not changed.
 *
 * Compliance (docs/VERTAL_BANK.md §10/§12.4): never call it a bank. Accounts and
 * payments are provided by Stripe and ASAAS.
 */
import { VIBE_PAY } from '@/config/vibePay'
import { MoreLink, Reveal, Section } from './landingUi'

export default function VibePaySection() {
  return (
    <Section labelledBy="vibepay-title" className="border-t border-white/[0.06]">
      <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
        <Reveal className="text-center md:text-left">
          <p className="mb-3 text-sm font-medium text-primary" translate="no">
            {VIBE_PAY.name}
          </p>
          <h2
            id="vibepay-title"
            className="text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-5xl"
          >
            Get paid in one place.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Vibe Pay is the digital account inside Vertal Dev. In Brazil, receive payments by Pix, boleto, card, and payment
            links. With the global account, receive money from other countries in 16 currencies.
          </p>
          <div className="mt-8">
            <MoreLink to={VIBE_PAY.landingPath}>Learn about Vibe Pay</MoreLink>
          </div>
          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            Accounts and payments are provided by Stripe and ASAAS. Vertal is not a financial institution.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <img
            src={VIBE_PAY.logo}
            alt={`${VIBE_PAY.name} logo`}
            width={VIBE_PAY.logoSize.width}
            height={VIBE_PAY.logoSize.height}
            loading="lazy"
            decoding="async"
            className="mx-auto w-full max-w-md rounded-3xl object-contain"
          />
        </Reveal>
      </div>
    </Section>
  )
}
