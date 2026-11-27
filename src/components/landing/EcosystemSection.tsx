/**
 * Landing-only summary of the Vertal ecosystem, in English.
 * Links and colors come from `src/lib/ecosystem.ts`; the full Portuguese
 * showcase (with the iframe and MCP dialogs) stays on /ecossistema.
 */
import { ECOSYSTEM, type EcosystemProductId } from '@/lib/ecosystem'
import { ecosystemLink } from '@/components/ecosystem/EcosystemDialogs'
import { MoreLink, Reveal, Section, SectionHeading } from './landingUi'

const COPY: Record<EcosystemProductId, { role: string; text: string }> = {
  'vertal-dev': {
    role: 'Create',
    text: 'Build apps, websites, games, and Web3 apps from a written description.',
  },
  'vertal-run': {
    role: 'Run',
    text: 'Run code from AI agents in isolated sandboxes, away from your own servers.',
  },
  'vertal-app': {
    role: 'Publish',
    text: 'Connect a GitHub repository. The AI finds the build settings and puts the app online, with live logs.',
  },
}

export default function EcosystemSection() {
  return (
    <Section labelledBy="ecosystem-title" className="border-t border-white/[0.06]">
      <SectionHeading id="ecosystem-title" eyebrow="Ecosystem" title="Create, run, and publish.">
        Three products from the same team that work together. You can also connect all three to your AI agent
        with MCP.
      </SectionHeading>

      <ul className="mt-16 grid gap-6 md:mt-20 md:grid-cols-3">
        {ECOSYSTEM.map((p, i) => {
          const copy = COPY[p.id]
          const isHere = p.id === 'vertal-dev'
          return (
            <Reveal as="li" key={p.id} delay={i * 0.08} className="flex flex-col rounded-3xl bg-card/60 p-8">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground/70">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {copy.role}
              </p>
              <h3 className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-foreground" translate="no">
                {p.name}
              </h3>
              <p className="mt-3 flex-1 text-[17px] leading-relaxed text-muted-foreground">{copy.text}</p>
              <div className="mt-6">
                {isHere ? (
                  <MoreLink to="/builder">Start building</MoreLink>
                ) : (
                  <MoreLink to={ecosystemLink(p)} external>
                    Visit {p.domain}
                  </MoreLink>
                )}
              </div>
            </Reveal>
          )
        })}
      </ul>

      <Reveal className="mt-12 text-center">
        <MoreLink to="/ecossistema">Learn more about the ecosystem</MoreLink>
      </Reveal>
    </Section>
  )
}
