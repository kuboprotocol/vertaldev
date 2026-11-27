import { Link } from 'react-router-dom'
import { MoreLink, Reveal, Section, SectionHeading, primaryButton } from './landingUi'

// Facts from src/lib/planConfig.ts (free: 5 credits on sign-up; Starter: US$4.99/month)
// and the referral rules in src/pages/AffiliateProgramPage.tsx.
export default function CreditsPromoSection() {
  return (
    <Section labelledBy="free-title" className="border-t border-white/[0.06]">
      <SectionHeading id="free-title" eyebrow="Pricing" title="Start for free.">
        You get 5 free credits when you create an account. You do not need a credit card. Paid plans start at
        US$4.99 per month.
      </SectionHeading>

      <Reveal className="mt-10 flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-8">
        <Link to="/auth" className={primaryButton}>
          Create a free account
        </Link>
        <MoreLink to="/pricing">Compare plans</MoreLink>
      </Reveal>

      <Reveal className="mx-auto mt-20 max-w-3xl rounded-3xl bg-card/60 px-8 py-10 text-center md:px-14 md:py-12">
        <h3 className="text-2xl font-semibold tracking-[-0.01em] text-foreground md:text-[28px]">
          Invite friends. Earn credits.
        </h3>
        <dl className="mt-8 grid gap-8 text-left sm:grid-cols-3 sm:gap-6">
          {[
            { term: '50 credits', detail: 'For you, for each friend who signs up with your link.' },
            { term: '5% for life', detail: 'Of every payment your friends make. Use it as credits or withdraw it by Pix.' },
            { term: '5 credits a day', detail: 'For your friend, each day they log in.' },
          ].map((item) => (
            <div key={item.term} className="sm:text-center">
              <dt className="text-lg font-semibold text-foreground">{item.term}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8">
          <MoreLink to="/affiliate-program">Learn about referrals</MoreLink>
        </div>
      </Reveal>
    </Section>
  )
}
