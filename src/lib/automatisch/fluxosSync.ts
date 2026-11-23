// "Conta do Vertal": conectou um app compartilhado no Vertal Dev → a conexão
// aparece no Vertal Fluxos sem reconectar. O servidor cria a conexão só com a
// chave do usuário; o token do provedor nunca vai para o Fluxos.
import { supabase } from '@/integrations/supabase/client';

export const FLUXOS_SHARED = ['gmail', 'spotify', 'slack', 'github', 'stripe', 'discord'] as const;

/** Sincroniza sem atrapalhar a conexão: sem Fluxos configurado, não faz nada. */
export async function syncFluxosConnection(app: string): Promise<boolean> {
  if (!(FLUXOS_SHARED as readonly string[]).includes(app)) return false;
  try {
    const { data, error } = await supabase.functions.invoke('creative-router', {
      body: { tool: 'automatisch', automatisch: { op: 'sync_connection', app_key: app, confirmed: true } },
    });
    return !error && (data as { ok?: boolean } | null)?.ok === true;
  } catch {
    return false;
  }
}
