import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import { useMcpAccessKeys, type CreatedMcpKey } from '@/hooks/useMcpAccessKeys'
import {
  MCP_CLIENTS,
  MCP_KEY_PLACEHOLDER,
  accessLevelLabel,
  configFor,
  scopesForLevel,
  toolsForLevel,
  type McpAccessLevel,
  type McpClientId,
  type McpKeyRecord,
} from '@/lib/mcpClientConfig'
import { VERTAL_DEV_MCP_URL } from '@/lib/ecosystem'

const EXPIRY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: '7', label: '7 dias', days: 7 },
  { value: '30', label: '30 dias', days: 30 },
  { value: '90', label: '90 dias', days: 90 },
  { value: '365', label: '1 ano', days: 365 },
  { value: 'never', label: 'Sem prazo', days: null },
]

type KeyStatus = 'active' | 'revoked' | 'expired'

function statusOf(k: McpKeyRecord): KeyStatus {
  if (k.revoked_at) return 'revoked'
  if (k.expires_at && Date.parse(k.expires_at) <= Date.now()) return 'expired'
  return 'active'
}

const STATUS_LABEL: Record<KeyStatus, string> = { active: 'Ativa', revoked: 'Revogada', expired: 'Expirada' }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  } catch {
    toast.error('Não consegui copiar. Selecione o texto e copie manualmente.')
  }
}

