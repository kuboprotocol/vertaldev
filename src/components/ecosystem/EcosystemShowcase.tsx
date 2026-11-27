import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Code2, ExternalLink, Layers, Plug, Rocket, ShieldCheck, Sparkles, Terminal, Globe2, MonitorPlay } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Reveal, SectionHeading, focusRing, surface } from '@/components/site/siteUi'
import { cn } from '@/lib/utils'
import { connectors } from '@/lib/connectorsConfig'
import {
  ECOSYSTEM,
  ECOSYSTEM_COMPARISON,
  ECOSYSTEM_PILLARS,
  combinedMcpConfig,
  type EcosystemProduct,
  type EcosystemProductId,
} from '@/lib/ecosystem'
import { EcosystemEmbedDialog, EcosystemMcpDialog, ecosystemLink } from './EcosystemDialogs'

const CURRENT: EcosystemProductId = 'vertal-dev'

/** Logo oficial do produto (`logoUrl` do conector) ou, se não houver, o ícone padrão do produto. */
export function ProductLogo({ product, className }: { product: EcosystemProduct; className?: string }) {
  const logo = connectors.find(c => c.slug === product.id)?.logoUrl
  if (logo) return <img src={logo} alt={product.name} className={cn(className, 'object-contain')} draggable={false} />
  const Icon = PRODUCT_ICONS[product.id]
  return <Icon className={className} style={{ color: product.color }} />
}

export const PRODUCT_ICONS: Record<EcosystemProductId, LucideIcon> = {
  'vertal-dev': Code2,
  'vertal-run': Terminal,
  'vertal-app': Rocket,
}

const PILLAR_ICONS: LucideIcon[] = [Layers, Sparkles, ShieldCheck, Globe2]

/** Estado compartilhado dos diálogos de iframe e MCP. */
export function useEcosystemDialogs() {
  const [embed, setEmbed] = useState<EcosystemProduct | null>(null)
  const [mcp, setMcp] = useState<EcosystemProduct | null>(null)
  const dialogs = (
    <>
      <EcosystemEmbedDialog product={embed} open={embed !== null} onOpenChange={o => !o && setEmbed(null)} />
      <EcosystemMcpDialog product={mcp} open={mcp !== null} onOpenChange={o => !o && setMcp(null)} />
    </>
  )
  return { openEmbed: setEmbed, openMcp: setMcp, dialogs }
}

/** Botões de integração de um produto: iframe, MCP e link externo. */
export function EcosystemActions({
  product,
  onEmbed,
  onMcp,
  className,
}: {
  product: EcosystemProduct
  onEmbed: (p: EcosystemProduct) => void
  onMcp: (p: EcosystemProduct) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button size="sm" className="gap-1.5 rounded-full" onClick={() => onEmbed(product)}>
        <MonitorPlay className="h-4 w-4" />
        Open
      </Button>
      <Button size="sm" variant="secondary" className="gap-1.5 rounded-full" onClick={() => onMcp(product)}>
        <Plug className="h-4 w-4" />
        Connect MCP
      </Button>
      <Button asChild size="sm" variant="ghost" className="gap-1.5 rounded-full">
        <a href={ecosystemLink(product)} target="_blank" rel="noopener noreferrer">
          Go to {product.domain}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  )
}

