import { APP_NAME } from '@/config/brand'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useSubscription } from '@/hooks/useSubscription'
import { getPlanConfig, PLAN_CONFIG } from '@/lib/planConfig'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import SitePage from '@/components/site/SitePage'
import { PageHeader, Reveal, SectionHeading, focusRing, surface } from '@/components/site/siteUi'
import { ContactDialog } from '@/components/pricing/ContactDialog'
import { cn } from '@/lib/utils'

type Period = 'monthly' | 'annual' | 'lifetime'

// Planos à venda: somente até US$ 49,99/mês. Premium 2 e Business 1–7
// continuam em PLAN_CONFIG para quem já assina, mas não são mais vendidos.
const ESSENTIALS = ['free', 'starter', 'pro', 'premium_1']

const BADGES: Record<string, { label: string; tone: 'popular' | 'value' }> = {
  pro: { label: 'Most chosen', tone: 'popular' },
  premium_1: { label: 'Best value', tone: 'value' },
}

// Monthly credits per plan (hardcoded as per user requirements)
const MONTHLY_CREDITS: Record<string, number> = {
  free: 5,           // Just signup credits
  starter: 50,       // $4.99/month
  pro: 200,          // $19.99/month
  premium_1: 650,    // $49.99/month
}

function priceFor(monthly: number, period: Period): { display: string; suffix: string } {
  if (monthly === 0) return { display: '$0', suffix: 'forever' }
  if (period === 'monthly') return { display: `$${monthly.toFixed(2)}`, suffix: 'per month' }
  if (period === 'annual') {
    const yearly = monthly * 12 * 0.8
    return { display: `$${yearly.toFixed(2)}`, suffix: 'per year' }
  }
  return { display: `$${(monthly * 6).toFixed(2)}`, suffix: 'one payment' }
}

function featuresFor(plan: string): string[] {
  const cfg = getPlanConfig(plan)
  const monthlyCredits = MONTHLY_CREDITS[plan] || 0
  const feats: string[] = []

  if (plan === 'free') {
    feats.push(`✓ ${cfg.signupCredits} credits when you sign up (one time)`)
    feats.push(`✓ Extra credits in Rewards`)
  } else {
    feats.push(`✓ ${monthlyCredits} credits per month`)
    feats.push(`✓ Includes 5 credits per day`)
  }

  feats.push('✓ Optional rewards (reward videos, Kubo music, Vertal Node)')
  // Nenhum plano tem anúncio interruptivo: o anúncio que abria em aba nova (TERRA ADS) foi removido.
  feats.push('✓ No pop-up ads')
  if (['pro', 'premium_1', 'premium_2'].includes(plan) || plan.startsWith('business') || plan === 'enterprise') {
    feats.push('✓ Email support')
  }
  if (plan.startsWith('business') || plan === 'enterprise') {
    feats.push('✓ Priority support')
    feats.push('✓ Vertal partner agreement')
  }
  const tierNum = Number(plan.replace('business_', '')) || 0
  if (tierNum >= 3 || plan === 'enterprise') feats.push('✓ API Access')
  if (tierNum >= 5 || plan === 'enterprise') feats.push('✓ Service level agreement (SLA)')
  if (tierNum >= 7 || plan === 'enterprise') feats.push('✓ Dedicated account manager')
  return feats
}

interface PlanCardProps {
  plan: string
  period: Period
  currentPlan?: string
  loadingPlan: string | null
  onCheckout: (plan: string) => void
  onFree: () => void
  variant?: 'default' | 'gold'
}

const pillPrimary = cn(
  'inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60',
  focusRing,
)
const pillSecondary = cn(
  'inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 text-[15px] font-medium text-foreground transition-colors hover:bg-white/[0.08] disabled:opacity-60',
  focusRing,
)

