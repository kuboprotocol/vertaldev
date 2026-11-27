import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Copy, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
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
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import { Brand } from '@/components/site/siteUi'
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
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '1 year', days: 365 },
  { value: 'never', label: 'No expiry', days: null },
]

type KeyStatus = 'active' | 'revoked' | 'expired'

function statusOf(k: McpKeyRecord): KeyStatus {
  if (k.revoked_at) return 'revoked'
  if (k.expires_at && Date.parse(k.expires_at) <= Date.now()) return 'expired'
  return 'active'
}

const STATUS_LABEL: Record<KeyStatus, string> = { active: 'Active', revoked: 'Revoked', expired: 'Expired' }

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy. Select the text and copy it yourself.')
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
        aria-label="Copy configuration"
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
      setCreateError('Give the key a name so you can find it later (for example, "Claude on my laptop").')
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
      toast.success('Key created. Copy it now. It will not be shown again.')
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create the key')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    try {
      await revoke(id)
      if (freshKey?.record.id === id) setFreshKey(null)
      toast.success('Key revoked. Clients that used it stop working.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke the key')
    } finally {
      setRevokingId(null)
    }
  }

  const copyFreshKey = async () => {
    if (!activeKeyText) return
    await copyText(activeKeyText, 'Key')
    setKeyCopied(true)
  }

  return (
    <AppShell width="narrow" topBar={<AppTopBar back={{ to: '/dashboard', label: 'Dashboard' }} title="Connect MCP" />}>
      <PanelHeader
        title={<>Use <Brand>Vertal Dev</Brand> from your AI tools</>}
        description="Create a key, choose what the AI tool can do, and paste the configuration into Claude, Cursor, Codex or another MCP client. The tool can then list your projects, and create or edit them if you allow it."
      />

      <div className="space-y-8">

        {/* 1. Gerar chave */}
        <Card className="rounded-2xl border-white/[0.06] bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> New access key
            </CardTitle>
            <CardDescription>
              Each key has an access level and an expiry date. You can revoke a key at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[1fr_200px_180px]">
              <div className="space-y-2">
                <Label htmlFor="mcp-key-name">Name</Label>
                <Input
                  id="mcp-key-name"
                  value={name}
                  maxLength={60}
                  placeholder="For example, Claude on my laptop"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-key-level">Access</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as McpAccessLevel)}>
                  <SelectTrigger id="mcp-key-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read only</SelectItem>
                    <SelectItem value="write">Read and write</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-key-expiry">Expires after</Label>
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

            <div className="rounded-xl border border-white/[0.06] p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">
                What the AI tool can do with "{accessLevelLabel(scopesForLevel(level))}":
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
                  <ShieldAlert className="h-3.5 w-3.5" /> With read only, the AI tool cannot create or change anything.
                </p>
              )}
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <Button onClick={handleCreate} disabled={creating} className="rounded-full">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create key
            </Button>

            {freshKey && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{freshKey.record.name}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Copy it now. For your safety, this key will not be shown again.
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <code className="flex-1 break-all rounded-md bg-background px-3 py-2 font-mono text-sm">{freshKey.key}</code>
                  <Button variant="outline" onClick={copyFreshKey}>
                    {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {keyCopied ? 'Copied' : 'Copy key'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Configuração do cliente */}
        <Card className="rounded-2xl border-white/[0.06] bg-card/50">
          <CardHeader>
            <CardTitle>Configuration for your client</CardTitle>
            <CardDescription>
              {activeKeyText
                ? 'Your key is already in the snippets below.'
                : `Create a key above and it will appear in the snippet below. Until then, the snippet shows ${MCP_KEY_PLACEHOLDER}.`}
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
                    <CodeBlock code={text} onCopy={() => copyText(text, 'Configuration')} />
                  </TabsContent>
                )
              })}
            </Tabs>
            <p className="mt-4 text-xs text-muted-foreground">
              Server URL: <code className="break-all">{VERTAL_DEV_MCP_URL}</code>. Clients that sign in with OAuth
              (such as Claude.ai, in its connectors tab) only need the URL. The client opens the Vertal sign-in page itself.
            </p>
          </CardContent>
        </Card>

        {/* 3. Chaves existentes */}
        <Card className="rounded-2xl border-white/[0.06] bg-card/50">
          <CardHeader>
            <CardTitle>Your keys</CardTitle>
            <CardDescription>Revoke a key you no longer use or that may have leaked.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && !error && keys.length === 0 && (
              <p className="text-sm text-muted-foreground">No keys yet. Create your first key above.</p>
            )}
            {keys.length > 0 && (
              <div className="divide-y divide-white/[0.06]">
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
                          Created {formatDate(k.created_at)} · Last used: {formatDate(k.last_used_at)} · Expires:{' '}
                          {k.expires_at ? formatDate(k.expires_at) : 'never'}
                        </p>
                      </div>
                      {status === 'active' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={revokingId === k.id}>
                              {revokingId === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke "{k.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Clients that use this key stop working right away. This cannot be undone. If you
                                need access again, create a new key.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRevoke(k.id)}>Revoke key</AlertDialogAction>
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
          Tools available at this level: {toolsForLevel(level).map((t) => t.name).join(', ')}. Full documentation at{' '}
          <Link className="underline" to="/docs/mcp">
            /docs/mcp
          </Link>
          .
        </p>
      </div>
    </AppShell>
  )
}
