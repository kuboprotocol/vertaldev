// Cliente das operações do Huginn do agente (creative-router, tool "huginn").
// O navegador só manda a operação já aprovada pelo usuário (confirmed: true).
// URL, usuário e senha da instância ficam no Cofre de segredos e o login é
// feito no servidor: nada disso (nem o cookie da sessão) passa por aqui.
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';
import { AUTOMATISCH_SECRETS } from '../../../supabase/functions/_shared/automatischCore';
import {
  HUGINN_ERROR_MESSAGES, HUGINN_SECRETS, isHuginnBridge, type HuginnOp,
} from '../../../supabase/functions/_shared/huginnCore';

export interface HuginnCallResult {
  ok: boolean;
  code?: string;
  /** Texto para o agente (DADOS) e para o usuário. */
  message: string;
  /** Segredos que faltam no Cofre (só com code "missing_secrets"). */
  missing?: string[];
  data?: unknown;
}

const RATE = 'Muitos pedidos ao Huginn em pouco tempo. Aguarde um minuto.';

/** Nomes dos segredos que a operação usa (a ponte também usa os do Automatisch). */
export const huginnSecretsFor = (op: HuginnOp): string[] =>
  isHuginnBridge(op) ? [...HUGINN_SECRETS, ...AUTOMATISCH_SECRETS] : [...HUGINN_SECRETS];

export async function callHuginnOp(op: HuginnOp): Promise<HuginnCallResult> {
  const { data, error } = await supabase.functions.invoke('creative-router', {
    body: { tool: 'huginn', huginn: { ...op, confirmed: true } },
  });
  if (error) {
    let missing: string[] = [];
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      const body = await (ctx as Response).clone().json().catch(() => null);
      if (Array.isArray(body?.missing)) missing = body.missing.filter((m: unknown): m is string => typeof m === 'string');
    }
    const code = (await functionErrorCode(error)) ?? 'huginn_error';
    if (code === 'missing_secrets') {
      const names = missing.length ? missing : huginnSecretsFor(op);
      return { ok: false, code, missing: names, message: `Falta salvar no Cofre de segredos: ${names.join(', ')}.` };
    }
    if (code.startsWith('rate_limit')) return { ok: false, code: 'rate_limited', message: RATE };
    return { ok: false, code, message: HUGINN_ERROR_MESSAGES[code] ?? HUGINN_ERROR_MESSAGES.huginn_error };
  }
  const d = (data ?? {}) as { ok?: unknown; code?: unknown; message?: unknown; summary?: unknown; data?: unknown };
  if (d.ok !== true) {
    const code = typeof d.code === 'string' ? d.code : 'huginn_error';
    const message = typeof d.message === 'string' && d.message ? d.message : HUGINN_ERROR_MESSAGES[code] ?? HUGINN_ERROR_MESSAGES.huginn_error;
    return { ok: false, code, message };
  }
  return { ok: true, message: typeof d.summary === 'string' ? d.summary : 'Pronto.', data: d.data };
}
