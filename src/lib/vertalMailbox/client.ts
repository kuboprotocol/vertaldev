// Vertal Mail · cliente (navegador). Desligado por padrão: só aparece com VITE_VERTAL_MAILBOX=true
// E o servidor liberando este usuário (VERTAL_GPU_CONFIG.VERTAL_MAILBOX na edge function vertal-code-ai).
// Com qualquer um dos dois desligado, /emails continua exatamente como antes (registro de envios).
import { supabase } from '@/integrations/supabase/client';
import { functionUrl } from '@/lib/vertalCodeAi/client';

type EnvLike = Record<string, unknown> | undefined;

export function isVertalMailboxEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_MAILBOX;
  return v === true || v === 'true' || v === '1';
}

export class MailboxError extends Error {
  constructor(public code: string, public detail: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function callMailbox<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {},
  opts: { fetchImpl?: typeof fetch; url?: string; token?: string } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new MailboxError('not_signed_in');
  let r: Response;
  try {
    r = await (opts.fetchImpl ?? fetch)(opts.url ?? functionUrl(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mailbox', op, ...payload }),
    });
  } catch (e) {
    throw new MailboxError('network', { message: e instanceof Error ? e.message : String(e) });
  }
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new MailboxError(String(data.error ?? `http_${r.status}`), data);
  return data as T;
}

export interface MailAddress {
  id: string; address: string; local_part: string; domain: string; display_name: string | null;
  signature: string | null; crm_feed: boolean; active: boolean; created_at: string;
}
export interface MailListItem {
  id: string; address_id: string; direction: 'in' | 'out'; folder: string; status: string; from_address: string;
  from_name: string | null; to_addresses: Array<{ name: string; email: string }>; subject: string; snippet: string;
  has_attachments: boolean; read_at: string | null; created_at: string; thread_key: string | null;
}
export interface MailMessage extends MailListItem {
  cc_addresses: Array<{ name: string; email: string }>; text_body: string; html_body: string | null;
  attachments: Array<{ filename: string; mimeType: string; size: number }>; reply_to: string | null; error: string | null;
}
export interface MailAccounts {
  gmail: Array<{ id: string; email: string; name: string | null; crmFeed: boolean; lastSyncedAt: string | null; lastResult: Record<string, unknown> | null }>;
  outlook: { connected: boolean; label: string | null; crmFeed: boolean; lastSyncedAt: string | null; lastResult: Record<string, unknown> | null };
}
export interface MailStatus {
  ok: true; enabled: true;
  config: { aliasDomains: string[]; outboundDomains: string[]; dailySendCap: number; outbound: boolean };
  addresses: MailAddress[]; accounts: MailAccounts; crmEnabled: boolean; unread: number;
}

/** Soma das notas/contatos de uma resposta de crm_sync (para o aviso). */
export function syncTotals(results: Record<string, unknown> | undefined): { notes: number; contacts: number } {
  let notes = 0, contacts = 0;
  for (const r of Object.values(results ?? {})) {
    const x = r as { notesAdded?: number; contactsCreated?: number } | null;
    notes += Number(x?.notesAdded) || 0;
    contacts += Number(x?.contactsCreated) || 0;
  }
  return { notes, contacts };
}

/** Subpágina de cada conta conectada, dentro de Conectores. */
export const mailAccountPath = (source: 'gmail' | 'outlook', id?: string) =>
  source === 'gmail' ? `/connectors/gmail/${id}/inbox` : '/connectors/microsoft-outlook/inbox';
