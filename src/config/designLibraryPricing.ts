// Biblioteca de designs (Canvas do Design Premium): cobrança de armazenamento e recompensa por reuso.
//
// Armazenamento: cobrado 1 vez por dia, por usuário, conforme a quantidade de designs guardados.
//   até 10 designs → 1 crédito/dia · acima de 10 → 2 · acima de 100 → 3 · acima de 1000 → 4 · e assim por diante.
// Reuso: quando outra pessoa usa um design publicado, o autor ganha crédito (uma vez por quem reutiliza).
//
// O servidor é quem cobra e paga (supabase/migrations/20261024120000_design_library.sql).
// Ao mudar uma regra aqui, mude também na função SQL design_storage_credits_per_day.

export const DESIGN_LIBRARY_FREE_SLOTS = 10;

export const DESIGN_REUSE_REWARD_CREDITS = 1;

// Indicados que já fizeram o primeiro pagamento ganham este crédito por dia (para cobrir o armazenamento).
export const DESIGN_REFERRAL_DAILY_CREDITS = 5;

export function designStorageCreditsPerDay(savedCount: number): number {
  if (savedCount <= 0) return 0;
  if (savedCount <= DESIGN_LIBRARY_FREE_SLOTS) return 1;
  // Cada faixa de potência de 10 acima de 10 soma 1 crédito: 11→2, 101→3, 1001→4...
  // Usa o número de dígitos de (n - 1) para não depender de log10 com erro de ponto flutuante.
  const extraTiers = String(savedCount - 1).length - 1;
  return 1 + extraTiers;
}
