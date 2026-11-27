import { MoreLink, Reveal, Section, SectionHeading } from './landingUi'

const DomainSection = () => {
  return (
    <Section labelledBy="domain-title" className="border-t border-white/[0.06]">
      <SectionHeading id="domain-title" eyebrow="Domains" title="Use your own domain.">
        Buy a new domain or transfer a domain you already own. Then connect it to your app.
      </SectionHeading>

      <Reveal className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
        <MoreLink to="https://www.ionos.com/domains/domain-checker" external>
          Check if a domain is available
        </MoreLink>
        <MoreLink to="https://www.ionos.com/domains/domain-transfer" external>
          Transfer a domain
        </MoreLink>
      </Reveal>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Domains are provided by our partner{' '}
        <a
          href="https://www.ionos.com"
          target="_blank"
          rel="noopener noreferrer"
          translate="no"
          className="underline underline-offset-4 hover:text-foreground"
        >
          IONOS
        </a>
        . The links open in a new tab.
      </p>
    </Section>
  )
}

export default DomainSection
