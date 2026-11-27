import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { shouldShowAd } from '@/lib/planConfig'

// "subscriptions" não está nos tipos gerados do Supabase (o resto do app usa `as any` também).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any }

// Uma consulta por usuário, compartilhada por todos os blocos de anúncio da página.
const planCache = new Map<string, Promise<string>>()

function fetchPlan(userId: string): Promise<string> {
  let pending = planCache.get(userId)
  if (!pending) {
    pending = (async () => {
      try {
        const { data, error } = await db
          .from('subscriptions')
          .select('plan')
          .eq('user_id', userId)
          .maybeSingle()
        // Erro na consulta: não arrisca mostrar anúncio para quem paga.
        if (error) {
          planCache.delete(userId)
          return ''
        }
        // Sem linha de assinatura = Free (mesma regra do antigo useAdGate).
        return ((data as { plan?: string } | null)?.plan) ?? 'free'
      } catch {
        // Sem plano confirmado, sem anúncio.
        planCache.delete(userId)
        return ''
      }
    })()
    planCache.set(userId, pending)
  }
  return pending
}

/**
 * Se o usuário logado vê anúncios de display: mesma regra de plano do antigo anúncio
 * (shouldShowAd / AD_SUPPORTED_PLANS = Free e Starter). Admin, planos pagos, visitante
 * sem login ou plano desconhecido não veem.
 */
export function useAdEligibility(): boolean {
  const { user, isAdmin } = useAuth()
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    let cancelled = false
    setEligible(false)
    if (!user || isAdmin) return
    fetchPlan(user.id).then((plan) => {
      if (!cancelled) setEligible(Boolean(plan) && shouldShowAd({ plan, lastShownAt: null }))
    })
    return () => {
      cancelled = true
    }
  }, [user, isAdmin])

  return eligible
}

/** Só para testes. */
export function __resetAdEligibilityCache() {
  planCache.clear()
}
