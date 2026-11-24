// VERTAL Code AI (plataforma): chaves da API VERTAL do desenvolvedor e modo Operação
// do operador. Chama as edge functions vertal-ai-api (/keys) e vertal-code-ai-admin.
import { supabase } from '@/integrations/supabase/client';

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export interface ApprovalCard {
  approvalId: string;
  token: string;
  tool: string;
  text: string;
  args: unknown;
}

export interface OpsAskResponse {
  reply: string;
  results: Array<{ tool: string; ok: boolean; result: unknown }>;
  approvals: ApprovalCard[];
}

export interface OpsAttachment {
  name: string;
  kind: 'text';
  data: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  monthly_cap_credits: number | null;
  rpm: number;
  spent_micro: number;
  spent_period: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export class PlatformError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(fn: string, body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new PlatformError('Entre na sua conta.', 401);
  const r = await fetchImpl(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = (data as { error?: unknown }).error;
    const msg = typeof err === 'string' ? err : typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : `Falha (${r.status}).`;
    throw new PlatformError(msg === 'disabled' || msg === 'not_found' ? 'Indisponível.' : msg, r.status);
  }
  return data as T;
}

/** Modo Operação (só o operador; para qualquer outro o servidor responde 404). */
export const opsApi = {
  /** true só para o operador. Qualquer erro (404, desligado, rede) = false. */
  isOperator: () => call<{ operator: boolean }>('vertal-code-ai-admin', { action: 'whoami' }).then((r) => r.operator === true).catch(() => false),
  ask: (prompt: string, attachments?: OpsAttachment[]) => call<OpsAskResponse>('vertal-code-ai-admin', { action: 'ask', prompt, attachments }),
  decide: (card: ApprovalCard, decision: 'approve' | 'reject') =>
    call<{ ok: boolean; status: string; result?: unknown }>('vertal-code-ai-admin', { action: 'approve', approvalId: card.approvalId, token: card.token, decision }),
  report: (period: 'daily' | 'weekly') => call<{ report: string }>('vertal-code-ai-admin', { action: 'report', period }),
};

/** Chaves da API VERTAL do próprio desenvolvedor (o servidor filtra pelo dono). */
export const keysApi = {
  list: () => call<{ keys: ApiKeyRecord[] }>('vertal-ai-api/keys', { action: 'list' }),
  create: (name: string, monthlyCapCredits: number | null) => call<{ key: string; record: ApiKeyRecord }>('vertal-ai-api/keys', { action: 'create', name, monthlyCapCredits }),
  revoke: (id: string) => call<{ ok: boolean }>('vertal-ai-api/keys', { action: 'revoke', id }),
};
