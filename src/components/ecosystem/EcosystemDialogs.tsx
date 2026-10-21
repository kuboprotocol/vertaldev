import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, Plug, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type EcosystemProduct } from '@/lib/ecosystem'

/** App atual, usado nos parâmetros de origem dos links (marketing/atribuição). */
const SOURCE = 'vertal-dev'

export function ecosystemLink(product: EcosystemProduct, medium: 'link' | 'embed' = 'link'): string {
  const url = new URL(medium === 'embed' ? product.embedUrl : product.url)
  url.searchParams.set('utm_source', SOURCE)
  url.searchParams.set('utm_medium', `ecosystem-${medium}`)
  return url.toString()
}

function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard indisponível (http ou permissão negada)
    }
  }
  return (
    <Button type="button" size="sm" variant="secondary" onClick={copy} className="gap-1.5 shrink-0">
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : label}
    </Button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-muted/40 p-4 text-xs font-mono leading-relaxed text-foreground">
        {code}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={code} />
      </div>
    </div>
  )
}

/** Abre outro produto do ecossistema dentro de um iframe, sem sair do Vertal Dev. */
export function EcosystemEmbedDialog({
  product,
  open,
  onOpenChange,
}: {
  product: EcosystemProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (open) setLoaded(false)
  }, [open, product?.id])

  if (!product) return null
  const src = ecosystemLink(product, 'embed')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="ecosystem-embed-dialog"
        className="max-w-[min(1200px,96vw)] w-[96vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl [&>button]:hidden"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card/80 backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: product.color }} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold truncate">{product.name}</DialogTitle>
            <DialogDescription className="text-xs truncate">{product.domain} · integrado ao Vertal Dev</DialogDescription>
          </div>
          <Button asChild size="sm" variant="secondary" className="gap-1.5">
            <a href={ecosystemLink(product)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Abrir em nova aba</span>
            </a>
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative flex-1 bg-background">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Carregando {product.name}…</p>
            </div>
          )}
          <iframe
            key={product.id}
            title={product.name}
            src={src}
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          />
        </div>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Se o login não aparecer dentro da janela (alguns navegadores bloqueiam cookies em iframes), use “Abrir em nova aba”.
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** Instruções de conexão MCP de um produto do ecossistema. */
export function EcosystemMcpDialog({
  product,
  open,
  onOpenChange,
}: {
  product: EcosystemProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!product) return null
  const { mcp } = product

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ecosystem-mcp-dialog" className="max-w-2xl rounded-2xl">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{ backgroundColor: `${product.color}20` }}
          >
            <Plug className="h-5 w-5" style={{ color: product.color }} />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg">Conectar {product.name} via MCP</DialogTitle>
            <DialogDescription className="text-sm">
              Dê ao seu agente (Claude, ChatGPT, Cursor ou KUBO IA) as ferramentas do {product.name}.
            </DialogDescription>
          </div>
        </div>

        {mcp.url && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">URL do servidor MCP</p>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono">
                {mcp.url}
              </code>
              <CopyButton value={mcp.url} />
            </div>
          </div>
        )}

        <Tabs defaultValue="config" className="space-y-3">
          <TabsList>
            <TabsTrigger value="config">Configuração JSON</TabsTrigger>
            {mcp.cli && <TabsTrigger value="cli">Claude Code</TabsTrigger>}
          </TabsList>
          <TabsContent value="config">
            <CodeBlock code={mcp.config} />
          </TabsContent>
          {mcp.cli && (
            <TabsContent value="cli">
              <CodeBlock code={mcp.cli} />
            </TabsContent>
          )}
        </Tabs>

        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Autenticação:</span>{' '}
            <span className="text-muted-foreground">{mcp.auth}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mcp.tools.map(tool => (
              <Badge key={tool} variant="secondary" className="font-mono text-[11px]">
                {tool}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <a href={mcp.docsUrl} target="_blank" rel="noopener noreferrer">
              Documentação <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Pronto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
