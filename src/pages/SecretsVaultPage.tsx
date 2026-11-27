import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { Copy, Eye, EyeOff, KeyRound, Loader2, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useKuboSecrets, type AuditEntry, type VaultSecret } from '@/hooks/useKuboSecrets'
import { SecretFormDialog } from '@/components/secrets/SecretFormDialog'
import { SecretAccessDialog } from '@/components/secrets/SecretAccessDialog'
import { OrchestratorPanel } from '@/components/secrets/OrchestratorPanel'
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'

/** Quanto tempo um valor revelado fica na tela antes de sumir sozinho. */
const REVEAL_SECONDS = 20

const ACTION_LABEL: Record<AuditEntry['action'], string> = {
  create: 'Created',
  rotate: 'Value changed',
  update: 'Edited',
  delete: 'Deleted',
  reveal: 'Value revealed',
  grant: 'Access granted',
  revoke: 'Access revoked',
  inject: 'Used in orchestration',
}

interface Revealed {
  value: string
  until: number
}

export default function SecretsVaultPage() {
  const vault = useKuboSecrets()
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VaultSecret | null>(null)
  const [accessFor, setAccessFor] = useState<VaultSecret | null>(null)
  const [deleting, setDeleting] = useState<VaultSecret | null>(null)
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({})
  const [busyReveal, setBusyReveal] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [prefill, setPrefill] = useState<{ name?: string; env_key?: string } | null>(null)

  // /secrets?env_key=ACME_API_KEY&name=… (vindo do agente): abre "Novo segredo" preenchido.
  useEffect(() => {
    const envKey = searchParams.get('env_key')
    const name = searchParams.get('name')
    if (!envKey && !name) return
    setPrefill({ env_key: envKey ?? undefined, name: name ?? undefined })
    setEditing(null)
    setFormOpen(true)
    setSearchParams(
      (prev) => {
        prev.delete('env_key')
        prev.delete('name')
        return prev
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  // Página fora de qualquer menu: pede para não ser indexada.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
    document.title = 'Secrets vault · KUBO'
    return () => {
      meta.remove()
    }
  }, [])

  // Tira da tela os valores revelados quando o prazo acaba.
  useEffect(() => {
    if (Object.keys(revealed).length === 0) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      setRevealed((prev) => {
        const alive = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.until > t))
        return Object.keys(alive).length === Object.keys(prev).length ? prev : alive
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [revealed])

  // Ao sair da página, nenhum valor fica em memória.
  useEffect(() => () => setRevealed({}), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vault.secrets
    return vault.secrets.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.env_key.toLowerCase().includes(q) ||
        s.group_name.toLowerCase().includes(q),
    )
  }, [vault.secrets, query])

  const groups = useMemo(() => {
    const map = new Map<string, VaultSecret[]>()
    for (const s of filtered) {
      const list = map.get(s.group_name) ?? []
      list.push(s)
      map.set(s.group_name, list)
    }
    return [...map.entries()]
  }, [filtered])

  const toggleReveal = async (s: VaultSecret) => {
    if (revealed[s.id]) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[s.id]
        return next
      })
      return
    }
    setBusyReveal(s.id)
    try {
      const value = await vault.reveal(s.id)
      setRevealed((prev) => ({ ...prev, [s.id]: { value, until: Date.now() + REVEAL_SECONDS * 1000 } }))
    } catch (e) {
      toast({ title: 'Could not reveal', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setBusyReveal(null)
    }
  }

  const copy = async (s: VaultSecret) => {
    let value = revealed[s.id]?.value
    if (!value) {
      try {
        value = await vault.reveal(s.id)
      } catch (e) {
        toast({ title: 'Could not copy', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
        return
      }
    }
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: 'Copied', description: `${s.env_key} is on your clipboard` })
    } catch {
      toast({ title: 'The browser blocked copying', variant: 'destructive' })
    }
  }

  const loadAudit = async () => {
    setAuditLoading(true)
    try {
      setAudit(await vault.loadAudit())
    } catch (e) {
      toast({ title: 'Audit log is not available', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setAuditLoading(false)
    }
  }

  const secretName = (id: string | null) => vault.secrets.find((s) => s.id === id)?.name ?? '-'

  return (
    <AppShell
      topBar={
        <AppTopBar
          back={{ to: '/', label: 'Home' }}
          actions={
            <Badge variant="outline" className="hidden gap-1 rounded-full sm:inline-flex">
              <Lock className="h-3 w-3" /> Visible only to you and people you allow
            </Badge>
          }
        />
      }
    >
      <div>
        <PanelHeader
          title="Secrets vault"
          description="API keys, tokens and passwords. The vault keeps the values. Connectors keep the integrations."
        />

        <Tabs defaultValue="secrets" onValueChange={(v) => v === 'audit' && audit === null && void loadAudit()}>
          <TabsList>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
            <TabsTrigger value="orchestrator">Orchestrator</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="secrets" className="mt-5 grid gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, variable or group"
                className="max-w-xs"
                aria-label="Search secrets"
              />
              <div className="ml-auto">
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                  className="rounded-full"
                >
                  <Plus className="mr-1.5 h-4 w-4" /> New secret
                </Button>
              </div>
            </div>

            {vault.loading && vault.secrets.length === 0 && (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Opening the vault...
              </div>
            )}

            {vault.error && (
              <Card>
                <CardContent className="py-6 text-sm text-destructive">{vault.error}</CardContent>
              </Card>
            )}

            {!vault.loading && !vault.error && vault.secrets.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <KeyRound className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">The vault is empty</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Add your first key. It is stored encrypted, and only you decide who can use it.
                  </p>
                </CardContent>
              </Card>
            )}

            {groups.map(([group, items]) => (
              <section key={group} className="grid gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{group}</h2>
                <div className="grid gap-2">
                  {items.map((s) => {
                    const r = revealed[s.id]
                    const secondsLeft = r ? Math.max(0, Math.ceil((r.until - now) / 1000)) : 0
                    const isOwner = s.role === 'owner'
                    return (
                      <Card key={s.id} className="rounded-xl border-white/[0.06] bg-card/50">
                        <CardContent className="grid gap-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{s.name}</p>
                                {isOwner ? (
                                  <Badge variant="secondary">Yours</Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1">
                                    <Users className="h-3 w-3" /> Shared
                                  </Badge>
                                )}
                                {!isOwner && s.can_reveal && <Badge variant="outline">Can see</Badge>}
                              </div>
                              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{s.env_key}</p>
                              {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {(isOwner || s.can_reveal) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={busyReveal === s.id}
                                  onClick={() => void toggleReveal(s)}
                                  aria-label={r ? 'Hide value' : 'Reveal value'}
                                >
                                  {busyReveal === s.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : r ? (
                                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {r ? 'Hide' : 'Reveal'}
                                </Button>
                              )}
                              {(isOwner || s.can_reveal) && (
                                <Button variant="ghost" size="sm" onClick={() => void copy(s)} aria-label="Copy value">
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isOwner && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => setAccessFor(s)} aria-label="Manage access">
                                    <Users className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditing(s)
                                      setFormOpen(true)
                                    }}
                                    aria-label="Edit secret"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} aria-label="Delete secret">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{r ? r.value : s.masked_hint ?? '••••••'}</span>
                            <span>
                              {r
                                ? `Hidden in ${secondsLeft}s`
                                : `Changed on ${new Date(s.rotated_at).toLocaleDateString()}`}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </TabsContent>

          <TabsContent value="orchestrator" className="mt-5">
            <OrchestratorPanel />
          </TabsContent>

          <TabsContent value="audit" className="mt-5">
            {auditLoading && (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            )}
            {!auditLoading && audit && audit.length === 0 && (
              <p className="py-10 text-sm text-muted-foreground">No entries yet.</p>
            )}
            {!auditLoading && audit && audit.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Secret</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{ACTION_LABEL[a.action]}</TableCell>
                        <TableCell className="font-mono text-xs">{a.env_key ?? secretName(a.secret_id)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Entries in the audit log cannot be edited or deleted. Secret values are never logged.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <SecretFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setPrefill(null)
        }}
        secret={editing}
        initial={prefill}
        onCreate={vault.create}
        onUpdate={vault.update}
        onRotate={vault.rotate}
      />

      <SecretAccessDialog
        secret={accessFor ? vault.secrets.find((s) => s.id === accessFor.id) ?? null : null}
        onOpenChange={(open) => !open && setAccessFor(null)}
        onGrant={vault.grant}
        onRevoke={vault.revoke}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The value is removed from the vault and everyone loses access to it. The audit log keeps a record of the deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return
                try {
                  await vault.remove(deleting.id)
                  toast({ title: 'Secret deleted' })
                } catch (e) {
                  toast({ title: 'Could not delete', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
                } finally {
                  setDeleting(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}
