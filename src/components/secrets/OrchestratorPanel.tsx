import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, RefreshCcw, ShieldCheck, ShieldAlert, Plug, PlugZap } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  fetchOverview,
  fetchPlan,
  type OverviewResponse,
  type PlanResponse,
  type TargetOverview,
} from '@/hooks/useKuboSecrets'
import type { PlanStatus } from '../../../supabase/functions/_shared/kuboSecretsCore'

const STATUS_LABEL: Record<PlanStatus, string> = {
  ready: 'Pronto',
  partial: 'Parcial',
  missing: 'Faltando',
  empty: 'Vazio',
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const variant = status === 'ready' ? 'default' : status === 'missing' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}

/**
 * Orquestrador: mostra, por destino, se as chaves que ele exige estão no cofre
 * e se o conector correspondente está conectado. Cofre e conectores continuam
 * separados; aqui eles só aparecem lado a lado.
 */
export function OrchestratorPanel() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [openTarget, setOpenTarget] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [planLoading, setPlanLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await fetchOverview())
    } catch (e) {
      toast({ title: 'Orquestrador indisponível', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const togglePlan = async (t: TargetOverview) => {
    if (openTarget === t.slug) {
      setOpenTarget(null)
      setPlan(null)
      return
    }
    setOpenTarget(t.slug)
    setPlan(null)
    setPlanLoading(true)
    try {
      setPlan(await fetchPlan(t.slug))
    } catch (e) {
      toast({ title: 'Não foi possível montar o plano', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setPlanLoading(false)
    }
  }

  if (loading && !overview) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Montando o panorama…
      </div>
    )
  }
  if (!overview) return null

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {overview.secrets_total} segredo(s) visíveis · {overview.owned} seu(s) · {overview.shared_with_me} compartilhado(s) com você
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            {overview.needs_attention === 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" /> Tudo pronto
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-4 w-4" /> {overview.needs_attention} destino(s) pedem atenção
              </span>
            )}
          </span>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {overview.targets.map((t) => (
          <Card
            key={t.slug}
            className={openTarget === t.slug ? 'ring-1 ring-primary' : undefined}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{t.label}</CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </div>
                <StatusBadge status={t.status} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Chaves no cofre</span>
                <span className="font-medium tabular-nums">
                  {t.ready_count}/{t.total}
                </span>
              </div>

              {t.connector && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Conector {t.connector.slug}</span>
                  <span className="inline-flex items-center gap-1">
                    {t.connector.connected ? (
                      <>
                        <PlugZap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> conectado
                      </>
                    ) : (
                      <>
                        <Plug className="h-3.5 w-3.5 text-muted-foreground" /> não conectado
                      </>
                    )}
                  </span>
                </div>
              )}

              {t.warnings.length > 0 && (
                <ul className="grid gap-1 text-xs text-amber-700 dark:text-amber-400">
                  {t.warnings.slice(0, 3).map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}

              <Button variant="ghost" size="sm" className="justify-self-start px-0" onClick={() => void togglePlan(t)}>
                {openTarget === t.slug ? 'Fechar plano' : 'Ver plano'}
              </Button>

              {openTarget === t.slug && (
                <div className="grid gap-2 border-t pt-3">
                  {planLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Conferindo…
                    </div>
                  )}
                  {plan && plan.target === t.slug &&
                    plan.entries.map((e) => (
                      <div key={e.env_key} className="flex items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs">{e.env_key}</p>
                          {e.warning && <p className="text-xs text-amber-700 dark:text-amber-400">{e.warning}</p>}
                          {e.status === 'ready' && e.source === 'grant' && (
                            <p className="text-xs text-muted-foreground">Compartilhado com você</p>
                          )}
                        </div>
                        <Badge variant={e.status === 'ready' ? 'default' : 'destructive'}>
                          {e.status === 'ready' ? 'Pronto' : 'Faltando'}
                        </Badge>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
