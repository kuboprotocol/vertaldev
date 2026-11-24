// VERTAL Code AI · quem pode ver a entrada/rota.
// Além do interruptor de build (VITE_VERTAL_CODE_AI), o servidor decide por usuário
// (VERTAL_CODE_AI_USER_IDS). Sem "sim" do servidor, nada aparece.
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionUrl, isVertalCodeAiEnabled } from './client';

export type VcaAccess = 'checking' | 'allowed' | 'denied';

/** Pergunta ao servidor se o portador do token está liberado. Qualquer falha = não liberado. */
export async function fetchVcaAccess(token: string, fetchImpl: typeof fetch = fetch, url: string = functionUrl()): Promise<boolean> {
  if (!token) return false;
  try {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    if (!r.ok) return false;
    const d = (await r.json().catch(() => null)) as { allowed?: unknown } | null;
    return d?.allowed === true;
  } catch {
    return false;
  }
}

// Cache por usuário (uma checagem por sessão de página).
const cache = new Map<string, Promise<boolean>>();

export function resetVcaAccessCache(): void {
  cache.clear();
}

async function checkCurrentUser(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token || !session.user?.id) return false;
  const key = session.user.id;
  let p = cache.get(key);
  if (!p) {
    p = fetchVcaAccess(session.access_token);
    cache.set(key, p);
    p.then((ok) => {
      if (!ok) cache.delete(key); // deixa tentar de novo depois (ex.: login trocado)
    });
  }
  return p;
}

/** Hook: 'allowed' só quando o build liga E o servidor libera este usuário. */
export function useVertalCodeAiAccess(enabledOverride?: boolean): VcaAccess {
  const buildOn = isVertalCodeAiEnabled();
  const [state, setState] = useState<VcaAccess>(() =>
    enabledOverride === true ? 'allowed' : enabledOverride === false || !buildOn ? 'denied' : 'checking',
  );
  useEffect(() => {
    if (enabledOverride !== undefined || !buildOn) return;
    let alive = true;
    checkCurrentUser()
      .then((ok) => alive && setState(ok ? 'allowed' : 'denied'))
      .catch(() => alive && setState('denied'));
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') {
        checkCurrentUser()
          .then((ok) => alive && setState(ok ? 'allowed' : 'denied'))
          .catch(() => alive && setState('denied'));
      }
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, [enabledOverride, buildOn]);
  return state;
}
