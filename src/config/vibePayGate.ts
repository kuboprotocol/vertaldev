/**
 * Trava do Vertal Vibe Pay enquanto está em desenvolvimento (2026-11-20).
 * Só estas contas abrem o /pay; as demais veem "Estamos em desenvolvimento".
 * O servidor (supabase/functions/_shared/vibePayGate.ts) aplica a mesma lista.
 * Para abrir ao público: `open: true` aqui e VIBE_PAY_OPEN=true na função.
 */
export const VIBE_PAY_GATE = {
  open: false,
  allowedEmails: ['kuboprotocol@gmail.com', 'brazilverde1@gmail.com', 'erikaguiar21@gmail.com'],
} as const

export function canAccessVibePay(email: string | null | undefined): boolean {
  if (VIBE_PAY_GATE.open) return true
  const e = (email ?? '').trim().toLowerCase()
  return e !== '' && (VIBE_PAY_GATE.allowedEmails as readonly string[]).includes(e)
}