function CodeBlock({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 pr-12 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
        {code}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8"
        onClick={onCopy}
        aria-label="Copiar configuração"
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function McpAccessPage() {
  const { keys, loading, error, create, revoke } = useMcpAccessKeys()

  const [name, setName] = useState('')
  const [level, setLevel] = useState<McpAccessLevel>('read')
  const [expiry, setExpiry] = useState('90')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [freshKey, setFreshKey] = useState<CreatedMcpKey | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [client, setClient] = useState<McpClientId>('claude-code')

  const activeKeyText = freshKey?.key ?? null

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setCreateError('Dê um nome para identificar a chave (ex.: “Claude do notebook”).')
      return
    }
    const days = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null
    setCreating(true)
    setCreateError(null)
    try {
      const created = await create({ name: trimmed, level, expiresInDays: days })
      setFreshKey(created)
      setKeyCopied(false)
      setName('')
      toast.success('Chave criada. Copie agora: ela não será mostrada de novo.')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Não foi possível criar a chave')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    try {
      await revoke(id)
      if (freshKey?.record.id === id) setFreshKey(null)
      toast.success('Chave revogada. Clientes que a usavam deixam de funcionar.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível revogar a chave')
    } finally {
      setRevokingId(null)
    }
  }

  const copyFreshKey = async () => {
    if (!activeKeyText) return
    await copyText(activeKeyText, 'Chave')
    setKeyCopied(true)
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      <header className="glass glass-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="hover:bg-accent">
            <Link to="/dashboard" aria-label="Voltar ao painel">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <AnimatedLogo size={15} />
            <h1 className="min-w-0 text-lg sm:text-xl font-bold text-foreground font-display">Conectar MCP</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <section className="space-y-2">
          <h2 className="text-3xl font-bold text-foreground font-display">Use o Vertal Dev de qualquer IA</h2>
          <p className="text-muted-foreground max-w-2xl">
            Gere uma chave, escolha o que a IA pode fazer e cole a configuração no Claude, Cursor, Codex ou outro cliente
            MCP. A IA passa a listar seus projetos, criar e editar projetos conforme o nível que você liberou.
          </p>
        </section>

        {/* 1. Gerar chave */}
        <Card className="glass glass-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Nova chave de acesso
            </CardTitle>
            <CardDescription>
              Cada chave tem um nível de acesso e um prazo. Você pode revogar qualquer uma a qualquer momento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_180px]">
              <div className="space-y-2">
                <Label htmlFor="mcp-key-name">Nome</Label>
                <Input
                  id="mcp-key-name"
                  value={name}
                  maxLength={60}
                  placeholder="Ex.: Claude do notebook"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-key-level">Acesso</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as McpAccessLevel)}>
                  <SelectTrigger id="mcp-key-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Somente leitura</SelectItem>
                    <SelectItem value="write">Leitura e escrita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-key-expiry">Validade</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger id="mcp-key-expiry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">
                O que a IA pode fazer com “{accessLevelLabel(scopesForLevel(level))}”:
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {toolsForLevel(level).map((t) => (
                  <li key={t.name} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" /> {t.description}
                  </li>
                ))}
              </ul>
              {level === 'read' && (
                <p className="mt-3 flex items-center gap-2">
                  <ShieldAlert className="h-3.5 w-3.5" /> Com somente leitura, a IA não consegue criar nem alterar nada.
                </p>
              )}
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Gerar chave
            </Button>

            {freshKey && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{freshKey.record.name}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Copie agora. Por segurança, esta chave não será mostrada de novo.
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <code className="flex-1 break-all rounded-md bg-background px-3 py-2 font-mono text-sm">{freshKey.key}</code>
                  <Button variant="outline" onClick={copyFreshKey}>
                    {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {keyCopied ? 'Copiada' : 'Copiar chave'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Configuração do cliente */}
        <Card className="glass glass-border">
          <CardHeader>
            <CardTitle>Configuração para o seu cliente</CardTitle>
            <CardDescription>
              {activeKeyText
                ? 'Sua chave já está dentro dos trechos abaixo.'
                : `Gere uma chave acima para o trecho abaixo sair com a sua chave. Até lá, aparece ${MCP_KEY_PLACEHOLDER}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={client} onValueChange={(v) => setClient(v as McpClientId)} className="space-y-4">
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                {MCP_CLIENTS.map((c) => (
                  <TabsTrigger key={c.id} value={c.id}>
                    {c.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {MCP_CLIENTS.map((c) => {
                const text = configFor(c.id, VERTAL_DEV_MCP_URL, activeKeyText)
                return (
                  <TabsContent key={c.id} value={c.id} className="space-y-3">
                    <p className="text-sm text-muted-foreground">{c.where}</p>
                    <CodeBlock code={text} onCopy={() => copyText(text, 'Configuração')} />
                  </TabsContent>
                )
              })}
            </Tabs>
            <p className="mt-4 text-xs text-muted-foreground">
              URL do servidor: <code className="break-all">{VERTAL_DEV_MCP_URL}</code>. Clientes que fazem login por OAuth
              (como o Claude.ai na aba de conectores) só precisam da URL: o próprio cliente abre a tela de login do Vertal.
            </p>
          </CardContent>
        </Card>

        {/* 3. Chaves existentes */}
        <Card className="glass glass-border">
          <CardHeader>
            <CardTitle>Suas chaves</CardTitle>
            <CardDescription>Revogue uma chave que você não usa mais ou que possa ter vazado.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && !error && keys.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma chave ainda. Gere a primeira acima.</p>
            )}
            {keys.length > 0 && (
              <div className="divide-y divide-border">
                {keys.map((k) => {
                  const status = statusOf(k)
                  return (
                    <div key={k.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{k.name}</span>
                          <Badge variant={k.scopes.includes('write') ? 'default' : 'secondary'}>
                            {accessLevelLabel(k.scopes)}
                          </Badge>
                          <Badge variant={status === 'active' ? 'outline' : 'destructive'}>{STATUS_LABEL[status]}</Badge>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</p>
                        <p className="text-xs text-muted-foreground">
                          Criada em {formatDate(k.created_at)} · Último uso: {formatDate(k.last_used_at)} · Validade:{' '}
                          {k.expires_at ? formatDate(k.expires_at) : 'sem prazo'}
                        </p>
                      </div>
                      {status === 'active' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={revokingId === k.id}>
                              {revokingId === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              Revogar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revogar “{k.name}”?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Os clientes que usam esta chave deixam de funcionar na hora. Isso não pode ser desfeito: se
                                precisar, gere outra chave.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRevoke(k.id)}>Revogar chave</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Ferramentas disponíveis com este nível: {toolsForLevel(level).map((t) => t.name).join(', ')}. Documentação completa em{' '}
          <Link className="underline" to="/docs/mcp">
            /docs/mcp
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
