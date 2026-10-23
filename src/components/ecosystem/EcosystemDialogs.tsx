import { useState } from 'react'
import { Check, Copy, ExternalLink, Plug, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type EcosystemProduct } from '@/lib/ecosystem'
import { SITE_ORIGIN } from '@/config/brand'

/** App atual, usado nos parâmetros de origem dos links (marketing/atribuição). */
const SOURCE = 'vertal-dev'

export function ecosystemLink(product: EcosystemProduct, medium: 'link' | 'embed' = 'link'): string {
  const url = new URL(medium === 'embed' ? product.embedUrl : product.url)
  url.searchParams.set('utm_source', SOURCE)
  url.searchParams.set('utm_medium', `ecosystem-${medium}`)
  // Depois de conectar, o produto volta para o hub de conectores do Vertal Dev
  // com ?connected=<produto>, que mostra a confirmação.
  url.searchParams.set('return_to', `${SITE_ORIGIN}/connectors`)
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

/**
 * Abre outro produto do ecossistema. Não usa iframe: login e sessão são cookies
 * de terceiros dentro de outro site, e navegadores bloqueiam isso (o login
 * nunca termina). Por isso o diálogo leva direto para uma aba nova.
 */
export function EcosystemEmbedDialog({
  product,
  open,
  onOpenChange,
}: {
  product: EcosystemProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!product) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="ecosystem-embed-dialog"
        className="max-w-md w-[92vw] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card/80 backdrop-blur">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: product.color }} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold truncate">{product.name}</DialogTitle>
            <DialogDescription className="text-xs truncate">{product.domain} · integrado ao Vertal Dev</DialogDescription>
          </div>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            O login de {product.name} precisa acontecer no próprio site. Dentro desta janela, o navegador bloqueia o cookie de sessão e o login não termina.
          </p>
          <Button asChild variant="hero" className="gap-1.5 rounded-xl">
            <a href={ecosystemLink(product)} target="_blank" rel="noopener noreferrer" onClick={() => onOpenChange(false)}>
              Abrir {product.name} em nova aba
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
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
