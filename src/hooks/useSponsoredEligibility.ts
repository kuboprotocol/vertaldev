import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { AD_SUPPORTED_PLANS } from '@/lib/planConfig'

/**
 * Pode ver anúncio patrocinado no Painel Criativo?
 * Regra de docs/PLANOS_E_ANUNCIOS.md: só planos em AD_SUPPORTED_PLANS (Free e Starter).
 * Sem login, admin ou erro ao ler o plano, não mostra nada. Sem assinatura conta como Free.
 */
export function useSponsoredEligibility(): boolean {
  const { user, isAdmin } = useAuth()
  const [eligible, setEligible] = useState(false)
  const userId = user?.id

  useEffect(() => {
    let cancelled = false

    if (!userId || isAdmin) {
      setEligible(false)
      return
    }

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('user_id', userId)
          .maybeSingle()
        if (error) throw error
        const plan = data?.plan ?? 'free'
        if (!cancelled) setEligible((AD_SUPPORTED_PLANS as readonly string[]).includes(plan))
      } catch (err) {
        console.error('[SponsoredSlot] não foi possível ler o plano:', err)
        if (!cancelled) setEligible(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, isAdmin])

  return eligible
}