function PlanCard({ plan, period, currentPlan, loadingPlan, onCheckout, onFree, variant = 'default' }: PlanCardProps) {
  const cfg = getPlanConfig(plan)
  const badge = BADGES[plan]
  const price = priceFor(cfg.priceUsd, period)
  const isCurrent = currentPlan === plan
  const isFree = plan === 'free'
  const loading = loadingPlan === plan
  const isGold = variant === 'gold'
  const isPopular = badge?.tone === 'popular'

  return (
    <Reveal
      className={cn(
        surface.card,
        'relative flex h-full flex-col p-6',
        isPopular && 'border-primary/50 ring-1 ring-primary/40',
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.01em]">{cfg.displayName}</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {isFree ? 'Start for free' : isGold ? 'Business plan' : 'Standard plan'}
          </p>
        </div>
        {badge && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
              badge.tone === 'popular' ? 'bg-primary/15 text-primary' : 'bg-emerald-500/15 text-emerald-400',
            )}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className="mb-6">
        <span className="text-4xl font-semibold tracking-[-0.02em]">{price.display}</span>
        <p className="mt-1 text-[13px] text-muted-foreground">{price.suffix}</p>
      </div>

      <ul className="mb-8 flex-1 space-y-2.5 text-[15px]">
        {featuresFor(plan).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-foreground/85">
            <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{f.replace(/^✓\s*/, '')}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button type="button" disabled className={pillSecondary}>
          Current plan
        </button>
      ) : isFree ? (
        <button type="button" onClick={onFree} className={pillSecondary}>
          Start for free
        </button>
      ) : (
        <button type="button" onClick={() => onCheckout(plan)} disabled={loading} className={pillPrimary}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening checkout…
            </>
          ) : (
            <>
              Subscribe with Stripe <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      )}
    </Reveal>
  )
}

