import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Gift } from 'lucide-react'
import RewardedVideoPanel from '@/components/shortlinks/RewardedVideoPanel'
import DailyChecklistCard from '@/components/shortlinks/DailyChecklistCard'
import { fetchDailyChecklist, reportTerraUnavailable, type DailyChecklist } from '@/lib/dailyRewards'
import { useAuth } from '@/hooks/useAuth'

/**
 * Recompensas dentro do Painel Criativo (no lugar do antigo SponsoredSlot/TerraRewardsPanel, removidos
 * no #305): vídeo premiado (AppLixir / Google Ad Manager rewarded, aberto só pelo clique do usuário) e o
 * progresso dos créditos do dia. Nenhum anúncio de terceiros carrega sozinho aqui.
 */
export function CreativeRewardsPanel({ className = '' }: { className?: string }) {
  const { user } = useAuth()
  const [checklist, setChecklist] = useState<DailyChecklist | null>(null)
  const extraVideoStepRef = useRef(false)

  const apply = useCallback((next: DailyChecklist | null | undefined) => {
    if (!next || typeof next.completed !== 'boolean') return
    setChecklist((prev) => ({ ...prev, ...next, music_min_seconds: next.music_min_seconds ?? prev?.music_min_seconds }))
  }, [])

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      apply(await fetchDailyChecklist())
    } catch {
      /* o progresso é só informativo aqui */
    }
  }, [user, apply])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Mesmo fechamento do passo legado "TERRA" que /recompensas faz (idempotente no servidor, 1x por dia).
  useEffect(() => {
    if (!user || !checklist || extraVideoStepRef.current) return
    if (checklist.terra_done || checklist.terra_unavailable) return
    extraVideoStepRef.current = true
    reportTerraUnavailable('panel_error')
      .then((res) => {
        if (res?.ok && res.checklist) apply(res.checklist)
      })
      .catch(() => undefined)
  }, [user, checklist, apply])

  if (!user) return null

  return (
    <section aria-labelledby="creative-rewards-title" className={`space-y-4 ${className}`} data-testid="creative-rewards-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 id="creative-rewards-title" className="flex items-center gap-2 text-xl font-semibold text-white">
          <Gift className="h-5 w-5 text-violet-300" aria-hidden />
          Ganhe créditos
        </h2>
        <a
          href="/recompensas"
          className="inline-flex items-center gap-1 text-sm text-violet-300 transition-colors hover:text-violet-200"
          data-testid="creative-rewards-link"
        >
          Todas as recompensas
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <RewardedVideoPanel onCredited={refresh} />
        <DailyChecklistCard checklist={checklist} />
      </div>
    </section>
  )
}

export default CreativeRewardsPanel
