// Vertal CRM · volta para /crm depois do cadastro/login (landing "CRM grátis" → /auth?redirect=/crm).
// Módulo mínimo (sem Supabase) para a tela de login não carregar o cliente do CRM.
type EnvLike = Record<string, unknown> | undefined;

/** Mesmo interruptor de `isVertalCrmEnabled` (VITE_VERTAL_CRM). */
export function crmBuildFlagOn(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_CRM;
  return v === true || v === 'true' || v === '1';
}

/** Só /crm (e /crm?…). Nada de outros caminhos, nada externo. */
export function isCrmRedirect(p: string): boolean {
  return p === '/crm' || p.startsWith('/crm?');
}
