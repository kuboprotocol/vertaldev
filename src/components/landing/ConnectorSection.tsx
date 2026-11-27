import { MoreLink, Reveal, Section, SectionHeading } from './landingUi'

const connectorCategories = [
  { title: 'AI models', items: ['VERTAL Code AI', 'Claude', 'Gemini', 'DeepSeek'] },
  { title: 'Payments', items: ['Stripe', 'Mercado Pago', 'PayPal', 'Pix'] },
  { title: 'Databases', items: ['Supabase', 'PostgreSQL', 'Firebase', 'MongoDB'] },
  { title: 'Your own APIs', items: ['REST', 'GraphQL', 'Webhooks', 'Private APIs'] },
]

export default function ConnectorSection() {
  return (
    <Section labelledBy="connectors-title" className="border-t border-white/[0.06]">
      <SectionHeading id="connectors-title" eyebrow="Connectors" title="Connect the tools you already use.">
        Add AI models, payments, databases, and your own APIs to your app.
      </SectionHeading>

      <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 md:mt-20 md:grid-cols-4">
        {connectorCategories.map((category, i) => (
          <Reveal key={category.title} delay={i * 0.06}>
            <h3 className="text-[17px] font-semibold text-foreground">{category.title}</h3>
            <ul className="mt-3 space-y-2">
              {category.items.map((item) => (
                <li key={item} className="text-[15px] text-muted-foreground" translate="no">
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-14 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
        <MoreLink to="/builder">Add a connector to your app</MoreLink>
        <MoreLink to="/integracoes">See all integrations</MoreLink>
      </Reveal>
    </Section>
  )
}
