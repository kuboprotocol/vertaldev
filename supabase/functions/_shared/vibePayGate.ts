// Trava do Vertal Vibe Pay enquanto está em desenvolvimento (2026-11-20):
// só as contas abaixo usam o /pay e as ações bank-*/asaas-*/pay-* da função wallet.
// Manter igual a src/config/vibePayGate.ts. Para abrir ao público: VIBE_PAY_OPEN=true.
export const VIBE_PAY_ALLOWED_EMAILS = [
  "kuboprotocol@gmail.com",
  "brazilverde1@gmail.com",
  "erikaguiar21@gmail.com",
];

export function vibePayAllowed(email: string | null | undefined, open = false): boolean {
  if (open) return true;
  const e = (email ?? "").trim().toLowerCase();
  return e !== "" && VIBE_PAY_ALLOWED_EMAILS.includes(e);
}
