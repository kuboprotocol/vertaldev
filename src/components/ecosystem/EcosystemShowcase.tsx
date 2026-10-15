import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Code2, ExternalLink, Layers, Plug, Rocket, ShieldCheck, Sparkles, Terminal, Globe2, MonitorPlay } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
      <Button size="sm" variant="hero" className="gap-1.5 rounded-xl" onClick={() => onEmbed(product)}>
        <MonitorPlay className="h-4 w-4" />
        Abrir aqui
      </Button>
      <Button size="sm" variant="secondary" className="gap-1.5 rounded-xl" onClick={() => onMcp(product)}>
        <Plug className="h-4 w-4" />
        Conectar MCP
      </Button>
      <Button asChild size="sm" variant="ghost" className="gap-1.5 rounded-xl">
        <a href={ecosystemLink(product)} target="_blank" rel="noopener noreferrer">
          Ir para {product.domain}
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
  const Icon = PRODUCT_ICONS[product.id]
  const isCurrent = product.id === CURRENT
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
      data-testid={`ecosystem-card-${product.id}`}
      className={cn(
        'relative flex flex-col gap-4 rounded-3xl border bg-card p-6 transition-colors',
        isCurrent ? 'border-primary/50 shadow-gold' : 'border-border hover:border-primary/40',
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-3xl opacity-60"
        style={{ background: `radial-gradient(60% 100% at 50% 0%, ${product.color}22, transparent)` }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${product.color}1f` }}
        >
          <Icon className="h-6 w-6" style={{ color: product.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: product.color }}>
            {product.role}
          </p>
          <h3 className="font-display text-xl font-bold text-foreground">{product.name}</h3>
        </div>
        {isCurrent && <Badge className="shrink-0">Você está aqui</Badge>}
      </div>
      <p className="relative text-sm font-medium text-foreground">{product.tagline}</p>
      <p className="relative text-sm text-muted-foreground">{product.description}</p>
      <ul className="relative space-y-2">
        {product.strengths.map(s => (
          <li key={s} className="flex gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
      <p className="relative mt-auto text-xs text-muted-foreground/80">
        Alternativa a {product.replaces.join(', ')}
      </p>
      {isCurrent ? (
        <Button asChild size="sm" variant="secondary" className="relative rounded-xl gap-1.5 w-fit">
          <Link to="/builder">
            Começar a criar <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : (
        <EcosystemActions product={product} onEmbed={onEmbed} onMcp={onMcp} className="relative" />
      )}
    </motion.div>
  )
}

/**
 * Seção de marketing do Ecossistema Vertal: os três produtos, botões de
 * integração (iframe + MCP), diferenciais e comparação com concorrentes.
 */
export default function EcosystemShowcase({ compact = false }: { compact?: boolean }) {
  const { openEmbed, openMcp, dialogs } = useEcosystemDialogs()
  const allMcp: EcosystemProduct = {
    ...ECOSYSTEM[0],
    name: 'Ecossistema Vertal',
    mcp: {
      ...ECOSYSTEM[0].mcp,
      url: undefined,
      cli: undefined,
      config: combinedMcpConfig(),
      tools: ECOSYSTEM.flatMap(p => p.mcp.tools.map(t => `${p.id}:${t}`)),
      auth: 'Vertal Dev e Vertal.app: OAuth com a sua conta. Vertal Run: chave de API kubo_sk_….',
      docsUrl: 'https://vertal.dev/docs/mcp',
    },
  }

  return (
    <section id="ecossistema" className="relative overflow-hidden px-6 py-24" data-testid="ecosystem-showcase">
      <div className="pointer-events-none absolute inset-0 dot-pattern opacity-20" />
      <div className="relative z-10 mx-auto max-w-6xl space-y-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center"
        >
          <span className="mb-3 block text-xs font-medium uppercase tracking-widest text-primary">Ecossistema Vertal</span>
          <h2 className="font-display text-3xl font-bold text-foreground md:text-5xl">
            Crie, execute e publique.
            <br />
            <span className="hero-highlight">Tudo conectado.</span>
          </h2>
          <p className="mt-5 text-muted-foreground md:text-lg">
            Enquanto os concorrentes resolvem uma etapa cada, a KUBO Protocol integrou o ciclo inteiro:
            o Vertal Dev cria com IA, o Vertal Run executa código com segurança e o Vertal.app coloca no ar.
            Abra qualquer um aqui dentro ou conecte os três ao seu agente via MCP.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm font-medium">
            {ECOSYSTEM.map((p, i) => (
              <span key={p.id} className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-card px-4 py-1.5">
                  <span style={{ color: p.color }}>{p.role}</span>
                  <span className="text-muted-foreground"> · {p.name}</span>
                </span>
                {i < ECOSYSTEM.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </span>
            ))}
          </div>
        </motion.div>

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ECOSYSTEM_PILLARS.map((pillar, i) => {
                const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length]
                return (
                  <motion.div
                    key={pillar.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-border bg-card/60 p-5"
                  >
                    <Icon className="mb-3 h-5 w-5 text-primary" />
                    <h3 className="mb-1.5 font-semibold text-foreground">{pillar.title}</h3>
                    <p className="text-sm text-muted-foreground">{pillar.description}</p>
                  </motion.div>
                )
              })}
            </div>

            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-display text-2xl font-bold text-foreground md:text-3xl">
                  Por que Vertal e não uma colcha de fornecedores?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Uma etapa por fornecedor significa três contas, três faturas e integrações que você mesmo mantém.
                </p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-card">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Etapa</th>
                      <th className="px-4 py-3 font-semibold text-primary">Ecossistema Vertal</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Ferramentas avulsas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ECOSYSTEM_COMPARISON.map(row => (
                      <tr key={row.feature} className="border-t border-border">
                        <td className="px-4 py-3 text-foreground">{row.feature}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <Check className="h-4 w-4 text-primary" />
                            {row.vertal}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.others}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Quer a comparação detalhada?{' '}
                <Link to="/alternativas" className="text-primary underline-offset-4 hover:underline">
                  Veja Vertal × Lovable, Bolt, Replit, Vercel e outros
                </Link>
              </p>
            </div>
          </>
        )}

        <div className="relative overflow-hidden rounded-3xl gradient-primary p-8 shadow-gold md:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-xl">
              <h3 className="font-display text-2xl font-bold text-primary-foreground md:text-3xl">
                Um agente. Três superpoderes.
              </h3>
              <p className="mt-2 text-primary-foreground/80">
                Cole uma única configuração MCP e seu agente passa a criar apps, rodar código em sandbox e fazer deploy.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => openMcp(allMcp)}
              className="gap-2 rounded-xl bg-background px-8 font-semibold text-foreground hover:bg-background/90"
            >
              <Plug className="h-4 w-4" />
              Conectar os três via MCP
            </Button>
          </div>
        </div>
      </div>
      {dialogs}
    </section>
  )
}
