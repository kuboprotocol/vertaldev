// Vertal CRM · cliente (navegador). Desligado por padrão: só aparece com VITE_VERTAL_CRM=true
// E o servidor liberando este usuário (VERTAL_CRM_ENABLED + VERTAL_CRM_USER_IDS na edge function vertal-code-ai).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionUrl } from '@/lib/vertalCodeAi/client';
import { CRM_NAME, CRM_ROUTE } from '../../../supabase/functions/_shared/vertalCrm/core';

export { CRM_NAME };
export const VERTAL_CRM_ROUTE = CRM_ROUTE;

type EnvLike = Record<string, unknown> | undefined;

/** Interruptor do front-end. Qualquer valor diferente de "true"/"1" = desligado. */
export function isVertalCrmEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_CRM;
  return v === true || v === 'true' || v === '1';
}

export const crmFunctionUrl = (base?: string) => `${functionUrl(base)}?app=crm`;

export class CrmError extends Error {
  constructor(public code: string, public detail: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function callCrm<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {},
  opts: { token?: string; fetchImpl?: typeof fetch; url?: string } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new CrmError('not_signed_in');
  const r = await (opts.fetchImpl ?? fetch)(opts.url ?? crmFunctionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...payload }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new CrmError(String(data.error ?? `http_${r.status}`), data);
  return data as T;
}

export const newIdempotencyKey = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

export type CrmAccess = 'checking' | 'allowed' | 'denied';

export async function fetchCrmAccess(token: string, fetchImpl: typeof fetch = fetch, url?: string): Promise<boolean> {
  if (!token) return false;
  try {
    await callCrm('status', {}, { token, fetchImpl, url });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, Promise<boolean>>();
export function resetCrmAccessCache(): void {
  cache.clear();
}

/** Hook: 'allowed' só quando o build liga E o servidor libera este usuário. */
export function useVertalCrmAccess(enabledOverride?: boolean): CrmAccess {
  const buildOn = isVertalCrmEnabled();
  const [state, setState] = useState<CrmAccess>(() =>
    enabledOverride === true ? 'allowed' : enabledOverride === false || !buildOn ? 'denied' : 'checking',
  );
  useEffect(() => {
    if (enabledOverride !== undefined || !buildOn) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!s?.access_token || !s.user?.id) return false;
      let p = cache.get(s.user.id);
      if (!p) {
        p = fetchCrmAccess(s.access_token);
        cache.set(s.user.id, p);
        p.then((ok) => {
          if (!ok) cache.delete(s.user.id);
        });
      }
      return p;
    })()
      .then((ok) => alive && setState(ok ? 'allowed' : 'denied'))
      .catch(() => alive && setState('denied'));
    return () => {
      alive = false;
    };
  }, [buildOn, enabledOverride]);
  return state;
}

// ─── CRUD direto pelo PostgREST (RLS por workspace). Grátis: não passa pela edge function. ───
// As tabelas crm_* não estão nos tipos gerados do Supabase; o acesso é tipado aqui.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const crmDb = () => supabase as unknown as { from: (t: string) => any; storage: typeof supabase.storage };

export const CRM_BUCKET = 'crm-attachments';

/** Caminho do anexo: <workspace>/<usuário>/<uuid>-<nome> (a policy do Storage exige a pasta do próprio usuário). */
export function attachmentPath(workspaceId: string, userId: string, fileName: string, id = newIdempotencyKey()): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'arquivo';
  return `${workspaceId}/${userId}/${id}-${safe}`;
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\uFEFF', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
