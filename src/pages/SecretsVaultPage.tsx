import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { Copy, Eye, EyeOff, KeyRound, Loader2, Lock, Pencil, Plus, Trash2, Users, ArrowLeft } from 'lucide-react'
import { useKuboSecrets, type AuditEntry, type VaultSecret } from '@/hooks/useKuboSecrets'
import { SecretFormDialog } from '@/components/secrets/SecretFormDialog'
import { SecretAccessDialog } from '@/components/secrets/SecretAccessDialog'
import { OrchestratorPanel } from '@/components/secrets/OrchestratorPanel'

/** Quanto tempo um valor revelado fica na tela antes de sumir sozinho. */
const REVEAL_SECONDS = 20

const ACTION_LABEL: Record<AuditEntry['action'], string> = {
  create: 'Criado',
  rotate: 'Valor trocado',
  update: 'Editado',
  delete: 'Excluído',
  reveal: 'Valor revelado',
  grant: 'Acesso concedido',
  revoke: 'Acesso revogado',
  inject: 'Usado na orquestração',
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

  // Página fora de qualquer menu: pede para não ser indexada.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.appendChild(meta)
    document.title = 'Cofre · KUBO'
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
      toast({ title: 'Não foi possível revelar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
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
        toast({ title: 'Não foi possível copiar', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
        return
      }
    }
    try {
      await navigator.clipboard.writeText(value)
      toast({ title: 'Copiado', description: `${s.env_key} está na área de transferência` })
    } catch {
      toast({ title: 'O navegador bloqueou a cópia', variant: 'destructive' })
    }
  }

  const loadAudit = async () => {
    setAuditLoading(true)
    try {
      setAudit(await vault.loadAudit())
    } catch (e) {
      toast({ title: 'Auditoria indisponível', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setAuditLoading(false)
    }
  }

  const secretName = (id: string | null) => vault.secrets.find((s) => s.id === id)?.name ?? '—'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
          <Badge variant="outline" className="gap-1">
            <Lock className="h-3 w-3" /> Visível só para você e quem você autorizar
          </Badge>
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Cofre de segredos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaves de API, tokens e senhas. Separado dos conectores: aqui fica o valor, lá fica a integração.
          </p>
        </header>

        <Tabs defaultValue="secrets" onValueChange={(v) => v === 'audit' && audit === null && void loadAudit()}>
          <TabsList>
            <TabsTrigger value="secrets">Segredos</TabsTrigger>
            <TabsTrigger value="orchestrator">Orquestrador</TabsTrigger>
            <TabsTrigger value="audit">Auditoria</TabsTrigger>
          </TabsList>

          <TabsContent value="secrets" className="mt-5 grid gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, variável ou grupo"
                className="max-w-xs"
                aria-label="Buscar segredos"
              />
              <div className="ml-auto">
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Novo segredo
                </Button>
              </div>
            </div>

            {vault.loading && vault.secrets.length === 0 && (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Abrindo o cofre…
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
                  <p className="font-medium">O cofre está vazio</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Guarde aqui a primeira chave. Ela fica cifrada e só você decide quem pode usá-la.
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
                      <Card key={s.id}>
                        <CardContent className="grid gap-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{s.name}</p>
                                {isOwner ? (
                                  <Badge variant="secondary">Seu</Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1">
                                    <Users className="h-3 w-3" /> Compartilhado
                                  </Badge>
                                )}
                                {!isOwner && s.can_reveal && <Badge variant="outline">Pode ver</Badge>}
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
                                  aria-label={r ? 'Ocultar valor' : 'Revelar valor'}
                                >
                                  {busyReveal === s.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : r ? (
                                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  {r ? 'Ocultar' : 'Revelar'}
                                </Button>
                              )}
                              {(isOwner || s.can_reveal) && (
                                <Button variant="ghost" size="sm" onClick={() => void copy(s)} aria-label="Copiar valor">
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isOwner && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => setAccessFor(s)} aria-label="Gerenciar acessos">
                                    <Users className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditing(s)
                                      setFormOpen(true)
                                    }}
                                    aria-label="Editar segredo"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} aria-label="Excluir segredo">
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
                                ? `Some em ${secondsLeft}s`
                                : `Trocado em ${new Date(s.rotated_at).toLocaleDateString('pt-BR')}`}
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
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            )}
            {!auditLoading && audit && audit.length === 0 && (
              <p className="py-10 text-sm text-muted-foreground">Nenhum registro ainda.</p>
            )}
            {!auditLoading && audit && audit.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Segredo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString('pt-BR')}
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
              A auditoria só cresce: nenhum registro pode ser editado ou apagado. Valores nunca entram nela.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <SecretFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        secret={editing}
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
            <AlertDialogTitle>Excluir {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O valor some do cofre e quem tinha acesso perde o acesso. A auditoria continua registrando a exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return
                try {
                  await vault.remove(deleting.id)
                  toast({ title: 'Segredo excluído' })
                } catch (e) {
                  toast({ title: 'Não foi possível excluir', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
                } finally {
                  setDeleting(null)
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
