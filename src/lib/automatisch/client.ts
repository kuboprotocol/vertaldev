// Cliente das operações do Automatisch do agente (creative-router, tool "automatisch").
// O navegador só manda a operação já aprovada pelo usuário (confirmed: true).
// URL, e-mail e senha da instância ficam no Cofre de segredos e o login é feito
// no servidor: nada disso (nem o token) passa por aqui.
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';
import {
  AUTOMATISCH_ERROR_MESSAGES, AUTOMATISCH_SECRETS, type AutomatischOp,
} from '../../../supabase/functions/_shared/automatischCore';

export interface AutomatischCallResult {
  ok: boolean;
  code?: string;
  /** Texto para o agente (DADOS) e para o usuário. */
  message: string;
  /** Segredos que faltam no Cofre (só com code "missing_secrets"). */
  missing?: string[];
  data?: unknown;
}

const RATE = 'Muitos pedidos ao Vertal Fluxos em pouco tempo. Aguarde um minuto.';

export async function callAutomatischOp(op: AutomatischOp): Promise<AutomatischCallResult> {
  const { data, error } = await supabase.functions.invoke('creative-router', {
    body: { tool: 'automatisch', automatisch: { ...op, confirmed: true } },
  });
  if (error) {
    let missing: string[] = [];
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      const body = await (ctx as Response).clone().json().catch(() => null);
      if (Array.isArray(body?.missing)) missing = body.missing.filter((m: unknown): m is string => typeof m === 'string');
    }
    const code = (await functionErrorCode(error)) ?? 'automatisch_error';
    if (code === 'missing_secrets') {
      const names = missing.length ? missing : [...AUTOMATISCH_SECRETS];
      return { ok: false, code, missing: names, message: `Falta salvar no Cofre de segredos: ${names.join(', ')}.` };
    }
    if (code.startsWith('rate_limit')) return { ok: false, code: 'rate_limited', message: RATE };
    return { ok: false, code, message: AUTOMATISCH_ERROR_MESSAGES[code] ?? AUTOMATISCH_ERROR_MESSAGES.automatisch_error };
  }
  const d = (data ?? {}) as { ok?: unknown; code?: unknown; message?: unknown; summary?: unknown; data?: unknown };
  if (d.ok !== true) {
    const code = typeof d.code === 'string' ? d.code : 'automatisch_error';
    const message = typeof d.message === 'string' && d.message ? d.message : AUTOMATISCH_ERROR_MESSAGES[code] ?? AUTOMATISCH_ERROR_MESSAGES.automatisch_error;
    return { ok: false, code, message };
  }
  return { ok: true, message: typeof d.summary === 'string' ? d.summary : 'Pronto.', data: d.data };
}
