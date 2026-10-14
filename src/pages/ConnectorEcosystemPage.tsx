import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getEcosystemProduct } from '@/lib/ecosystem'
import EcosystemShowcase, { EcosystemActions, PRODUCT_ICONS, useEcosystemDialogs } from '@/components/ecosystem/EcosystemShowcase'
import NotFound from './NotFound'

/** Conector de um produto irmão do ecossistema (Vertal.app ou Vertal Run). */
export default function ConnectorEcosystemPage() {
  const navigate = useNavigate()
  const { product: id = '' } = useParams()
  const product = getEcosystemProduct(id)
  const { openEmbed, openMcp, dialogs } = useEcosystemDialogs()

  if (!product || product.id === 'vertal-dev') return <NotFound />
  const Icon = PRODUCT_ICONS[product.id]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/connectors')} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
              <Icon className="h-5 w-5" style={{ color: product.color }} />
              {product.name}
            </h1>
            <p className="text-sm text-muted-foreground">Conector do Ecossistema Vertal · {product.domain}</p>
          </div>
          <Badge variant="secondary">Nativo</Badge>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="grid gap-6 rounded-3xl border border-border bg-card p-6 md:grid-cols-[1.2fr_1fr] md:p-8">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: product.color }}>
              {product.role} com o {product.name}
            </p>
            <h2 className="font-display text-3xl font-bold">{product.tagline}</h2>
            <p className="text-muted-foreground">{product.description}</p>
            <EcosystemActions product={product} onEmbed={openEmbed} onMcp={openMcp} />
          </div>
          <ul className="space-y-3 self-center">
            {product.strengths.map(s => (
              <li key={s} className="flex gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{s}</span>
              </li>
            ))}
            <li className="pt-2 text-xs text-muted-foreground">Alternativa a {product.replaces.join(', ')}.</li>
          </ul>
        </div>
      </div>

      <EcosystemShowcase compact />
      {dialogs}
    </div>
  )
}
