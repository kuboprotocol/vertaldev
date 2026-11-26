import { supabase } from '@/integrations/supabase/client'

/**
 * Fonte única do saldo de créditos gastável.
 *
 * O servidor só deixa gastar `subscriptions.edits_limit - edits_used` da
 * assinatura ativa (`execute_atomic_credit_deduction` recusa com
 * `insufficient_credits` abaixo disso — inclusive para admins) e todas as
 * recompensas (vídeo premiado, TERRA ADS, créditos diários do plano) somam em
 * `edits_limit`. Todo lugar que mostra "saldo"/"créditos" deve ler daqui.
 *
 * NÃO use `user_credits.balance` (carteira legada, ninguém gasta dela) nem um
 * número fixo para admin.
 */
export interface CreditRow {
  edits_limit: number | null
  edits_used: number | null
}

export function remainingCredits(row: CreditRow | null | undefined): number {
  if (!row) return 0
  const limit = Number(row.edits_limit ?? 0)
  const used = Number(row.edits_used ?? 0)
  return Math.max(0, limit - used)
}

/** Saldo gastável do usuário (assinatura ativa). `null` se não houver assinatura ativa. */
export async function fetchCreditBalance(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('subscriptions' as any)
    .select('edits_limit, edits_used')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) return null
  return remainingCredits(data as unknown as CreditRow)
}