function ProductCard({
  product,
  onEmbed,
  onMcp,
}: {
  product: EcosystemProduct
  onEmbed: (p: EcosystemProduct) => void
  onMcp: (p: EcosystemProduct) => void
}) {
  const isCurrent = product.id === CURRENT
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
      data-testid={`ecosystem-card-${product.id}`}
      className={cn(surface.card, 'relative flex flex-col gap-4 p-6', isCurrent && 'border-primary/40')}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${product.color}1f` }}
        >
          <ProductLogo product={product} className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium" style={{ color: product.color }}>
            {product.role}
          </p>
          <h3 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
            <span translate="no">{product.name}</span>
          </h3>
        </div>
        {isCurrent && (
          <Badge variant="secondary" className="shrink-0 rounded-full font-medium">
            You are here
          </Badge>
        )}
      </div>
      <p className="text-[17px] font-medium leading-snug text-foreground">{product.tagline}</p>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{product.description}</p>
      <ul className="space-y-2">
        {product.strengths.map(s => (
          <li key={s} className="flex gap-2 text-[15px] text-muted-foreground">
            <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{s}</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-[13px] text-muted-foreground/80">
        An alternative to {product.replaces.join(', ')}
      </p>
      {isCurrent ? (
        <Button asChild size="sm" variant="secondary" className="w-fit gap-1.5 rounded-full">
          <Link to="/builder">
            Start building <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <EcosystemActions product={product} onEmbed={onEmbed} onMcp={onMcp} />
      )}
    </motion.div>
  )
}

/**
 * Marketing block of the Vertal ecosystem: the three products, connect
 * buttons (new tab + MCP), reasons to choose it and a comparison table.
 * With `asPage`, the title is the page h1.
 */
export default function EcosystemShowcase({ compact = false, asPage = false }: { compact?: boolean; asPage?: boolean }) {
  const { openEmbed, openMcp, dialogs } = useEcosystemDialogs()
  const allMcp: EcosystemProduct = {
    ...ECOSYSTEM[0],
    name: 'Vertal ecosystem',
    mcp: {
      ...ECOSYSTEM[0].mcp,
      url: undefined,
      cli: undefined,
      config: combinedMcpConfig(),
      tools: ECOSYSTEM.flatMap(p => p.mcp.tools.map(t => `${p.id}:${t}`)),
      auth: 'Vertal Dev and Vertal.app: OAuth with your account. Vertal Run: a kubo_sk_… API key.',
      docsUrl: 'https://vertal.dev/docs/mcp',
    },
  }

  const intro =
    'KUBO Protocol connects the whole cycle. Vertal Dev builds with AI, Vertal Run runs code safely and Vertal.app puts it online. Open any of them, or connect all three to your agent with MCP.'

  return (
    <section
      id="ecossistema"
      aria-labelledby={asPage ? 'page-title' : 'ecosystem-title'}
      className="relative"
      data-testid="ecosystem-showcase"
    >
      {asPage ? (
        <PageHeader eyebrow="Vertal ecosystem" title="Build, run and publish. All connected.">
          {intro}
        </PageHeader>
      ) : (
        <div className="px-6 pt-24">
          <SectionHeading id="ecosystem-title" eyebrow="Vertal ecosystem" title="Build, run and publish. All connected.">
            {intro}
          </SectionHeading>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-20 px-6 pb-24">
        <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] font-medium">
          {ECOSYSTEM.map((p, i) => (
            <span key={p.id} className="flex items-center gap-2">
              <span className="rounded-full border border-white/[0.08] bg-card/50 px-4 py-1.5">
                <span style={{ color: p.color }}>{p.role}</span>
                <span className="text-muted-foreground"> · {p.name}</span>
              </span>
              {i < ECOSYSTEM.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
            </span>
          ))}
        </div>

        <motion.div
          className="grid gap-5 md:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        >
          {ECOSYSTEM.map(p => (
            <ProductCard key={p.id} product={p} onEmbed={openEmbed} onMcp={openMcp} />
          ))}
        </motion.div>

        {!compact && (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ECOSYSTEM_PILLARS.map((pillar, i) => {
                const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length]
                return (
                  <Reveal key={pillar.title} delay={i * 0.05} className={cn(surface.card, 'p-6')}>
                    <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden />
                    <h3 className="mb-2 text-[17px] font-semibold text-foreground">{pillar.title}</h3>
                    <p className="text-[15px] leading-relaxed text-muted-foreground">{pillar.description}</p>
                  </Reveal>
                )
              })}
            </div>

            <div className="space-y-6">
              <Reveal className="text-center">
                <h3 className="text-2xl font-semibold tracking-[-0.015em] text-foreground md:text-4xl">
                  Why one ecosystem and not many vendors?
                </h3>
                <p className="mx-auto mt-3 max-w-2xl text-[17px] text-muted-foreground">
                  One vendor per step means three accounts, three invoices and integrations that you keep running yourself.
                </p>
              </Reveal>
              <Reveal className={cn(surface.card, 'overflow-x-auto p-0')}>
                <table className="w-full min-w-[560px] text-[15px]">
                  <thead className="border-b border-white/[0.06]">
                    <tr className="text-left">
                      <th scope="col" className="px-5 py-4 font-medium text-muted-foreground">Step</th>
                      <th scope="col" className="px-5 py-4 font-semibold text-foreground">Vertal ecosystem</th>
                      <th scope="col" className="px-5 py-4 font-medium text-muted-foreground">Separate tools</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {ECOSYSTEM_COMPARISON.map(row => (
                      <tr key={row.feature}>
                        <th scope="row" className="px-5 py-4 text-left font-normal text-foreground">{row.feature}</th>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <Check className="h-4 w-4 text-primary" aria-hidden />
                            {row.vertal}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{row.others}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Reveal>
              <p className="text-center text-[15px] text-muted-foreground">
                Want a detailed comparison?{' '}
                <Link to="/alternativas" className={cn('rounded-sm text-primary underline-offset-4 hover:underline', focusRing)}>
                  See Vertal compared with Lovable, Bolt, Replit, Vercel and others
                </Link>
              </p>
            </div>
          </>
        )}

        <Reveal className={cn(surface.card, 'p-8 text-center md:p-12')}>
          <h3 className="text-2xl font-semibold tracking-[-0.015em] text-foreground md:text-4xl">
            One agent. Three products.
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-muted-foreground">
            Paste one MCP config and your agent can build apps, run code in a sandbox and deploy.
          </p>
          <Button size="lg" onClick={() => openMcp(allMcp)} className="mt-8 gap-2 rounded-full px-8">
            <Plug className="h-4 w-4" aria-hidden />
            Connect all three with MCP
          </Button>
        </Reveal>
      </div>
      {dialogs}
    </section>
  )
}
