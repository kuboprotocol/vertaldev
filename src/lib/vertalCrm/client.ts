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
  opts: { token?: string; fetchImpl?: typeof fetch; url?: string; timeoutMs?: number } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new CrmError('not_signed_in');
  // Prazo opcional: sem ele, uma resposta que não chega deixava o diálogo girando para sempre.
  const ctrl = opts.timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : undefined;
  let r: Response;
  try {
    r = await (opts.fetchImpl ?? fetch)(opts.url ?? crmFunctionUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, ...payload }),
      signal: ctrl?.signal,
    });
  } catch (e) {
    throw new CrmError(ctrl?.signal.aborted ? 'timeout' : 'network', { message: e instanceof Error ? e.message : String(e) });
  } finally {
    clearTimeout(timer);
  }
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new CrmError(String(data.error ?? `http_${r.status}`), data);
  return data as T;
}

export const AI_ATTEMPT_MS = 40_000;
export const AI_TOTAL_MS = 150_000;
export const AI_POLL_MS = 4_000;

/**
 * Ação de IA (1 crédito) resistente a conexão que cai: se a resposta não chega (prazo/rede) ou o servidor diz que o
 * mesmo pedido ainda está rodando (in_progress), repete com a MESMA chave — o servidor devolve o resultado guardado,
 * sem cobrar de novo. Se a IA falhou, o servidor já devolveu o crédito (refunded).
 */
export async function callCrmAi<T = Record<string, unknown>>(
  payload: Record<string, unknown> & { idempotencyKey: string },
  opts: {
    call?: (op: string, payload: Record<string, unknown>, o: { timeoutMs: number }) => Promise<T>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    totalMs?: number;
    onWaiting?: (attempt: number) => void;
  } = {},
): Promise<T> {
  const call = opts.call ?? ((op, p, o) => callCrm<T>(op, p, o));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.totalMs ?? AI_TOTAL_MS);
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await call('ai', payload, { timeoutMs: AI_ATTEMPT_MS });
    } catch (e) {
      const code = e instanceof CrmError ? e.code : '';
      const retryable = code === 'timeout' || code === 'network' || code === 'in_progress' || /^http_5(02|03|04|46)$/.test(code);
      if (!retryable) throw e;
      if (now() + AI_POLL_MS >= deadline) throw new CrmError('ai_slow', { attempts: attempt });
      opts.onWaiting?.(attempt);
      await sleep(AI_POLL_MS);
    }
  }
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
