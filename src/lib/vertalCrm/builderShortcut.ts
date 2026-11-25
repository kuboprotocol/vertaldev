// Atalhos do Vertal Chat na tela /builder (Vibe Code), só na interface: "/crm" abre o Vertal CRM e
// "buscar clientes para meu app …" abre o Vertal Growth. NÃO muda prompts, modelos, roteamento nem o motor:
// o texto que casa com um atalho nem chega a ser enviado; qualquer outro texto segue exatamente como antes.
// Desligado por padrão (VITE_VERTAL_BUILDER_SHORTCUTS) e, ligado, só age para quem tem o produto liberado
// no servidor (mesmas allowlists do CRM / Growth / Prospector).
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVertalCrmAccess, VERTAL_CRM_ROUTE } from '@/lib/vertalCrm/client';
import { isGrowthCommand, useVertalGrowthAccess, vertalGrowthHrefFromChat } from '@/lib/vertalGrowth/client';
import { isProspectCommand, useVertalProspectorAccess, vertalProspectorHrefFromChat } from '@/lib/vertalProspector/client';

type EnvLike = Record<string, unknown> | undefined;

export function isVertalBuilderShortcutsEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_BUILDER_SHORTCUTS;
  return v === true || v === 'true' || v === '1';
}

/** Mesmo comando aceito no Vertal Chat: "/crm", "abrir o crm", "open my crm"… (frase inteira, nada mais). */
export const CRM_COMMAND_RE = /^(\/crm|(abrir|abra|abre|open)( o| el| the| my| meu| mi)? (vertal )?crm)\s*$/i;

export interface ShortcutAccess { crm: boolean; growth: boolean; prospector: boolean }

/** Endereço do atalho para o texto, ou null (o texto segue para o chat normalmente). */
export function matchVertalShortcut(text: string, access: ShortcutAccess): string | null {
  const t = (text ?? '').trim();
  if (!t || t.length > 300) return null;
  if (access.crm && CRM_COMMAND_RE.test(t)) return VERTAL_CRM_ROUTE;
  if (access.growth && isGrowthCommand(t)) return vertalGrowthHrefFromChat(t).replace('from=chat', 'from=builder');
  if (access.prospector && isProspectCommand(t)) return vertalProspectorHrefFromChat(t);
  return null;
}

/** Hook da tela /builder: devolve (texto) → true quando abriu um atalho (aí o envio é cancelado). */
export function useVertalCrmGrowthShortcut(enabledOverride?: boolean): (text: string) => boolean {
  const on = enabledOverride ?? isVertalBuilderShortcutsEnabled();
  const navigate = useNavigate();
  // Desligado: as consultas de acesso nem rodam (override false = "denied" sem chamar o servidor).
  const crm = useVertalCrmAccess(on ? undefined : false);
  const growth = useVertalGrowthAccess(on ? undefined : false);
  const prospector = useVertalProspectorAccess(on ? undefined : false);
  return useCallback((text: string) => {
    if (!on) return false;
    const href = matchVertalShortcut(text, { crm: crm === 'allowed', growth: growth === 'allowed', prospector: prospector === 'allowed' });
    if (!href) return false;
    navigate(href);
    return true;
  }, [on, crm, growth, prospector, navigate]);
}
