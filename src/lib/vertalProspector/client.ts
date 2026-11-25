// Vertal Prospector · cliente (navegador). Desligado por padrão: só aparece com
// VITE_VERTAL_PROSPECTOR=true E o servidor liberando este usuário (VERTAL_PROSPECTOR_USER_IDS).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { functionUrl } from '@/lib/vertalCodeAi/client';
import {
  isProspectCommand,
  parseProspectCommand,
  PROSPECTOR_NAME,
} from '../../../supabase/functions/_shared/vertalProspector/core';

export { isProspectCommand, parseProspectCommand, PROSPECTOR_NAME };

export const VERTAL_PROSPECTOR_ROUTE = '/vertal-code-ai/prospector';

type EnvLike = Record<string, unknown> | undefined;

/** Interruptor do front-end. Qualquer valor diferente de "true"/"1" = desligado. */
export function isVertalProspectorEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_PROSPECTOR;
  return v === true || v === 'true' || v === '1';
}

export function vertalProspectorHref(opts: { companyName?: string; cnpj?: string; website?: string; from?: 'chat' | 'code' } = {}): string {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.companyName?.trim()) q.set('empresa', opts.companyName.trim().slice(0, 120));
  if (opts.cnpj?.trim()) q.set('cnpj', opts.cnpj.trim().slice(0, 20));
  if (opts.website?.trim()) q.set('site', opts.website.trim().slice(0, 300));
  const s = q.toString();
  return s ? `${VERTAL_PROSPECTOR_ROUTE}?${s}` : VERTAL_PROSPECTOR_ROUTE;
}

/** Comando "prospectar clientes …" do Vertal Chat → endereço da tela com os campos já preenchidos. */
export function vertalProspectorHrefFromChat(text: string): string {
  return vertalProspectorHref({ ...parseProspectCommand(text), from: 'chat' });
}

export function readProspectorHandoff(search: string): { companyName: string; cnpj: string; website: string; from: string } {
  const q = new URLSearchParams(search);
  return {
    companyName: (q.get('empresa') ?? '').slice(0, 120),
    cnpj: (q.get('cnpj') ?? '').replace(/[^\d./-]/g, '').slice(0, 20),
    website: (q.get('site') ?? '').slice(0, 300),
    from: q.get('from') ?? '',
  };
}

export class ProspectorError extends Error {
  constructor(public code: string, public detail: Record<string, unknown> = {}) {
    super(code);
  }
}

/** Chama uma operação do Vertal Prospector na edge function. */
export async function callProspector<T = Record<string, unknown>>(
  op: string,
  payload: Record<string, unknown> = {},
  opts: { token?: string; fetchImpl?: typeof fetch; url?: string } = {},
): Promise<T> {
  let token = opts.token;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? '';
  }
  if (!token) throw new ProspectorError('not_signed_in');
  const r = await (opts.fetchImpl ?? fetch)(opts.url ?? functionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prospector', op, ...payload }),
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ProspectorError(String(data.error ?? `http_${r.status}`), data);
  return data as T;
}

export type ProspectorAccess = 'checking' | 'allowed' | 'denied';

/** Pergunta ao servidor (op status). Qualquer falha = não liberado. */
export async function fetchProspectorAccess(token: string, fetchImpl: typeof fetch = fetch, url?: string): Promise<boolean> {
  if (!token) return false;
  try {
    await callProspector('status', {}, { token, fetchImpl, url });
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, Promise<boolean>>();
export function resetProspectorAccessCache(): void {
  cache.clear();
}

/** Hook: 'allowed' só quando o build liga E o servidor libera este usuário. */
export function useVertalProspectorAccess(enabledOverride?: boolean): ProspectorAccess {
  const buildOn = isVertalProspectorEnabled();
  const [state, setState] = useState<ProspectorAccess>(() =>
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
        p = fetchProspectorAccess(s.access_token);
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
  }, [enabledOverride, buildOn]);
  return state;
}

export const PROSPECTOR_ERROR_TEXT: Record<string, string> = {
  vertal_prospector_disabled: 'O Vertal Prospector não está liberado na sua conta.',
  vertal_code_ai_disabled: 'O Vertal Prospector não está liberado na sua conta.',
  rate_limited: 'Muitos pedidos em sequência. Espere um minuto.',
  company_name_required: 'Escreva o nome da empresa.',
  invalid_cnpj: 'Esse CNPJ não é válido (confira os dígitos).',
  invalid_website: 'Esse site não parece válido.',
  model_failed: 'A IA não respondeu agora. Tente de novo em instantes.',
  icp_incomplete: 'Falta informação no cliente ideal para buscar empresas.',
  icp_not_confirmed: 'Confirme o cliente ideal antes de buscar empresas.',
  area_not_found: 'Não achei essa região no mapa.',
  map_busy: 'O mapa aberto está ocupado agora. Tente em 1 ou 2 minutos.',
  map_failed: 'A busca no mapa falhou. Tente de novo.',
  no_channel: 'Sem e-mail utilizável nem telefone para este lead.',
  message_locked: 'Essa mensagem já saiu e não pode ser editada.',
  send_blocked: 'Envio bloqueado pelas regras de segurança.',
  gmail_account_required: 'Conecte o Gmail em Conectores para enviar.',
  gmail_account_unavailable: 'Não consegui usar o Gmail conectado. Reconecte em Conectores.',
  gmail_needs_reconsent: 'O Gmail precisa ser reconectado (permissão).',
  gmail_send_failed: 'O Gmail recusou o envio. Nada foi enviado.',
  first_not_sent: 'Envie o primeiro e-mail antes do follow-up.',
  followup_not_due: 'Ainda não é hora deste follow-up.',
  whatsapp_is_manual: 'WhatsApp é enviado por você, pelo link.',
  invalid_phone: 'Telefone inválido para WhatsApp.',
  invalid_email: 'E-mail inválido.',
  invalid_booking_link: 'O link de agenda precisa começar com https://',
  not_signed_in: 'Entre na sua conta.',
  prospector_failed: 'Algo deu errado no servidor.',
};

export function prospectorErrorText(e: unknown): string {
  const code = e instanceof ProspectorError ? e.code : e instanceof Error ? e.message : String(e);
  const extra = e instanceof ProspectorError ? (e.detail.finding as string | undefined) ?? (Array.isArray(e.detail.problems) ? (e.detail.problems as string[]).join('; ') : '') : '';
  const base = PROSPECTOR_ERROR_TEXT[code] ?? 'Algo deu errado. Tente de novo.';
  return extra ? `${base} ${extra}` : base;
}

/** Baixa o CSV no navegador (com BOM para o Excel abrir acentos certo). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