export default function PricingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { subscription } = useSubscription()
  const [period, setPeriod] = useState<Period>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [contactOpen, setContactOpen] = useState(false)

  const currentPlan = subscription?.plan

  const handleStripeCheckout = async (plan: string) => {
    if (!user) {
      navigate('/auth')
      return
    }
    setLoadingPlan(plan)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan, period },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) throw error
      if (data?.url) window.open(data.url, '_blank')
    } catch {
      toast.error('We could not open checkout. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <SitePage>
      <PageHeader
        eyebrow="Pricing"
        title="Simple plans, paid in credits."
        actions={
          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-card/50 p-1"
          >
            {(['monthly', 'annual', 'lifetime'] as Period[]).map((p) => {
              const active = period === p
              const label = p === 'monthly' ? 'Monthly' : p === 'annual' ? 'Yearly' : 'Lifetime'
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'rounded-full px-5 py-2 text-[13px] font-medium transition-colors',
                    focusRing,
                    active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                  {p === 'annual' && <span className={cn('ml-1.5', active ? 'text-background/70' : 'text-emerald-400')}>-20%</span>}
                </button>
              )
            })}
          </div>
        }
      >
        Start for free. Upgrade when you need more credits. Every plan can be canceled at any time.
      </PageHeader>
      {period === 'annual' && (
        <p className="-mt-6 mb-6 text-center text-[13px] text-emerald-400">Pay once a year and save 20%.</p>
      )}
      {period === 'lifetime' && (
        <p className="-mt-6 mb-6 text-center text-[13px] text-primary">One payment. No renewals.</p>
      )}

      {/* Plans for sale */}
      <section aria-labelledby="plans-title" className="px-6 pb-20">
        <div className="mx-auto max-w-6xl">
          <h2 id="plans-title" className="sr-only">
            Plans
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ESSENTIALS.map((plan) => (
              <PlanCard
                key={plan}
                plan={plan}
                period={period}
                currentPlan={currentPlan}
                loadingPlan={loadingPlan}
                onCheckout={handleStripeCheckout}
                onFree={() => navigate('/auth')}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Credit top-ups */}
      <section aria-labelledby="topup-title" className="border-t border-white/[0.06] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <SectionHeading id="topup-title" title="Need more credits?">
            Buy a top-up at any time. Credits are used for AI generations, publishing and premium actions.
          </SectionHeading>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              { credits: 50, price: 4.99, label: 'Small' },
              { credits: 150, price: 12.99, label: 'Medium' },
              { credits: 350, price: 24.99, label: 'Large' },
            ].map((recharge) => (
              <Reveal key={recharge.credits} className={cn(surface.card, 'flex flex-col p-6')}>
                <p className="text-[13px] text-muted-foreground">{recharge.label} top-up</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.02em]">{recharge.credits} credits</p>
                <p className="mt-1 text-xl text-foreground/85">${recharge.price.toFixed(2)}</p>
                <button
                  type="button"
                  onClick={() => handleStripeCheckout(`recharge_${recharge.credits}`)}
                  disabled={!user || loadingPlan === `recharge_${recharge.credits}`}
                  className={cn(pillPrimary, 'mt-6')}
                >
                  {loadingPlan === `recharge_${recharge.credits}` ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Processing…
                    </>
                  ) : (
                    <>
                      Buy with Stripe <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>
              </Reveal>
            ))}
          </div>
          {!user && (
            <p className="mt-6 text-center text-[13px] text-muted-foreground">Log in to buy a top-up.</p>
          )}
        </div>
      </section>

      {/* Comparison */}
      <section aria-labelledby="compare-title" className="border-t border-white/[0.06] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <SectionHeading id="compare-title" title="Compare plans" />
          <Reveal className={cn(surface.card, 'mt-12 overflow-x-auto p-0')}>
            <table className="w-full text-[15px]">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  <th scope="col" className="p-4 text-left font-medium text-muted-foreground">
                    Feature
                  </th>
                  <th scope="col" className="p-4 text-center font-semibold">Free</th>
                  <th scope="col" className="p-4 text-center font-semibold">Starter</th>
                  <th scope="col" className="p-4 text-center font-semibold">Pro</th>
                  <th scope="col" className="p-4 text-center font-semibold">Premium 1</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {[
                  ['Price per month', '$0', '$4.99', '$19.99', '$49.99'],
                  ['Credits per month', '5', '50', '200', '650'],
                  ['Rewards (optional)', 'Yes', 'Yes', 'Yes', 'Yes'],
                  ['Pop-up ads', 'None', 'None', 'None', 'None'],
                  ['Email support', 'No', 'No', 'Yes', 'Yes'],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th key={i} scope="row" className="p-4 text-left font-medium">
                          {cell}
                        </th>
                      ) : (
                        <td key={i} className="p-4 text-center text-muted-foreground">
                          {cell}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="pricing-faq-title" className="border-t border-white/[0.06] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <SectionHeading id="pricing-faq-title" title="Questions about pricing" />
          <Accordion type="single" collapsible className="mt-10 w-full">
            {[
              {
                q: `What are credits in ${APP_NAME}?`,
                a: 'Credits pay for AI generations, publishing and premium actions. Each plan gives you credits every day. You can earn extra credits in Rewards and by inviting friends.',
              },
              {
                q: 'Can I cancel at any time?',
                a: 'Yes. You can cancel any subscription in the Stripe customer portal. You keep access until the end of the period you already paid for.',
              },
              {
                q: 'How do I earn extra credits?',
                a: 'Open Rewards (/recompensas). You can watch reward videos, listen to Kubo music and turn on Vertal Node. All of it is optional, and the credits go to your balance.',
              },
              {
                q: 'Do any plans show ads?',
                a: 'No plan shows pop-up ads. The only ads are the optional reward videos in Rewards, and you see them only if you choose to earn extra credits.',
              },
              {
                q: 'How does the Lifetime plan work?',
                a: 'Lifetime is one payment equal to 6 months of the plan you choose. You keep the credits and features of that plan with no renewals.',
              },
            ].map((item, i) => (
              <AccordionItem key={item.q} value={`q${i + 1}`} className="border-white/[0.06]">
                <AccordionTrigger className="text-left text-[17px] font-medium hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <p className="mt-12 text-center text-[15px] text-muted-foreground">
            Still have a question?{' '}
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              className={cn('rounded-sm text-primary hover:underline underline-offset-4', focusRing)}
            >
              Contact us
            </button>
            .
          </p>
          {/* Sanity check: ensure PLAN_CONFIG keys used above still exist */}
          <span className="sr-only">{Object.keys(PLAN_CONFIG).join(',')}</span>
        </div>
      </section>

      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} defaultReason="support" />
    </SitePage>
  )
}
